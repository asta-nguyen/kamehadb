package maintenance

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func makeSQLiteDB(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "src.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('keepme');"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	return path
}

func tableCount(t *testing.T, path string) int {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM t").Scan(&n); err != nil {
		t.Fatalf("backup is not a readable copy: %v", err)
	}
	return n
}

func TestBackupSQLite(t *testing.T) {
	dir := t.TempDir()
	src := makeSQLiteDB(t, dir)
	out := filepath.Join(dir, "nested", "backup.db")

	res, err := BackupFileDatabase(engines.KindSQLite, src, out)
	if err != nil {
		t.Fatal(err)
	}
	if res.Path != out {
		t.Fatalf("path: %q", res.Path)
	}
	if tableCount(t, out) != 1 {
		t.Fatal("backup lost rows")
	}
}

func TestBackupGuards(t *testing.T) {
	dir := t.TempDir()
	src := makeSQLiteDB(t, dir)

	var mErr *MaintenanceError
	if _, err := BackupFileDatabase(engines.KindPostgres, src, filepath.Join(dir, "x")); !errors.As(err, &mErr) || mErr.Code != ErrNotFileDatabase {
		t.Fatalf("want not-file-database, got %v", err)
	}
	if _, err := BackupFileDatabase(engines.KindSQLite, "", filepath.Join(dir, "x")); !errors.As(err, &mErr) || mErr.Code != ErrMissingFilePath {
		t.Fatalf("want missing-file-path, got %v", err)
	}
	if _, err := BackupFileDatabase(engines.KindSQLite, filepath.Join(dir, "nope.db"), filepath.Join(dir, "x")); !errors.As(err, &mErr) || mErr.Code != ErrMissingSourceFile {
		t.Fatalf("want missing-source-file, got %v", err)
	}
	if _, err := BackupFileDatabase(engines.KindSQLite, src, src); !errors.As(err, &mErr) || mErr.Code != ErrSamePath {
		t.Fatalf("want same-path, got %v", err)
	}
}

func TestBackupCopyDuckDBWithWAL(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.duckdb")
	if err := os.WriteFile(src, []byte("duckdata"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(src+".wal", []byte("waldata"), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "backup.duckdb")
	res, err := BackupFileDatabase(engines.KindDuckDB, src, out)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.RelatedPaths) != 1 || res.RelatedPaths[0] != out+".wal" {
		t.Fatalf("related: %+v", res.RelatedPaths)
	}
	if b, _ := os.ReadFile(out + ".wal"); string(b) != "waldata" {
		t.Fatal("wal not copied")
	}
}

func TestRestoreRemovesStaleWAL(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "live.duckdb")
	os.WriteFile(target, []byte("old"), 0o644)
	os.WriteFile(target+".wal", []byte("stale"), 0o644)

	input := filepath.Join(dir, "backup.duckdb")
	os.WriteFile(input, []byte("new"), 0o644)

	res, err := RestoreFileDatabase(engines.KindDuckDB, target, input)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(target); string(b) != "new" {
		t.Fatal("target not overwritten")
	}
	if fileExists(target + ".wal") {
		t.Fatal("stale wal should be removed when backup has none")
	}
	if len(res.RelatedPaths) != 0 {
		t.Fatalf("related: %+v", res.RelatedPaths)
	}
}

func TestRestoreCopiesWALWhenPresent(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "live.duckdb")
	input := filepath.Join(dir, "backup.duckdb")
	os.WriteFile(input, []byte("new"), 0o644)
	os.WriteFile(input+".wal", []byte("wal"), 0o644)

	if _, err := RestoreFileDatabase(engines.KindDuckDB, target, input); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(target + ".wal"); string(b) != "wal" {
		t.Fatal("wal should be restored alongside the main file")
	}
}
