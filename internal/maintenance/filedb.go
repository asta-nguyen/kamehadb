// Package maintenance ports apps/sidecar/src/lib/file-database-maintenance.ts:
// backup/restore for the file-backed engines (SQLite via VACUUM INTO, DuckDB
// via file copy) including WAL/SHM sidecar files.
package maintenance

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// SQLITE_RELATED_SUFFIXES / DUCKDB_RELATED_SUFFIXES from sidecar constants:
// sidecar files for write-ahead logs travel with the main file on copy, or
// get removed as stale leftovers on restore.
var (
	sqliteRelatedSuffixes = []string{"-wal", "-shm"}
	duckdbRelatedSuffixes = []string{".wal"}
)

// MaintenanceErrorCode mirrors FileDatabaseMaintenanceErrorCode.
type MaintenanceErrorCode string

const (
	ErrNotFileDatabase   MaintenanceErrorCode = "not-file-database"
	ErrMissingFilePath   MaintenanceErrorCode = "missing-file-path"
	ErrMissingSourceFile MaintenanceErrorCode = "missing-source-file"
	ErrSamePath          MaintenanceErrorCode = "same-path"
)

// MaintenanceError mirrors FileDatabaseMaintenanceError so callers can map
// codes back to the same HTTP-style statuses the route produced.
type MaintenanceError struct {
	Code    MaintenanceErrorCode
	Message string
}

func (e *MaintenanceError) Error() string { return e.Message }

// MaintenanceResult mirrors FileDatabaseMaintenanceResult.
type MaintenanceResult struct {
	Path         string   `json:"path"`
	RelatedPaths []string `json:"relatedPaths"`
}

// requireFileDatabaseProfile narrows a saved profile to the file-backed
// engines — backup/restore need a concrete on-disk path.
func requireFileDatabaseProfile(kind, filePath string) error {
	if !engines.IsFileDatabaseKind(kind) {
		return &MaintenanceError{
			ErrNotFileDatabase,
			"Backup and restore are only available for SQLite and DuckDB connections",
		}
	}
	if filePath == "" {
		return &MaintenanceError{
			ErrMissingFilePath,
			"The saved connection does not include a database file",
		}
	}
	return nil
}

func relatedSuffixes(kind string) []string {
	if kind == engines.KindSQLite {
		return sqliteRelatedSuffixes
	}
	return duckdbRelatedSuffixes
}

// renameFile is the promotion primitive. Tests swap it to inject a
// mid-promotion failure without changing production behavior. (Why)
var renameFile = os.Rename

// stagedFile pairs a temporary file holding new content with the final target
// it will be promoted onto.
type stagedFile struct {
	staged string
	target string
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// stageCopy copies src into a temporary sibling of target and returns the
// temporary path. The target stays untouched until promotion, so a copy
// failure never truncates or deletes the existing file. (How / Why)
func stageCopy(src, target string) (string, error) {
	dir := filepath.Dir(target)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(dir, filepath.Base(target)+".kamehadb-stage-*")
	if err != nil {
		return "", err
	}
	tmp := f.Name()
	f.Close()
	if err := copyFile(src, tmp); err != nil {
		os.Remove(tmp)
		return "", err
	}
	return tmp, nil
}

// stageFileSet stages the main file plus every existing sidecar next to the
// target and returns the staged set and the final sidecar paths. Nothing at the
// destination changes until the caller promotes the set. (What / Why)
func stageFileSet(sourcePath, targetPath string, suffixes []string) ([]stagedFile, []string, error) {
	mainStaged, err := stageCopy(sourcePath, targetPath)
	if err != nil {
		return nil, nil, err
	}
	files := []stagedFile{{staged: mainStaged, target: targetPath}}
	var related []string
	for _, suffix := range suffixes {
		src := sourcePath + suffix
		if !fileExists(src) {
			continue
		}
		dst := targetPath + suffix
		staged, err := stageCopy(src, dst)
		if err != nil {
			cleanupStaged(files)
			return nil, nil, err
		}
		files = append(files, stagedFile{staged: staged, target: dst})
		related = append(related, dst)
	}
	return files, related, nil
}

func cleanupStaged(files []stagedFile) {
	for _, f := range files {
		os.Remove(f.staged)
	}
}

// replaceFileSet promotes every staged file onto its target, moving each
// existing target aside first so a reported promotion error restores the
// previous set. Failed rollback keeps its recovery copy and reports its path.
// removeAfter lists stale sidecars deleted only after a successful promotion.
func replaceFileSet(files []stagedFile, removeAfter []string) error {
	type backup struct{ target, saved string }
	var backups []backup
	restore := func(promoted int) error {
		var rollbackErrors []error
		blocked := map[string]bool{}
		for i := promoted - 1; i >= 0; i-- {
			target := files[i].target
			if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
				blocked[target] = true
				reported := false
				for _, b := range backups {
					if b.target == target {
						rollbackErrors = append(rollbackErrors, fmt.Errorf("could not remove replacement %s; recovery copy remains at %s: %w", target, b.saved, err))
						reported = true
						break
					}
				}
				if !reported {
					rollbackErrors = append(rollbackErrors, fmt.Errorf("could not remove replacement %s: %w", target, err))
				}
			}
		}
		for i := len(backups) - 1; i >= 0; i-- {
			b := backups[i]
			if blocked[b.target] {
				continue
			}
			if err := renameFile(b.saved, b.target); err != nil {
				rollbackErrors = append(rollbackErrors, fmt.Errorf("could not restore %s; recovery copy remains at %s: %w", b.target, b.saved, err))
			}
		}
		return errors.Join(rollbackErrors...)
	}

	for _, f := range files {
		if !fileExists(f.target) {
			continue
		}
		saved := f.target + ".kamehadb-backup"
		if _, err := os.Lstat(saved); err == nil {
			rollbackErr := restore(0)
			cleanupStaged(files)
			return errors.Join(fmt.Errorf("existing recovery copy at %s prevents replacing %s", saved, f.target), rollbackErr)
		} else if !errors.Is(err, os.ErrNotExist) {
			rollbackErr := restore(0)
			cleanupStaged(files)
			return errors.Join(fmt.Errorf("could not inspect recovery copy %s: %w", saved, err), rollbackErr)
		}
		if err := renameFile(f.target, saved); err != nil {
			rollbackErr := restore(0)
			cleanupStaged(files)
			return errors.Join(err, rollbackErr)
		}
		backups = append(backups, backup{target: f.target, saved: saved})
	}

	promoted := 0
	for _, f := range files {
		if err := renameFile(f.staged, f.target); err != nil {
			rollbackErr := restore(promoted)
			cleanupStaged(files[promoted:])
			return errors.Join(err, rollbackErr)
		}
		promoted++
	}

	for _, b := range backups {
		os.Remove(b.saved)
	}
	for _, target := range removeAfter {
		os.Remove(target)
	}
	return nil
}

