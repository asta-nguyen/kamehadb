package store

import "database/sql"

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
	Port  int64  `json:"port"`
	Token string `json:"token"`
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
	err := s.db.QueryRow(`SELECT port, token FROM mcp_settings WHERE id = 1`).
		Scan(&settings.Port, &settings.Token)
	if err == sql.ErrNoRows {
		token, err := newMcpToken()
		if err != nil {
			return nil, err
		}
		if _, err := s.db.Exec(`INSERT INTO mcp_settings (id, port, token) VALUES (1, ?, ?)`,
			MCPDefaultPort, token); err != nil {
			return nil, err
		}
		return &MCPSettings{Port: MCPDefaultPort, Token: token}, nil
	}
	if err != nil {
		return nil, err
	}
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
