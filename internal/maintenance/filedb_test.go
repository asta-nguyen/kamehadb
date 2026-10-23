package maintenance

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
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
	_ = os.WriteFile(target, []byte("old"), 0o644)
	_ = os.WriteFile(target+".wal", []byte("stale"), 0o644)

	input := filepath.Join(dir, "backup.duckdb")
	_ = os.WriteFile(input, []byte("new"), 0o644)

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
	_ = os.WriteFile(input, []byte("new"), 0o644)
	_ = os.WriteFile(input+".wal", []byte("wal"), 0o644)

	if _, err := RestoreFileDatabase(engines.KindDuckDB, target, input); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(target + ".wal"); string(b) != "wal" {
		t.Fatal("wal should be restored alongside the main file")
	}
}

// Share the preservation checks so backup and restore failure cases stay focused on their inputs.
func assertFileDatabaseOperationFailurePreservesFiles(t *testing.T, dir, message string, operation func() error, expected map[string]string) {
	t.Helper()
	if err := operation(); err == nil {
		t.Fatal(message)
	}
	for path, want := range expected {
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		if string(b) != want {
			t.Fatalf("%s changed on failure: %q", path, b)
		}
	}
	if m, _ := filepath.Glob(filepath.Join(dir, "*.kamehadb-stage-*")); len(m) != 0 {
		t.Fatalf("staged temp files left behind: %v", m)
	}
}

