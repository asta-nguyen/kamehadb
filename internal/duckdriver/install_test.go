package duckdriver

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func compressedDriver(t *testing.T, content []byte) ([]byte, string) {
	t.Helper()
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	if _, err := writer.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(content)
	return buffer.Bytes(), hex.EncodeToString(hash[:])
}

func TestInstallerVerifiedCacheConcurrentAndCorruptReuse(t *testing.T) {
	content := []byte("private synthetic executable fixture")
	compressed, checksum := compressedDriver(t, content)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.URL.Path != "/v0.0.0-test/kamehadb-duckdb-driver-linux-amd64.gz" {
			t.Errorf("wrong fixed asset: %s", r.URL)
		}
		_, _ = w.Write(compressed)
	}))
	defer server.Close()
	opts := installOptions{version: "v0.0.0-test", checksum: checksum, platform: "linux-amd64", origin: server.URL, client: server.Client()}
	root := t.TempDir()
	var wg sync.WaitGroup
	paths := make(chan string, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			path, err := resolve(context.Background(), root, opts)
			if err != nil {
				t.Error(err)
				return
			}
			paths <- path
		}()
	}
	wg.Wait()
	close(paths)
	if requests.Load() != 1 {
		t.Fatalf("duplicate downloads: %d", requests.Load())
	}
	var path string
	for path = range paths {
		got, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(got, content) {
			t.Fatalf("installed content: %q %v", got, err)
		}
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm() != 0o700 {
			t.Fatalf("driver permissions: %v %v", info, err)
		}
	}
	if err := os.WriteFile(path, []byte("corrupted"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := resolve(context.Background(), root, opts); err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 2 {
		t.Fatal("corrupt cache trusted")
	}
	server.Close()
	if _, err := resolve(context.Background(), root, opts); err != nil {
		t.Fatalf("verified offline reuse: %v", err)
	}
	files, _ := filepath.Glob(filepath.Join(filepath.Dir(path), ".download-*"))
	if len(files) != 0 {
		t.Fatalf("download remnants: %v", files)
	}
}

func TestInstallerFailuresNeverPromoteDownloads(t *testing.T) {
	compressed, checksum := compressedDriver(t, []byte("fixture"))
	for _, mode := range []string{"missing", "hash", "oversized", "broken-gzip", "cancel"} {
		t.Run(mode, func(t *testing.T) {
			started := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				close(started)
				switch mode {
				case "missing":
					w.WriteHeader(http.StatusNotFound)
				case "oversized":
					w.Header().Set("Content-Length", fmt.Sprint(maxDownloadBytes+1))
					w.WriteHeader(http.StatusOK)
				case "broken-gzip":
					_, _ = w.Write([]byte("not gzip"))
				case "cancel":
					<-r.Context().Done()
				default:
					_, _ = w.Write(compressed)
				}
			}))
			defer server.Close()
			opts := installOptions{version: "v0.0.0-test", checksum: checksum, platform: "linux-amd64", origin: server.URL, client: server.Client()}
			if mode == "hash" {
				opts.checksum = strings.Repeat("0", sha256.Size*2)
			}
			root := t.TempDir()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if mode == "cancel" {
				go func() { <-started; cancel() }()
			}
			if path, err := resolve(ctx, root, opts); err == nil || path != "" {
				t.Fatalf("bad asset promoted: %s %v", path, err)
			}
			files, _ := filepath.Glob(filepath.Join(root, "drivers", "duckdb", opts.version, opts.platform, "*"))
			for _, file := range files {
				if filepath.Base(file) != ".install.lock" {
					t.Fatalf("failed asset retained: %s", file)
				}
			}
		})
	}
}

func TestInstallerConfigDevelopmentAndTrust(t *testing.T) {
	if _, err := platformName("linux", "arm64"); err == nil {
		t.Fatal("unsupported release platform accepted")
	}
	if name, err := platformName("darwin", "arm64"); err != nil || name != "macos-universal" {
		t.Fatal(name, err)
	}
	for _, opts := range []installOptions{
		{version: "../tag", checksum: strings.Repeat("0", sha256.Size*2), platform: "linux-amd64"},
		{version: "v1", checksum: "invalid", platform: "linux-amd64"},
		{version: "v1", checksum: strings.Repeat("0", sha256.Size*2), platform: "unknown"},
	} {
		if _, err := resolve(context.Background(), t.TempDir(), opts); err == nil {
			t.Fatal("invalid release configuration accepted")
		}
	}
	client := releaseClient()
	request, _ := http.NewRequest(http.MethodGet, "http://github.com/asset", nil)
	if err := client.CheckRedirect(request, nil); err == nil {
		t.Fatal("HTTP redirect trusted")
	}
	request, _ = http.NewRequest(http.MethodGet, "https://untrusted.example/asset", nil)
	if err := client.CheckRedirect(request, nil); err == nil {
		t.Fatal("foreign redirect trusted")
	}
	t.Setenv(LocalDriverEnv, filepath.Join(t.TempDir(), "locally-built-driver"))
	if path, err := Resolve(context.Background(), t.TempDir()); err != nil || path == "" {
		t.Fatal(path, err)
	}
}

func TestReleaseIgnoresDevOverrideAndRejectsSymlinkCache(t *testing.T) {
	content := []byte("private trusted fixture")
	_, checksum := compressedDriver(t, content)
	version, platform := "v0.0.0-cache-test", "linux-amd64"
	root := t.TempDir()
	dir := filepath.Join(root, "drivers", "duckdb", version, platform)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, assetName(platform))
	if err := os.WriteFile(path, content, 0o700); err != nil {
		t.Fatal(err)
	}
	oldVersion, oldChecksum := ReleaseVersion, ReleaseSHA256
	ReleaseVersion, ReleaseSHA256 = version, checksum
	t.Cleanup(func() { ReleaseVersion, ReleaseSHA256 = oldVersion, oldChecksum })
	t.Setenv(LocalDriverEnv, filepath.Join(root, "untrusted-override"))
	if runtime.GOOS == "linux" && runtime.GOARCH == "amd64" {
		if got, err := Resolve(context.Background(), root); err != nil || got != path {
			t.Fatalf("release override bypass: %s %v", got, err)
		}
	}
	if runtime.GOOS == "windows" {
		return
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "outside")
	if err := os.WriteFile(outside, content, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Fatal(err)
	}
	opts := installOptions{version: version, checksum: checksum, platform: platform}
	if _, err := resolve(context.Background(), root, opts); err == nil {
		t.Fatal("symlinked helper cache trusted")
	}
}

func TestInstallLockConcurrentCancelAndStaleFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".install.lock")
	if err := os.WriteFile(path, []byte("stale file from crashed process"), 0o600); err != nil {
		t.Fatal(err)
	}
	unlock, err := acquireInstallLock(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), installLockPoll)
	defer cancel()
	if release, err := acquireInstallLock(ctx, path); !errors.Is(err, context.DeadlineExceeded) {
		if release != nil {
			release()
		}
		t.Fatalf("second installer was not cancellably excluded: %v", err)
	}
	unlock()
	ctx2, stop := context.WithTimeout(context.Background(), time.Second)
	defer stop()
	unlock2, err := acquireInstallLock(ctx2, path)
	if err != nil {
		t.Fatalf("stale lock file prevented reuse: %v", err)
	}
	unlock2()
}
