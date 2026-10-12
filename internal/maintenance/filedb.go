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

	"github.com/asta-nguyen/kamehadb/internal/engines"
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
		return &MaintenanceError{ErrNotFileDatabase,
			"Backup and restore are only available for SQLite and DuckDB connections"}
	}
	if filePath == "" {
		return &MaintenanceError{ErrMissingFilePath,
			"The saved connection does not include a database file"}
	}
	return nil
}

func relatedSuffixes(kind string) []string {
	if kind == engines.KindSQLite {
		return sqliteRelatedSuffixes
	}
	return duckdbRelatedSuffixes
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

// copyRelatedFiles copies each existing sidecar file (src+suffix) next to the
// target and returns the copied target paths.
func copyRelatedFiles(sourcePath, targetPath string, suffixes []string) ([]string, error) {
	var copied []string
	for _, suffix := range suffixes {
		src := sourcePath + suffix
		if !fileExists(src) {
			continue
		}
		dst := targetPath + suffix
		if err := copyFile(src, dst); err != nil {
			return nil, err
		}
		copied = append(copied, dst)
	}
	return copied, nil
}

// removeRelatedFiles is `rm(..., { force: true })` — a missing file is not an
// error, but real failures (permissions) are.
func removeRelatedFiles(targetPath string, suffixes []string) error {
	for _, suffix := range suffixes {
		if err := os.Remove(targetPath + suffix); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
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
func backupSQLiteDatabase(sourcePath, outputPath string) (*MaintenanceResult, error) {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return nil, err
	}
	if err := os.Remove(outputPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := removeRelatedFiles(outputPath, sqliteRelatedSuffixes); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", "file:"+sourcePath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(fmt.Sprintf("VACUUM INTO '%s'", escapeSQLiteLiteral(outputPath))); err != nil {
		return nil, err
	}
	return &MaintenanceResult{Path: outputPath, RelatedPaths: []string{}}, nil
}

func backupByCopy(kind, filePath, outputPath string) (*MaintenanceResult, error) {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return nil, err
	}
	if err := copyFile(filePath, outputPath); err != nil {
		return nil, err
	}
	copied, err := copyRelatedFiles(filePath, outputPath, relatedSuffixes(kind))
	if err != nil {
		return nil, err
	}
	return &MaintenanceResult{Path: outputPath, RelatedPaths: copied}, nil
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
	if err := copyFile(inputPath, filePath); err != nil {
		return nil, err
	}
	suffixes := relatedSuffixes(kind)
	copied, err := copyRelatedFiles(inputPath, filePath, suffixes)
	if err != nil {
		return nil, err
	}
	// No sidecar files came with the backup — drop stale leftovers so the
	// restored DB doesn't replay an old WAL.
	if len(copied) == 0 {
		if err := removeRelatedFiles(filePath, suffixes); err != nil {
			return nil, err
		}
	}
	return &MaintenanceResult{Path: filePath, RelatedPaths: copied}, nil
}