// A failed backup must not truncate or delete the previous output; staging keeps
// the destination untouched until a fully successful promote. (What / Why)
func TestBackupFileDatabaseFailurePreservesExistingOutput(t *testing.T) {
	dir := t.TempDir()
	// A directory cannot be read as a file, so the staged copy fails after the
	// guards pass — exercising the failure path with a pre-existing output.
	srcDir := filepath.Join(dir, "src.duckdb")
	if err := os.Mkdir(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "backup.duckdb")
	if err := os.WriteFile(out, []byte("original-db"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out+".wal", []byte("original-wal"), 0o644); err != nil {
		t.Fatal(err)
	}

	assertFileDatabaseOperationFailurePreservesFiles(t, dir, "expected backup to fail when the source cannot be read", func() error {
		_, err := BackupFileDatabase(engines.KindDuckDB, srcDir, out)
		return err
	}, map[string]string{out: "original-db", out + ".wal": "original-wal"})
}

// A failed restore must leave the live database and its sidecars intact. (What / Why)
func TestRestoreFileDatabaseFailurePreservesExistingDatabase(t *testing.T) {
	dir := t.TempDir()
	// A directory as the backup input fails the staged copy after the guards.
	inputDir := filepath.Join(dir, "backup.duckdb")
	if err := os.Mkdir(inputDir, 0o755); err != nil {
		t.Fatal(err)
	}
	live := filepath.Join(dir, "live.duckdb")
	if err := os.WriteFile(live, []byte("live-db"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(live+".wal", []byte("live-wal"), 0o644); err != nil {
		t.Fatal(err)
	}

	assertFileDatabaseOperationFailurePreservesFiles(t, dir, "expected restore to fail when the backup cannot be read", func() error {
		_, err := RestoreFileDatabase(engines.KindDuckDB, live, inputDir)
		return err
	}, map[string]string{live: "live-db", live + ".wal": "live-wal"})
}

// A rename error partway through promotion must restore the previous file set
// and remove every staged temporary. (What / Why)
func TestReplaceFileSetRestoresPreviousFilesOnPromotionError(t *testing.T) {
	dir := t.TempDir()
	mainTarget := filepath.Join(dir, "data.db")
	walTarget := filepath.Join(dir, "data.db-wal")
	if err := os.WriteFile(mainTarget, []byte("old-main"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(walTarget, []byte("old-wal"), 0o644); err != nil {
		t.Fatal(err)
	}
	mainStaged := filepath.Join(dir, "main.stage")
	walStaged := filepath.Join(dir, "wal.stage")
	if err := os.WriteFile(mainStaged, []byte("new-main"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(walStaged, []byte("new-wal"), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := renameFile
	defer func() { renameFile = orig }()
	calls := 0
	renameFile = func(oldpath, newpath string) error {
		// Sequence: back up main, back up wal, promote main, promote wal. Fail
		// the last step so one new file is already installed when the error hits.
		calls++
		if calls == 4 {
			return errors.New("injected promotion failure")
		}
		return os.Rename(oldpath, newpath)
	}

	err := replaceFileSet([]stagedFile{
		{staged: mainStaged, target: mainTarget},
		{staged: walStaged, target: walTarget},
	}, nil)
	if err == nil {
		t.Fatal("expected a promotion error")
	}
	if b, _ := os.ReadFile(mainTarget); string(b) != "old-main" {
		t.Fatalf("main not restored: %q", b)
	}
	if b, _ := os.ReadFile(walTarget); string(b) != "old-wal" {
		t.Fatalf("wal not restored: %q", b)
	}
	if fileExists(mainStaged) || fileExists(walStaged) {
		t.Fatal("staged files should be removed after rollback")
	}
	if m, _ := filepath.Glob(filepath.Join(dir, "*.kamehadb-backup")); len(m) != 0 {
		t.Fatalf("backup temporaries left behind: %v", m)
	}
}

func TestReplaceFileSetReportsRollbackFailureAndPreservesBackup(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "data.db")
	staged := filepath.Join(dir, "data.stage")
	if err := os.WriteFile(target, []byte("old-data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(staged, []byte("new-data"), 0o644); err != nil {
		t.Fatal(err)
	}

	promotionErr := errors.New("injected promotion failure")
	rollbackErr := errors.New("injected rollback failure")
	orig := renameFile
	defer func() { renameFile = orig }()
	calls := 0
	renameFile = func(oldpath, newpath string) error {
		calls++
		switch calls {
		case 2:
			return promotionErr
		case 3:
			return rollbackErr
		default:
			return os.Rename(oldpath, newpath)
		}
	}

	err := replaceFileSet([]stagedFile{{staged: staged, target: target}}, nil)
	if !errors.Is(err, promotionErr) || !errors.Is(err, rollbackErr) {
		t.Fatalf("want promotion and rollback errors, got %v", err)
	}
	backup := target + ".kamehadb-backup"
	if !strings.Contains(err.Error(), backup) {
		t.Fatalf("error does not identify the recovery backup %q: %v", backup, err)
	}
	if b, readErr := os.ReadFile(backup); readErr != nil || string(b) != "old-data" {
		t.Fatalf("old data not preserved at backup: %q %v", b, readErr)
	}
}

func TestReplaceFileSetReportsFailureRemovingPromotedFile(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "data.db")
	staged := filepath.Join(dir, "data.stage")
	if err := os.WriteFile(target, []byte("old-data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(staged, []byte("new-data"), 0o644); err != nil {
		t.Fatal(err)
	}

	promotionErr := errors.New("injected promotion failure")
	orig := renameFile
	defer func() { renameFile = orig }()
	renameFile = func(oldpath, newpath string) error {
		if oldpath != staged {
			return os.Rename(oldpath, newpath)
		}
		if err := os.Rename(oldpath, newpath); err != nil {
			return err
		}
		if err := os.Remove(target); err != nil {
			return err
		}
		if err := os.Mkdir(target, 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(target, "keep"), []byte("block removal"), 0o644); err != nil {
			return err
		}
		return promotionErr
	}

	err := replaceFileSet([]stagedFile{{staged: staged, target: target}}, nil)
	if !errors.Is(err, promotionErr) {
		t.Fatalf("want promotion error, got %v", err)
	}
	backup := target + ".kamehadb-backup"
	if !strings.Contains(err.Error(), "recovery copy remains at "+backup) {
		t.Fatalf("error does not explain the preserved recovery copy: %v", err)
	}
	if b, readErr := os.ReadFile(backup); readErr != nil || string(b) != "old-data" {
		t.Fatalf("old data not preserved at backup: %q %v", b, readErr)
	}
}

func TestReplaceFileSetPreservesExistingRecoveryBackup(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "data.db")
	staged := filepath.Join(dir, "data.stage")
	backup := target + ".kamehadb-backup"
	if err := os.WriteFile(target, []byte("live-data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backup, []byte("recovery-data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(staged, []byte("new-data"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := replaceFileSet([]stagedFile{{staged: staged, target: target}}, nil)
	if err == nil || !strings.Contains(err.Error(), backup) {
		t.Fatalf("expected recovery-backup conflict at %q, got %v", backup, err)
	}
	if b, readErr := os.ReadFile(target); readErr != nil || string(b) != "live-data" {
		t.Fatalf("live data changed: %q %v", b, readErr)
	}
	if b, readErr := os.ReadFile(backup); readErr != nil || string(b) != "recovery-data" {
		t.Fatalf("recovery backup changed: %q %v", b, readErr)
	}
	if fileExists(staged) {
		t.Fatal("staged file should be removed after rejecting the recovery-backup conflict")
	}
}
