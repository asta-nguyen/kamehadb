package duckdriver

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// A separately built release-version helper exercises the real install ->
// verified execution -> handshake -> native DB path using a private mirror.
func TestNativeReleaseInstallOfflineAndProtocol(t *testing.T) {
	path, version := os.Getenv("KAMEHADB_TEST_RELEASE_DUCKDB_DRIVER"), os.Getenv("KAMEHADB_TEST_RELEASE_DUCKDB_VERSION")
	if path == "" || version == "" {
		t.Skip("set explicit private release-helper path/version")
	}
	binary, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	compressed, err := os.ReadFile(path + ".gz")
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(binary)
	checksum := hex.EncodeToString(hash[:])
	oldVersion := ReleaseVersion
	ReleaseVersion = version
	t.Cleanup(func() { ReleaseVersion = oldVersion })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(compressed) }))
	defer server.Close()
	platform, err := platformName(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Fatal(err)
	}
	opts := installOptions{version: version, checksum: checksum, platform: platform, origin: server.URL, client: server.Client()}
	root := t.TempDir()
	installed, err := resolve(context.Background(), root, opts)
	if err != nil {
		t.Fatal(err)
	}
	if installed == path {
		t.Fatal("test bypassed installation")
	}
	spill := filepath.Join(root, "private-spill")
	if err := os.Mkdir(spill, 0o700); err != nil {
		t.Fatal(err)
	}
	input := OpenInput{FilePath: filepath.Join(root, "fixture.duckdb"), TempDir: spill}
	client, err := Start(context.Background(), installed, input)
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Call(context.Background(), MethodQuery, engines.RunQueryInput{Query: "CREATE TABLE private_rows(id BIGINT)"}, nil); err != nil {
		t.Fatal(err)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	server.Close()
	cached, err := resolve(context.Background(), root, opts)
	if err != nil {
		t.Fatalf("offline verified cache: %v", err)
	}
	client, err = Start(context.Background(), cached, input)
	if err != nil {
		t.Fatalf("real offline reopen: %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	ReleaseVersion = "v0.0.0-incompatible"
	if client, err := Start(context.Background(), cached, input); err == nil {
		client.Close()
		t.Fatal("native mismatched version accepted")
	}
}
