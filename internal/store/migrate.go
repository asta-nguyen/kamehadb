package store

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// migrate applies the metadata schema, mirroring the migration sequence in
// the old metadata-store.ts statement for statement. Ordering matters:
// table rebuilds drop columns not in their explicit list, and the snapshot
// of connection_profiles' DDL is read once before any rebuild runs.
func (s *Store) migrate() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS connection_profiles (
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
		mcp_enabled INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return err
	}

	for _, col := range []string{"password", "color", "connection_string"} {
		if err := s.addColumn("connection_profiles", col, "TEXT"); err != nil {
			return err
		}
	}

	profilesSQL := s.tableSQL("connection_profiles")
	rebuild := func(checkList string) error {
		return s.rebuildProfiles(checkList)
	}
	if profilesSQL != "" && !strings.Contains(profilesSQL, "clickhouse") {
		if err := rebuild("'postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse','tigerbeetle'"); err != nil {
			return err
		}
	}
	if profilesSQL != "" && !strings.Contains(profilesSQL, "qdrant") {
		if err := rebuild("'postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse'"); err != nil {
			return err
		}
	}
	if profilesSQL != "" && !strings.Contains(profilesSQL, "mariadb") {
		if err := rebuild("'postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse','mariadb','duckdb','tigerbeetle'"); err != nil {
			return err
		}
	}
	if profilesSQL != "" && !strings.Contains(profilesSQL, "tigerbeetle") {
		if err := rebuild("'postgres','sqlite','mysql','redis','mongodb','qdrant','sqlserver','oracle','clickhouse','mariadb','duckdb','tigerbeetle'"); err != nil {
			return err
		}
	}

	// mcp_enabled is added after the kind rebuilds because they copy an
	// explicit column list and would drop it on a legacy database.
	if err := s.addColumn("connection_profiles", "mcp_enabled", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}

	// Drop legacy profiles for engines that were removed in the rewrite (Qdrant & TigerBeetle).
	_, _ = s.db.Exec("DELETE FROM connection_profiles WHERE kind IN ('tigerbeetle', 'qdrant')")

	managedStates := "'" + strings.Join(MCPManagedAccountStates, "', '") + "'"
	if _, err := s.db.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS mcp_managed_accounts (
		profile_id TEXT PRIMARY KEY,
		keychain_ref TEXT NOT NULL UNIQUE,
		state TEXT NOT NULL CHECK(state IN (%s)),
		credential_ciphertext TEXT
	)`, managedStates)); err != nil {
		return err
	}

	managedAccountsSQL := s.tableSQL("mcp_managed_accounts")
	cleanupPending := "'" + MCPStateLocalCleanupPending + "'"
	if managedAccountsSQL != "" && !strings.Contains(managedAccountsSQL, cleanupPending) {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		stmts := []string{
			`ALTER TABLE mcp_managed_accounts RENAME TO mcp_managed_accounts_old`,
			fmt.Sprintf(`CREATE TABLE mcp_managed_accounts (
				profile_id TEXT PRIMARY KEY,
				keychain_ref TEXT NOT NULL UNIQUE,
				state TEXT NOT NULL CHECK(state IN (%s))
			)`, managedStates),
			`INSERT INTO mcp_managed_accounts (profile_id, keychain_ref, state)
				SELECT profile_id, keychain_ref, state FROM mcp_managed_accounts_old`,
			`DROP TABLE mcp_managed_accounts_old`,
		}
		for _, q := range stmts {
			if _, err := tx.Exec(q); err != nil {
				tx.Rollback()
				return err
			}
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	if err := s.addColumn("mcp_managed_accounts", "credential_ciphertext", "TEXT"); err != nil {
		return err
	}

	// An interrupted create may have reached the database, so keep the
	// record for explicit cleanup.
	if _, err := s.db.Exec(`UPDATE mcp_managed_accounts SET state = ? WHERE state = ?`,
		MCPStateRecoveryRequired, MCPStateProvisioning); err != nil {
		return err
	}

	placeholders := make([]string, len(engines.MCPServerKinds))
	for i := range placeholders {
		placeholders[i] = "?"
	}
	args := make([]any, 0, len(engines.MCPServerKinds)+1)
	for _, kind := range engines.MCPServerKinds {
		args = append(args, kind)
	}
	args = append(args, MCPStateReady)
	if _, err := s.db.Exec(fmt.Sprintf(`
		UPDATE connection_profiles
		SET mcp_enabled = 0
		WHERE mcp_enabled <> 0
			AND kind IN (%s)
			AND NOT EXISTS (
				SELECT 1 FROM mcp_managed_accounts AS managed
				WHERE managed.profile_id = connection_profiles.id
					AND managed.state = ?
			)`, strings.Join(placeholders, ", ")), args...); err != nil {
		return err
	}

	// Failed or interrupted accounts cannot remain MCP-enabled after restart.
	if _, err := s.db.Exec(`
		UPDATE connection_profiles
		SET mcp_enabled = 0
		WHERE id IN (
			SELECT profile_id FROM mcp_managed_accounts WHERE state <> ?
		)`, MCPStateReady); err != nil {
		return err
	}

	// Legacy ai_settings tables without a key column are dropped wholesale.
	if s.tableSQL("ai_settings") != "" && !s.hasColumn("ai_settings", "key") {
		if _, err := s.db.Exec(`DROP TABLE ai_settings; DROP TABLE IF EXISTS ai_provider_configs;`); err != nil {
			return err
		}
	}

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS ai_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS ai_provider_configs (
			provider TEXT PRIMARY KEY,
			enabled INTEGER NOT NULL DEFAULT 0,
			model TEXT NOT NULL DEFAULT '',
			base_url TEXT,
			api_key TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS chat_messages (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			mongo_database TEXT,
			role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
			content TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_connection ON chat_messages(connection_id)`,
		`CREATE TABLE IF NOT EXISTS query_history (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			query TEXT NOT NULL,
			executed_at TEXT NOT NULL,
			duration_ms INTEGER,
			row_count INTEGER,
			favorite INTEGER NOT NULL DEFAULT 0,
			name TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_query_history_connection ON query_history(connection_id)`,
		`CREATE INDEX IF NOT EXISTS idx_query_history_favorite ON query_history(connection_id, favorite)`,
		`CREATE TABLE IF NOT EXISTS schema_snapshots (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			captured_at TEXT NOT NULL,
			snapshot_data TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_schema_snaps_conn ON schema_snapshots(connection_id)`,
		`CREATE TABLE IF NOT EXISTS schema_watchers (
			connection_id TEXT PRIMARY KEY,
			cadence_enabled INTEGER NOT NULL DEFAULT 0,
			notify_enabled INTEGER NOT NULL DEFAULT 0,
			interval_ms INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}

	if err := s.addColumn("chat_messages", "mongo_database", "TEXT"); err != nil {
		return err
	}

	// Normalize chat_messages.created_at to ISO 8601 (rows inserted before
	// the format change may carry datetime('now') values).
	if _, err := s.db.Exec(`
		UPDATE chat_messages
		SET created_at = printf('%s.000Z', created_at)
		WHERE created_at NOT LIKE '%Z'
			AND created_at NOT LIKE '%+'
			AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] *'`); err != nil {
		return err
	}

	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS schema_embeddings (
			connection_id TEXT NOT NULL,
			table_id TEXT NOT NULL,
			ddl TEXT NOT NULL,
			hash TEXT NOT NULL,
			PRIMARY KEY (connection_id, table_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_schema_embeddings_conn ON schema_embeddings(connection_id)`,
		`CREATE TABLE IF NOT EXISTS mcp_settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			port INTEGER NOT NULL,
			token TEXT NOT NULL,
			history_enabled INTEGER NOT NULL DEFAULT 1
		)`,
		`CREATE TABLE IF NOT EXISTS mcp_call_history (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL,
			tool_name TEXT NOT NULL,
			input_json TEXT NOT NULL,
			executed_at TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('success', 'error')),
			duration_ms INTEGER NOT NULL,
			item_count INTEGER,
			truncated INTEGER NOT NULL DEFAULT 0,
			error_code TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_mcp_call_history_executed_at
			ON mcp_call_history (executed_at DESC)`,
	} {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}

	if err := s.addColumn("mcp_settings", "history_enabled", "INTEGER NOT NULL DEFAULT 1"); err != nil {
		return err
	}

	var hasSettings int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM mcp_settings WHERE id = 1`).Scan(&hasSettings); err != nil {
		return err
	}
	if hasSettings == 0 {
		token, err := newMcpToken()
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(`INSERT INTO mcp_settings (id, port, token, history_enabled) VALUES (1, ?, ?, 1)`,
			MCPDefaultPort, token); err != nil {
			return err
		}
	}

	if err := s.seedDefaultAIProviders(); err != nil {
		return err
	}
	return s.migrateLegacyAIConfig()
}

