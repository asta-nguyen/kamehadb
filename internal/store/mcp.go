package store

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// MCP managed-account lifecycle states, persisted in
// mcp_managed_accounts.state and baked into its CHECK constraint.
const (
	MCPStatePrepared            = "prepared"
	MCPStateProvisioning        = "provisioning"
	MCPStateRecoveryRequired    = "recovery_required"
	MCPStateReady               = "ready"
	MCPStateRevokeFailed        = "revoke_failed"
	MCPStateLocalCleanupPending = "keychain_cleanup_pending"
)

// MCPManagedAccountStates is the CHECK list in declaration order.
var MCPManagedAccountStates = []string{
	MCPStatePrepared, MCPStateProvisioning, MCPStateRecoveryRequired,
	MCPStateReady, MCPStateRevokeFailed, MCPStateLocalCleanupPending,
}

// MCPDefaultPort is the MCP listener port seeded into mcp_settings.
const MCPDefaultPort = 13979

// MCPSettings is the singleton mcp_settings row: listener port and the
// bearer token that survives restarts.
type MCPSettings struct {
	Port           int64  `json:"port"`
	Token          string `json:"token"`
	HistoryEnabled bool   `json:"historyEnabled"`
}

// MCPManagedAccount mirrors a mcp_managed_accounts row (credential blob is
// handled by the vault, not this record).
type MCPManagedAccount struct {
	ProfileID  string `json:"profileId"`
	AccountRef string `json:"accountRef"`
	State      string `json:"state"`
}

func (s *Store) GetMCPSettings() (*MCPSettings, error) {
	var settings MCPSettings
	var hist int
	err := s.db.QueryRow(`SELECT port, token, history_enabled FROM mcp_settings WHERE id = 1`).
		Scan(&settings.Port, &settings.Token, &hist)
	if err == sql.ErrNoRows {
		token, err := newMcpToken()
		if err != nil {
			return nil, err
		}
		if _, err := s.db.Exec(`INSERT INTO mcp_settings (id, port, token, history_enabled) VALUES (1, ?, ?, 1)`,
			MCPDefaultPort, token); err != nil {
			return nil, err
		}
		return &MCPSettings{Port: MCPDefaultPort, Token: token, HistoryEnabled: true}, nil
	}
	if err != nil {
		return nil, err
	}
	settings.HistoryEnabled = (hist == 1)
	return &settings, nil
}

func (s *Store) UpdateMCPPort(port int64) (*MCPSettings, error) {
	if _, err := s.GetMCPSettings(); err != nil {
		return nil, err
	}
	if _, err := s.db.Exec(`UPDATE mcp_settings SET port = ? WHERE id = 1`, port); err != nil {
		return nil, err
	}
	return s.GetMCPSettings()
}

func (s *Store) RotateMCPToken() (string, error) {
	token, err := newMcpToken()
	if err != nil {
		return "", err
	}
	if _, err := s.db.Exec(`UPDATE mcp_settings SET token = ? WHERE id = 1`, token); err != nil {
		return "", err
	}
	return token, nil
}

// SetMCPHistoryEnabled updates the persisted recording toggle.
// Enforced at runtime so tool executions cannot bypass settings changes. (What / Why)
func (s *Store) SetMCPHistoryEnabled(enabled bool) (*MCPSettings, error) {
	if _, err := s.GetMCPSettings(); err != nil {
		return nil, err
	}
	val := 0
	if enabled {
		val = 1
	}
	if _, err := s.db.Exec(`UPDATE mcp_settings SET history_enabled = ? WHERE id = 1`, val); err != nil {
		return nil, err
	}
	return s.GetMCPSettings()
}

// MCPHistoryRetentionDays is the retention window matching sidecar policy.
const MCPHistoryRetentionDays = 30

// MCPHistoryListLimit is the maximum number of recent calls to list.
const MCPHistoryListLimit = 50

// MCPCallHistoryEntry mirrors McpCallHistoryEntry in @kamehadb/shared.
type MCPCallHistoryEntry struct {
	ID         string         `json:"id"`
	ProfileID  string         `json:"profileId"`
	ToolName   string         `json:"toolName"`
	Input      map[string]any `json:"input"`
	ExecutedAt string         `json:"executedAt"`
	Status     string         `json:"status"`
	DurationMs int64          `json:"durationMs"`
	ItemCount  *int64         `json:"itemCount"`
	Truncated  bool           `json:"truncated"`
	ErrorCode  *string        `json:"errorCode,omitempty"`
}

// PruneMCPCallHistory removes expired inputs past retention days.
// Keeps metadata store bounded and avoids lingering sensitive queries. (What / Why)
func (s *Store) PruneMCPCallHistory() error {
	cutoff := time.Now().UTC().AddDate(0, 0, -MCPHistoryRetentionDays).Format(time.RFC3339)
	_, err := s.db.Exec(`DELETE FROM mcp_call_history WHERE executed_at < ?`, cutoff)
	return err
}

