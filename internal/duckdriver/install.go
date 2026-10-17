package duckdriver

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sync"
	"time"
)

const (
	LocalDriverEnv   = "KAMEHADB_DUCKDB_DRIVER_PATH"
	releaseOrigin    = "https://github.com/asta-nguyen/kamehadb/releases/download"
	downloadTimeout  = 2 * time.Minute
	maxDownloadBytes = 64 << 20
	maxDriverBytes   = 256 << 20
	maxRedirects     = 5
	installLockPoll  = 50 * time.Millisecond
)

var releaseTag = regexp.MustCompile(`^v[0-9][0-9A-Za-z.-]*$`)

type installOptions struct {
	version, checksum, platform, origin string
	client                              *http.Client
}

type installCall struct {
	done chan struct{}
	path string
	err  error
}

var installations = struct {
	sync.Mutex
	calls map[string]*installCall
}{calls: make(map[string]*installCall)}

func platformName(goos, arch string) (string, error) {
	switch {
	case goos == "darwin" && (arch == "amd64" || arch == "arm64"):
		return "macos-universal", nil
	case goos == "linux" && arch == "amd64":
		return "linux-amd64", nil
	case goos == "windows" && arch == "amd64":
		return "windows-amd64", nil
	default:
		return "", fmt.Errorf("DuckDB managed driver is unavailable for %s/%s", goos, arch)
	}
}

func assetName(platform string) string {
	name := "kamehadb-duckdb-driver-" + platform
	if platform == "windows-amd64" {
		name += ".exe"
	}
	return name
}

// Only trusted HTTPS release redirects are accepted. GitHub serves signed
// assets from its own CDN; a redirect must not switch to an arbitrary origin.
func releaseClient() *http.Client {
	return &http.Client{Timeout: downloadTimeout, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects || req.URL.Scheme != "https" {
			return errors.New("DuckDB driver download rejected an unsafe redirect")
		}
		switch req.URL.Hostname() {
		case "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com":
			return nil
		default:
			return errors.New("DuckDB driver download rejected an untrusted origin")
		}
	}}
}

// Resolve installs only on an explicit call. The development override is
// disabled by a release tag/checksum and never substitutes for release trust.
func Resolve(ctx context.Context, dataDir string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	platform, err := platformName(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return "", err
	}
	if ReleaseVersion == "dev" && ReleaseSHA256 == "" {
		if path := os.Getenv(LocalDriverEnv); path != "" {
			return filepath.Abs(path)
		}
		return "", fmt.Errorf("DuckDB needs its optional driver: build cmd/kamehadb-duckdb-driver and set %s in development", LocalDriverEnv)
	}
	return resolve(ctx, dataDir, installOptions{
		version: ReleaseVersion, checksum: ReleaseSHA256, platform: platform,
		origin: releaseOrigin, client: releaseClient(),
	})
}

// Singleflight avoids duplicate hashes/downloads in one process; the native
// file lock inside install also coordinates independent app instances.
func resolve(ctx context.Context, dataDir string, opts installOptions) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if !releaseTag.MatchString(opts.version) {
		return "", errors.New("DuckDB driver release version is not configured")
	}
	checksum, err := hex.DecodeString(opts.checksum)
	if err != nil || len(checksum) != sha256.Size {
		return "", errors.New("DuckDB driver release checksum is not configured")
	}
	if opts.platform != "linux-amd64" && opts.platform != "windows-amd64" && opts.platform != "macos-universal" {
		return "", errors.New("DuckDB managed driver platform is unsupported")
	}
	dir := filepath.Join(dataDir, "drivers", "duckdb", opts.version, opts.platform)
	key := dir + ":" + opts.checksum
	installations.Lock()
	if call := installations.calls[key]; call != nil {
		installations.Unlock()
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-call.done:
			return call.path, call.err
		}
	}
	call := &installCall{done: make(chan struct{})}
	installations.calls[key] = call
	installations.Unlock()

	call.path, call.err = install(ctx, dir, opts)
	installations.Lock()
	delete(installations.calls, key)
	close(call.done)
	installations.Unlock()
	return call.path, call.err
}

func privateDir(path string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("DuckDB driver directory must not be a symlink")
	}
	return os.Chmod(path, 0o700)
}

// Verify on every reuse, not merely after installation. Never execute a
// replaced, partial, symlinked or untrusted cache entry.
func verifyFile(ctx context.Context, path, checksum string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Size() > maxDriverBytes {
		return errors.New("DuckDB cached driver is not a bounded regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha256.New()
	buffer := make([]byte, 32<<10)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, err := file.Read(buffer)
		if n > 0 {
			_, _ = hash.Write(buffer[:n])
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	if hex.EncodeToString(hash.Sum(nil)) != checksum {
		return errors.New("DuckDB cached driver checksum does not match this release")
	}
	return nil
}

func install(ctx context.Context, dir string, opts installOptions) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, downloadTimeout)
	defer cancel()
	if err := privateDir(dir); err != nil {
		return "", err
	}
	unlock, err := acquireInstallLock(ctx, filepath.Join(dir, ".install.lock"))
	if err != nil {
		return "", err
	}
	defer unlock()
	path := filepath.Join(dir, assetName(opts.platform))
	if err := verifyFile(ctx, path, opts.checksum); err == nil {
		if err := os.Chmod(path, 0o700); err != nil {
			return "", err
		}
		return path, nil
	} else if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return "", errors.New("Remove the non-regular cached DuckDB driver before retrying")
		}
		if err := os.Remove(path); err != nil {
			return "", err
		}
	}
	endpoint, err := url.JoinPath(opts.origin, opts.version, assetName(opts.platform)+".gz")
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	resp, err := opts.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("DuckDB driver unavailable; retry when online: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("DuckDB driver asset unavailable (HTTP %d); retry after its matching release is published", resp.StatusCode)
	}
	if resp.ContentLength > maxDownloadBytes {
		return "", errors.New("DuckDB driver download exceeds its size limit")
	}
	compressed := &io.LimitedReader{R: resp.Body, N: maxDownloadBytes + 1}
	reader, err := gzip.NewReader(compressed)
	if err != nil {
		return "", fmt.Errorf("DuckDB driver gzip: %w", err)
	}
	defer reader.Close()
	file, err := os.CreateTemp(dir, ".download-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(reader, maxDriverBytes+1))
	if err != nil {
		return "", fmt.Errorf("DuckDB driver download: %w", err)
	}
	if written > maxDriverBytes || compressed.N <= 0 {
		return "", errors.New("DuckDB driver download exceeds its size limit")
	}
	if hex.EncodeToString(hash.Sum(nil)) != opts.checksum {
		return "", errors.New("DuckDB driver checksum mismatch; the download was not installed")
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if err := file.Chmod(0o700); err != nil {
		return "", err
	}
	if err := file.Sync(); err != nil {
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return "", err
	}
	return path, nil
}
