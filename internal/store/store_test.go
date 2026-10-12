package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func openTemp(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func tables(t *testing.T, s *Store) map[string]bool {
	t.Helper()
	rows, err := s.DB().Query(`SELECT name FROM sqlite_master WHERE type='table'`)
	if err != nil {
		t.Fatalf("tables: %v", err)
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		out[name] = true
	}
	return out
}

func TestOpenFresh(t *testing.T) {
	s := openTemp(t)
	want := []string{
		"connection_profiles", "mcp_managed_accounts", "ai_settings",
		"ai_provider_configs", "chat_messages", "query_history",
		"schema_snapshots", "schema_watchers", "schema_embeddings", "mcp_settings",
	}
	got := tables(t, s)
	for _, table := range want {
		if !got[table] {
			t.Errorf("missing table %s", table)
		}
	}
	for _, idx := range []string{
		"idx_chat_connection", "idx_query_history_connection",
		"idx_query_history_favorite", "idx_schema_snaps_conn", "idx_schema_embeddings_conn",
	} {
		var n int
		if err := s.DB().QueryRow(
			`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?`, idx).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("missing index %s", idx)
		}
	}

	var port int
	var token string
	if err := s.DB().QueryRow(`SELECT port, token FROM mcp_settings WHERE id = 1`).Scan(&port, &token); err != nil {
		t.Fatalf("mcp_settings seed: %v", err)
	}
	if port != MCPDefaultPort {
		t.Errorf("mcp port = %d, want %d", port, MCPDefaultPort)
	}
	if len(token) != 44 {
		t.Errorf("token len = %d, want 44 (32B base64url w/ padding)", len(token))
	}

	var providers int
	if err := s.DB().QueryRow(`SELECT COUNT(*) FROM ai_provider_configs`).Scan(&providers); err != nil {
		t.Fatal(err)
	}
	if providers != 6 {
		t.Errorf("provider rows = %d, want 6", providers)
	}

	ddl := s.tableSQL("connection_profiles")
	for _, kind := range []string{"mariadb", "duckdb", "tigerbeetle", "clickhouse"} {
		if !strings.Contains(ddl, kind) {
			t.Errorf("final CHECK missing %q in: %s", kind, ddl)
		}
	}
	if !s.hasColumn("connection_profiles", "mcp_enabled") {
		t.Error("mcp_enabled missing after migration")
	}
}

func TestProfileCRUD(t *testing.T) {
	s := openTemp(t)
	name, kind, host, password := "pg", "postgres", "localhost", "secret"
	port := int64(5432)
	p, err := s.CreateProfile(ProfileInput{
		Name: &name, Kind: &kind, Host: &host, Port: &port, Password: &password,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if p.ID == "" || p.Kind != kind || p.SSL || p.MCPEnabled {
		t.Fatalf("unexpected profile: %+v", p)
	}

	got, err := s.GetProfile(p.ID)
	if err != nil || got == nil {
		t.Fatalf("get: %v %v", got, err)
	}
	if pw, _ := s.GetProfilePassword(p.ID); pw != password {
		t.Errorf("password = %q", pw)
	}

	// Partial update keeps the existing password and bumps updated_at.
	newName := "pg-renamed"
	up, err := s.UpdateProfile(p.ID, ProfileInput{Name: &newName})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if up.Name != newName || up.Host == nil || *up.Host != host {
		t.Errorf("update fields: %+v", up)
	}
	if pw, _ := s.GetProfilePassword(p.ID); pw != password {
		t.Errorf("password lost on update: %q", pw)
	}

	list, err := s.ListProfiles()
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v %v", list, err)
	}
	ok, err := s.DeleteProfile(p.ID)
	if err != nil || !ok {
		t.Fatalf("delete: %v %v", ok, err)
	}
	if again, _ := s.DeleteProfile(p.ID); again {
		t.Error("second delete should report 0 rows")
	}
}

// TestMigrateLegacy builds the pre-rebuild schema variant found in the
// wild (INTEGER PK, 9-kind CHECK, no mcp_enabled) and runs the full open.
func TestMigrateLegacy(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kamehadb.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE connection_profiles (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse')),
		host TEXT, port INTEGER, database TEXT, username TEXT,
		ssl INTEGER DEFAULT 0, file_path TEXT,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`INSERT INTO connection_profiles (name, kind, host) VALUES ('legacy-pg', 'postgres', 'db1')`); err != nil {
		t.Fatal(err)
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	defer s.Close()

	ddl := s.tableSQL("connection_profiles")
	for _, kind := range []string{"mariadb", "duckdb", "tigerbeetle"} {
		if !strings.Contains(ddl, kind) {
			t.Errorf("migrated CHECK missing %q", kind)
		}
	}
	if !s.hasColumn("connection_profiles", "mcp_enabled") {
		t.Error("mcp_enabled missing after legacy migration")
	}

	profiles, err := s.ListProfiles()
	if err != nil || len(profiles) != 1 {
		t.Fatalf("legacy profiles: %v %v", profiles, err)
	}
	if profiles[0].Name != "legacy-pg" || profiles[0].ID == "" {
		t.Errorf("legacy row not preserved: %+v", profiles[0])
	}
}

// TestMcpNormalization verifies interrupted states cannot stay enabled.
func TestMcpNormalization(t *testing.T) {
	s := openTemp(t)
	name, kind := "pg", "postgres"
	p, err := s.CreateProfile(ProfileInput{Name: &name, Kind: &kind})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(`UPDATE connection_profiles SET mcp_enabled = 1 WHERE id = ?`, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(
		`INSERT INTO mcp_managed_accounts (profile_id, keychain_ref, state) VALUES (?, 'ref1', ?)`,
		p.ID, MCPStateProvisioning); err != nil {
		t.Fatal(err)
	}
	s.Close()

	s2, err := Open(s.Path())
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()

	var state string
	if err := s2.DB().QueryRow(
		`SELECT state FROM mcp_managed_accounts WHERE profile_id = ?`, p.ID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != MCPStateRecoveryRequired {
		t.Errorf("state = %q, want %q", state, MCPStateRecoveryRequired)
	}
	var enabled int
	if err := s2.DB().QueryRow(
		`SELECT mcp_enabled FROM connection_profiles WHERE id = ?`, p.ID).Scan(&enabled); err != nil {
		t.Fatal(err)
	}
	if enabled != 0 {
		t.Error("mcp_enabled should be reset for non-ready account")
	}
}

// TestRealDB runs the migration against a copy of a real kamehadb.db.
// Skipped unless REAL_KAMEHADB_DB points at the source file.
func TestRealDB(t *testing.T) {
	src := os.Getenv("REAL_KAMEHADB_DB")
	if src == "" {
		t.Skip("REAL_KAMEHADB_DB not set")
	}
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(t.TempDir(), "kamehadb.db")
	if err := os.WriteFile(dst, data, 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Open(dst)
	if err != nil {
		t.Fatalf("open real db: %v", err)
	}
	defer s.Close()
	profiles, err := s.ListProfiles()
	if err != nil {
		t.Fatalf("list real profiles: %v", err)
	}
	t.Logf("migrated real db: %d profiles", len(profiles))
	for _, p := range profiles {
		if p.ID == "" || p.Kind == "" {
			t.Errorf("bad migrated profile: %+v", p)
		}
	}
}