// RecordMCPCallHistory persists an executed tool call if history is enabled.
// Bounded to input metadata without persisting sensitive result rows. (What / Why)
func (s *Store) RecordMCPCallHistory(entry MCPCallHistoryEntry) error {
	_ = s.PruneMCPCallHistory()
	settings, err := s.GetMCPSettings()
	if err != nil || !settings.HistoryEnabled {
		return err
	}
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	inputBytes, err := json.Marshal(entry.Input)
	if err != nil {
		inputBytes = []byte("{}")
	}
	truncInt := 0
	if entry.Truncated {
		truncInt = 1
	}
	_, err = s.db.Exec(`INSERT INTO mcp_call_history
		(id, profile_id, tool_name, input_json, executed_at, status, duration_ms, item_count, truncated, error_code)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID, entry.ProfileID, entry.ToolName, string(inputBytes), entry.ExecutedAt,
		entry.Status, entry.DurationMs, entry.ItemCount, truncInt, entry.ErrorCode)
	return err
}

// ListMCPCallHistory returns newest-first MCP calls up to the given limit.
func (s *Store) ListMCPCallHistory(limit int) ([]MCPCallHistoryEntry, error) {
	_ = s.PruneMCPCallHistory()
	if limit <= 0 {
		limit = MCPHistoryListLimit
	}
	rows, err := s.db.Query(`SELECT id, profile_id, tool_name, input_json, executed_at, status, duration_ms, item_count, truncated, error_code
		FROM mcp_call_history ORDER BY executed_at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []MCPCallHistoryEntry
	for rows.Next() {
		var e MCPCallHistoryEntry
		var inputJSON string
		var truncInt int
		if err := rows.Scan(&e.ID, &e.ProfileID, &e.ToolName, &inputJSON, &e.ExecutedAt, &e.Status, &e.DurationMs, &e.ItemCount, &truncInt, &e.ErrorCode); err != nil {
			return nil, err
		}
		e.Truncated = (truncInt == 1)
		_ = json.Unmarshal([]byte(inputJSON), &e.Input)
		if e.Input == nil {
			e.Input = map[string]any{}
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []MCPCallHistoryEntry{}
	}
	return entries, nil
}

// ClearMCPCallHistory deletes all recorded MCP call records.
func (s *Store) ClearMCPCallHistory() error {
	_, err := s.db.Exec(`DELETE FROM mcp_call_history`)
	return err
}

func (s *Store) GetMCPManagedAccount(profileID string) (*MCPManagedAccount, error) {
	var a MCPManagedAccount
	err := s.db.QueryRow(
		`SELECT profile_id, keychain_ref, state FROM mcp_managed_accounts WHERE profile_id = ?`,
		profileID).Scan(&a.ProfileID, &a.AccountRef, &a.State)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Store) ListMCPManagedAccounts() ([]MCPManagedAccount, error) {
	rows, err := s.db.Query(
		`SELECT profile_id, keychain_ref, state FROM mcp_managed_accounts ORDER BY profile_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MCPManagedAccount
	for rows.Next() {
		var a MCPManagedAccount
		if err := rows.Scan(&a.ProfileID, &a.AccountRef, &a.State); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// CreateMCPManagedAccount records the reference before credentials exist so
// interrupted setup can be safely discarded.
func (s *Store) CreateMCPManagedAccount(profileID, accountRef string) (*MCPManagedAccount, error) {
	if _, err := s.db.Exec(
		`INSERT INTO mcp_managed_accounts (profile_id, keychain_ref, state) VALUES (?, ?, ?)`,
		profileID, accountRef, MCPStatePrepared); err != nil {
		return nil, err
	}
	return s.GetMCPManagedAccount(profileID)
}

func (s *Store) SetMCPManagedAccountState(profileID, state string) (bool, error) {
	res, err := s.db.Exec(`UPDATE mcp_managed_accounts SET state = ? WHERE profile_id = ?`,
		state, profileID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

func (s *Store) ClearMCPManagedAccount(profileID string) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM mcp_managed_accounts WHERE profile_id = ?`, profileID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// HasMCPManagedCredential reports whether a ciphertext is persisted — the
// durable form of the MCP manager's in-memory hasCredential check.
func (s *Store) HasMCPManagedCredential(profileID string) (bool, error) {
	var n int64
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM mcp_managed_accounts WHERE profile_id = ? AND credential_ciphertext IS NOT NULL`,
		profileID).Scan(&n)
	return n > 0, err
}

func (s *Store) SetProfileMCPEnabled(id string, enabled bool) (*Profile, error) {
	v := int64(0)
	if enabled {
		v = 1
	}
	res, err := s.db.Exec(`UPDATE connection_profiles SET mcp_enabled = ? WHERE id = ?`, v, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	return s.GetProfile(id)
}
