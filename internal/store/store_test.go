package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
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
		"mcp_call_history",
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
		"idx_mcp_call_history_executed_at",
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

// TestRealDB runs the migration against a copy of a real kamehadb.db and
// verifies profiles plus MCP state survive. Skipped unless REAL_KAMEHADB_DB
// points at the source file.
func TestRealDB(t *testing.T) {
	src := os.Getenv("REAL_KAMEHADB_DB")
	if src == "" {
		t.Skip("REAL_KAMEHADB_DB not set")
	}
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	// Capture the source bearer token before migration: GetMCPSettings
	// re-seeds a missing row, so existence alone would not prove survival.
	srcToken := ""
	if raw, err := sql.Open("sqlite", "file:"+src+"?mode=ro"); err == nil {
		if err := raw.QueryRow(`SELECT token FROM mcp_settings WHERE id = 1`).Scan(&srcToken); err != nil && err != sql.ErrNoRows {
			t.Logf("could not read source token: %v", err)
		}
		raw.Close()
	} else {
		t.Logf("could not open source db read-only: %v", err)
	}
	dst := filepath.Join(t.TempDir(), "kamehadb.db")
	if err := os.WriteFile(dst, data, 0o600); err != nil {
		t.Fatal(err)
	}
	// Copy the vault key next to the migrated copy so stored MCP credentials
	// can still be decrypted. (Why)
	keyCopied := false
	if key, err := os.ReadFile(src + ".mcp.key"); err == nil {
		if err := os.WriteFile(dst+".mcp.key", key, 0o600); err != nil {
			t.Fatal(err)
		}
		keyCopied = true
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
	settings, err := s.GetMCPSettings()
	if err != nil {
		t.Fatalf("read mcp settings: %v", err)
	}
	if srcToken != "" && settings.Token != srcToken {
		t.Error("mcp_settings token did not survive migration")
	}
	accounts, err := s.ListMCPManagedAccounts()
	if err != nil {
		t.Fatalf("list mcp managed accounts: %v", err)
	}
	t.Logf("migrated real db: %d mcp managed accounts", len(accounts))
	for _, acc := range accounts {
		has, err := s.HasMCPManagedCredential(acc.ProfileID)
		if err != nil {
			t.Fatal(err)
		}
		if !has {
			continue
		}
		if !keyCopied {
			t.Errorf("credential for %s cannot be verified: no %s.mcp.key beside the source db", acc.ProfileID, src)
			continue
		}
		bundle, err := s.LoadMCPManagedCredential(acc.ProfileID)
		if err != nil {
			t.Errorf("credential for %s did not decrypt after migration: %v", acc.ProfileID, err)
			continue
		}
		if bundle == nil || !bundle.valid() {
			t.Errorf("credential for %s reloaded invalid: %+v", acc.ProfileID, bundle)
		}
	}
}

// Legacy profiles for engines removed in the rewrite must be exported to a
// JSON file beside the database before their rows are deleted. (Why)
func TestMigrationExportsRemovedProfiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kamehadb.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	connectionString := "https://qdrant.local?api-key=test-secret"
	ciphertext, err := s.encryptSecret("q1", profileConnectionStringField, connectionString)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(`INSERT INTO connection_profiles (id, name, kind, host, port, connection_string)
		VALUES ('q1', 'Old Qdrant', 'qdrant', 'localhost', 6333, ?),
		       ('t1', 'Old TigerBeetle', 'tigerbeetle', 'localhost', 3001, NULL)`, ciphertext); err != nil {
		t.Fatal(err)
	}
	s.Close()

	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	var count int64
	if err := s2.DB().QueryRow(
		`SELECT COUNT(*) FROM connection_profiles WHERE kind IN ('qdrant','tigerbeetle')`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("legacy profiles should be purged, found %d", count)
	}
	matches, err := filepath.Glob(filepath.Join(dir, "removed-profiles-*.json"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("expected exactly one export file, got %v (err %v)", matches, err)
	}
	data, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Profiles []Profile `json:"profiles"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Profiles) != 2 {
		t.Fatalf("expected 2 exported profiles, got %d", len(payload.Profiles))
	}
	foundQdrant := false
	for _, profile := range payload.Profiles {
		if profile.ID != "q1" {
			continue
		}
		foundQdrant = true
		if profile.ConnectionString == nil || *profile.ConnectionString != connectionString {
			t.Errorf("exported Qdrant connection string = %v, want original plaintext", profile.ConnectionString)
		}
	}
	if !foundQdrant {
		t.Error("export did not contain the Qdrant profile")
	}
	if strings.Contains(string(data), "password") {
		t.Error("export must not contain password fields")
	}
}

// A normal reopen must activate vault decryption before exporting rows for purge. (Why)
func TestOpenRetainsRemovedProfileWhenSecretCannotBeExported(t *testing.T) {
	withMemoryKeyring(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "kamehadb.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := s.encryptSecret("q1", profileConnectionStringField, "https://qdrant.local")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB().Exec(`INSERT INTO connection_profiles (id, name, kind, connection_string)
		VALUES ('q1', 'Old Qdrant', 'qdrant', ?)`, ciphertext); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}

	keyringGet = func(string, string) (string, error) { return "", errors.New("keychain locked") }
	reopened, openErr := Open(path)
	if reopened != nil {
		if err := reopened.Close(); err != nil {
			t.Error(err)
		}
	}
	if openErr == nil {
		t.Error("open should fail when migration cannot export an encrypted connection string")
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM connection_profiles WHERE id = 'q1'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("migration purged the unreadable profile, count = %d", count)
	}
	matches, err := filepath.Glob(filepath.Join(dir, "removed-profiles-*.json"))
	if err != nil || len(matches) != 0 {
		t.Errorf("migration should not write an incomplete export, got %v (err %v)", matches, err)
	}
}

// TestMigrationFromLegacySidecarDB replicates a last-version sidecar metadata
// database (pre-mariadb profile CHECK, no mcp_settings.history_enabled) with a
// stored MCP credential and verifies the migration keeps the bearer token, the
// managed-account row, and a decryptable credential. (Why)
func TestMigrationFromLegacySidecarDB(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kamehadb.db")

	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	legacy := []string{
		`CREATE TABLE connection_profiles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse')),
			host TEXT,
			port INTEGER,
			database TEXT,
			username TEXT,
			password TEXT,
			ssl INTEGER DEFAULT 0,
			file_path TEXT,
			color TEXT,
			connection_string TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE mcp_managed_accounts (
			profile_id TEXT PRIMARY KEY,
			keychain_ref TEXT NOT NULL UNIQUE,
			state TEXT NOT NULL CHECK(state IN ('prepared','provisioning','recovery_required','ready','revoke_failed','keychain_cleanup_pending')),
			credential_ciphertext TEXT
		)`,
		`CREATE TABLE mcp_settings (id INTEGER PRIMARY KEY, port INTEGER NOT NULL, token TEXT NOT NULL)`,
		`INSERT INTO connection_profiles (id, name, kind, host, port, username, password)
			VALUES ('p1', 'Legacy PG', 'postgres', 'localhost', 5432, 'u', 'p')`,
		`INSERT INTO mcp_managed_accounts (profile_id, keychain_ref, state)
			VALUES ('p1', 'kamehadb_mcp_p1', 'ready')`,
		`INSERT INTO mcp_settings (id, port, token) VALUES (1, 13979, 'legacy-token-123')`,
	}
	for _, q := range legacy {
		if _, err := raw.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	// Simulate the sidecar-written credential: same v1 vault format with the
	// key file beside the database.
	bundle := MCPCredentialBundle{Kind: engines.KindPostgres, Username: "mcp_ro", Password: "secret"}
	ciphertext, err := encryptMCPCredential(path, "p1", "kamehadb_mcp_p1", bundle, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(
		`UPDATE mcp_managed_accounts SET credential_ciphertext = ? WHERE profile_id = 'p1'`,
		ciphertext); err != nil {
		t.Fatal(err)
	}
	raw.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	defer s.Close()

	settings, err := s.GetMCPSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.Token != "legacy-token-123" {
		t.Errorf("token = %q, want the legacy token preserved", settings.Token)
	}
	profiles, err := s.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 || profiles[0].Kind != engines.KindPostgres {
		t.Fatalf("profiles after migration = %+v", profiles)
	}
	has, err := s.HasMCPManagedCredential("p1")
	if err != nil || !has {
		t.Fatalf("credential row lost in migration: has=%v err=%v", has, err)
	}
	loaded, err := s.LoadMCPManagedCredential("p1")
	if err != nil {
		t.Fatalf("decrypt after migration: %v", err)
	}
	if loaded == nil || loaded.Username != "mcp_ro" || loaded.Password != "secret" {
		t.Fatalf("credential = %+v, want the seeded bundle", loaded)
	}
}

// Legacy profile tables have no policy column; migration must add it and
// default every existing row to read-only so an upgrade cannot enable writes.
func TestLegacyConnectionProfilesMigrateReadOnly(t *testing.T) {
	for _, withCACert := range []bool{false, true} {
		s, err := Open(createLegacyProfileDB(t, withCACert))
		if err != nil {
			t.Fatalf("open legacy profile database: %v", err)
		}
		if !s.hasColumn("connection_profiles", "read_only") {
			s.Close()
			t.Fatal("read_only column missing after migration")
		}
		profile, err := s.GetProfile("legacy")
		if err != nil || profile == nil {
			s.Close()
			t.Fatalf("get migrated profile = %+v, err = %v", profile, err)
		}
		if !profile.ReadOnly {
			s.Close()
			t.Fatal("legacy profile should migrate to read-only")
		}
		if readOnly, err := s.ProfileReadOnly("legacy"); err != nil || !readOnly {
			s.Close()
			t.Fatalf("ProfileReadOnly = %v, %v", readOnly, err)
		}
		s.Close()
	}
}