// tableSQL returns the CREATE DDL for a table, or "" when it does not exist.
func (s *Store) tableSQL(name string) string {
	var ddl string
	err := s.db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&ddl)
	if err == sql.ErrNoRows {
		return ""
	}
	if err != nil {
		return ""
	}
	return ddl
}

// validIdent guards identifier interpolation: PRAGMA and DDL cannot bind
// table/column names, so only plain identifiers are allowed through.
func validIdent(name string) bool {
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_') {
			return false
		}
	}
	return name != ""
}

func (s *Store) hasColumn(table, column string) bool {
	if !validIdent(table) {
		return false
	}
	rows, err := s.db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return false
		}
		if name == column {
			return true
		}
	}
	return false
}

// addColumn runs ALTER TABLE ADD COLUMN and tolerates the duplicate-column
// error so migrations stay idempotent like the TS try/catch version.
func (s *Store) addColumn(table, column, def string) error {
	_, err := s.db.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, def))
	if err != nil && strings.Contains(err.Error(), "duplicate column name") {
		return nil
	}
	return err
}

// rebuildProfiles rebuilds connection_profiles with a new kind CHECK list.
// The explicit column copy drops anything not listed (including
// mcp_enabled, which is re-added by a later step — same as upstream).
func (s *Store) rebuildProfiles(checkList string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	stmts := []string{
		fmt.Sprintf(`CREATE TABLE connection_profiles_new (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			kind TEXT NOT NULL CHECK(kind IN (%s)),
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
		)`, checkList),
		`INSERT INTO connection_profiles_new
			SELECT id, name, kind, host, port, database, username, password, ssl, file_path,
				color, connection_string, created_at, updated_at
			FROM connection_profiles`,
		`DROP TABLE connection_profiles`,
		`ALTER TABLE connection_profiles_new RENAME TO connection_profiles`,
	}
	for _, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
