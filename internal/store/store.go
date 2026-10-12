// Package store persists KamehaDB metadata (profiles, history, AI and MCP
// state) in the same SQLite file the Node sidecar used, so existing
// installs keep their data after the Go rewrite.
package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	_ "modernc.org/sqlite"
)

// Store wraps the metadata database. A single connection keeps writer
// serialization identical to better-sqlite3's synchronous behavior.
type Store struct {
	db   *sql.DB
	path string
}

// DB exposes the raw handle for entity accessors in this package.
func (s *Store) DB() *sql.DB { return s.db }

// Path returns the resolved database file path (the vault key file derives
// its location from it).
func (s *Store) Path() string { return s.path }

// DataDir resolves the per-user data directory using the same convention
// as the Tauri app_data_dir it replaces ($XDG_DATA_HOME or platform
// equivalent + /com.kamehadb). KAMEHADB_DATA_DIR overrides everything.
func DataDir() (string, error) {
	if dir := os.Getenv("KAMEHADB_DATA_DIR"); dir != "" {
		return dir, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "com.kamehadb"), nil
	case "windows":
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "com.kamehadb"), nil
		}
		return filepath.Join(home, "AppData", "Roaming", "com.kamehadb"), nil
	default:
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "com.kamehadb"), nil
		}
		return filepath.Join(home, ".local", "share", "com.kamehadb"), nil
	}
}

// Open opens (creating when needed) the metadata database and applies the
// full schema/migration sequence. An empty path resolves via DataDir and
// falls back to ./kamehadb.db when no data dir can be determined.
func Open(path string) (*Store, error) {
	if path == "" {
		dir, err := DataDir()
		if err != nil {
			dir = "."
		}
		path = filepath.Join(dir, "kamehadb.db")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db, path: path}
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		db.Close()
		return nil, err
	}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

// newID produces a 21-char URL-safe id (nanoid-equivalent entropy).
func newID() string {
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-"
	buf := make([]byte, 21)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	for i, b := range buf {
		buf[i] = alphabet[b&63]
	}
	return string(buf)
}

// nowISO matches JavaScript's Date#toISOString (millisecond precision, Z).
func nowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

// newMcpToken mirrors the sidecar's randomBytes(32).toString('base64url').
func newMcpToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(buf), nil
}
