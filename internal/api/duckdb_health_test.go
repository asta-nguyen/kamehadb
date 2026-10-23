package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/duckdriver"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// Saved DuckDB profiles participate in startup health without downloading,
// spawning helpers or creating missing user database files.
func TestBackgroundDuckDBHealthDoesNotInitializeDriver(t *testing.T) {
	root := t.TempDir()
	data := filepath.Join(root, "driver-data")
	t.Setenv("KAMEHADB_DATA_DIR", data)
	t.Setenv(duckdriver.LocalDriverEnv, filepath.Join(root, "missing-helper"))
	metadata, err := store.Open(filepath.Join(root, "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()
	name, kind, file := "private inactive DuckDB", engines.KindDuckDB, filepath.Join(root, "missing.duckdb")
	profile, err := metadata.CreateProfile(store.ProfileInput{Name: &name, Kind: &kind, FilePath: &file})
	if err != nil {
		t.Fatal(err)
	}
	registry := testDB(t, metadata)
	defer registry.Close()
	service := NewConnectionsService(metadata, registry)
	for range 2 {
		results, err := service.CheckAllHealth()
		if err != nil {
			t.Fatal(err)
		}
		if results[profile.ID].Success || !strings.Contains(results[profile.ID].Message, "optional driver") {
			t.Fatal(results)
		}
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("background health created a database", err)
	}
	if _, err := os.Stat(data); !os.IsNotExist(err) {
		t.Fatal("background health created an install/spill directory", err)
	}
}