func ensureDistinctPaths(sourcePath, targetPath string) error {
	absSrc, err1 := filepath.Abs(sourcePath)
	absDst, err2 := filepath.Abs(targetPath)
	if err1 != nil || err2 != nil || absSrc == absDst {
		return &MaintenanceError{ErrSamePath, "Choose a different file path for backup or restore"}
	}
	return nil
}

func escapeSQLiteLiteral(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

// backupSQLiteDatabase uses VACUUM INTO to produce a consistent single-file
// snapshot even when the source is in WAL mode, avoiding shipping log files.
// The snapshot lands in a temporary sibling and is promoted only on success.
func backupSQLiteDatabase(sourcePath, outputPath string) (*MaintenanceResult, error) {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return nil, err
	}
	// VACUUM INTO refuses to overwrite an existing file, so reserve then drop a
	// unique name for the snapshot. (Why)
	f, err := os.CreateTemp(filepath.Dir(outputPath), filepath.Base(outputPath)+".kamehadb-stage-*")
	if err != nil {
		return nil, err
	}
	staged := f.Name()
	f.Close()
	os.Remove(staged)

	db, err := sql.Open("sqlite", "file:"+sourcePath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(fmt.Sprintf("VACUUM INTO '%s'", escapeSQLiteLiteral(staged))); err != nil {
		os.Remove(staged)
		return nil, err
	}
	if err := replaceFileSet([]stagedFile{{staged: staged, target: outputPath}}, nil); err != nil {
		return nil, err
	}
	return &MaintenanceResult{Path: outputPath, RelatedPaths: []string{}}, nil
}

func backupByCopy(kind, filePath, outputPath string) (*MaintenanceResult, error) {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return nil, err
	}
	files, related, err := stageFileSet(filePath, outputPath, relatedSuffixes(kind))
	if err != nil {
		return nil, err
	}
	if err := replaceFileSet(files, nil); err != nil {
		return nil, err
	}
	return &MaintenanceResult{Path: outputPath, RelatedPaths: related}, nil
}

// BackupFileDatabase mirrors backupFileDatabase.
func BackupFileDatabase(kind, filePath, outputPath string) (*MaintenanceResult, error) {
	if err := requireFileDatabaseProfile(kind, filePath); err != nil {
		return nil, err
	}
	if !fileExists(filePath) {
		return nil, &MaintenanceError{ErrMissingSourceFile, "The configured database file was not found"}
	}
	if err := ensureDistinctPaths(filePath, outputPath); err != nil {
		return nil, err
	}
	if kind == engines.KindSQLite {
		return backupSQLiteDatabase(filePath, outputPath)
	}
	return backupByCopy(kind, filePath, outputPath)
}

// RestoreFileDatabase mirrors restoreFileDatabase.
func RestoreFileDatabase(kind, filePath, inputPath string) (*MaintenanceResult, error) {
	if err := requireFileDatabaseProfile(kind, filePath); err != nil {
		return nil, err
	}
	if !fileExists(inputPath) {
		return nil, &MaintenanceError{ErrMissingSourceFile, "The selected backup file was not found"}
	}
	if err := ensureDistinctPaths(inputPath, filePath); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return nil, err
	}
	suffixes := relatedSuffixes(kind)
	files, related, err := stageFileSet(inputPath, filePath, suffixes)
	if err != nil {
		return nil, err
	}
	// Sidecars the backup does not include are stale leftovers; remove them
	// only after a successful promotion so the restored DB cannot replay an
	// old WAL. (Why)
	var stale []string
	for _, suffix := range suffixes {
		if !fileExists(inputPath + suffix) {
			stale = append(stale, filePath+suffix)
		}
	}
	if err := replaceFileSet(files, stale); err != nil {
		return nil, err
	}
	return &MaintenanceResult{Path: filePath, RelatedPaths: related}, nil
}
