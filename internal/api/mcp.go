package api

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/google/uuid"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/mcp"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// McpService exposes the mcp-settings route surface over Wails: listener
// settings, managed accounts, and the prepare/provision/revoke flow.
type McpService struct {
	store   *store.Store
	runtime *mcp.Runtime

	mu           sync.Mutex
	provisioning map[string]bool
	revoking     map[string]bool
}

func NewMcpService(s *store.Store, runtime *mcp.Runtime) *McpService {
	return &McpService{store: s, runtime: runtime, provisioning: map[string]bool{}, revoking: map[string]bool{}}
}

// GetMCPSettings mirrors GET /mcp/settings.
func (s *McpService) GetMCPSettings() (*mcp.SettingsResponse, error) {
	return s.runtime.SettingsResponse()
}

// UpdateMCPPort mirrors PATCH /mcp/settings — UpdateMcpPortSchema bounds.
func (s *McpService) UpdateMCPPort(port int64) (*mcp.SettingsResponse, error) {
	if port < 1 || port > 65535 {
		return nil, errors.New("port must be between 1 and 65535")
	}
	if err := s.runtime.UpdatePort(port); err != nil {
		return nil, err
	}
	return s.runtime.SettingsResponse()
}

// RetryMCPListener mirrors POST /mcp/settings/retry.
func (s *McpService) RetryMCPListener() (*mcp.SettingsResponse, error) {
	s.runtime.Retry()
	return s.runtime.SettingsResponse()
}

// RotateMCPToken mirrors POST /mcp/settings/rotate-token.
func (s *McpService) RotateMCPToken() (*mcp.SettingsResponse, error) {
	if _, err := s.runtime.RotateToken(); err != nil {
		return nil, err
	}
	return s.runtime.SettingsResponse()
}

// ManagedAccountStatus mirrors McpManagedAccountStatus in shared.
type ManagedAccountStatus struct {
	ProfileID           string  `json:"profileId"`
	Applicable          bool    `json:"applicable"`
	State               *string `json:"state"`
	CredentialAvailable bool    `json:"credentialAvailable"`
}

// GetMCPAccounts mirrors GET /mcp/accounts.
func (s *McpService) GetMCPAccounts() (map[string]any, error) {
	records, err := s.store.ListMCPManagedAccounts()
	if err != nil {
		return nil, err
	}
	byProfile := map[string]string{}
	for _, rec := range records {
		byProfile[rec.ProfileID] = rec.State
	}
	profiles, err := s.store.ListProfiles()
	if err != nil {
		return nil, err
	}
	accounts := []ManagedAccountStatus{}
	for i := range profiles {
		p := &profiles[i]
		var state *string
		if v, ok := byProfile[p.ID]; ok {
			state = &v
		}
		accounts = append(accounts, ManagedAccountStatus{
			ProfileID:           p.ID,
			Applicable:          engines.IsMCPServerKind(p.Kind) || p.Kind == engines.KindSQLite,
			State:               state,
			CredentialAvailable: s.runtime.Manager.HasCredential(p.ID),
		})
	}
	return map[string]any{"accounts": accounts}, nil
}

// PrepareMCPAccount mirrors POST /mcp/profiles/:id/account/prepare.
func (s *McpService) PrepareMCPAccount(profileID string) (map[string]any, error) {
	profile, err := s.store.GetProfile(profileID)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, errConnectionNotFound
	}
	if !engines.IsMCPServerKind(profile.Kind) {
		return nil, errors.New("This database does not use a managed MCP account")
	}
	account, err := s.store.GetMCPManagedAccount(profileID)
	if err != nil {
		return nil, err
	}
	if account != nil {
		return nil, errors.New("Revoke the existing MCP account before setting it up again")
	}

	accountRef := uuid.NewString()
	accountCreated := false
	fail := func(err error) (map[string]any, error) {
		if accountCreated {
			_, _ = s.store.ClearMCPManagedAccount(profileID)
		}
		var opErr *mcp.AccountOperationError
		if errors.As(err, &opErr) {
			return nil, errors.New(opErr.Message)
		}
		return nil, errors.New("MCP credential could not be stored locally")
	}
	credential, err := mcp.PrepareAccount(profile, accountRef)
	if err != nil {
		return fail(err)
	}
	if _, err := s.store.CreateMCPManagedAccount(profileID, accountRef); err != nil {
		return fail(err)
	}
	accountCreated = true
	if err := s.store.SaveMCPManagedCredential(profileID, *credential); err != nil {
		return fail(err)
	}
	stored, err := s.store.LoadMCPManagedCredential(profileID)
	if err != nil {
		return fail(err)
	}
	if stored == nil || !mcp.IsManagedCredentialForProfile(profile, accountRef, stored) {
		return fail(mcp.PrepareVerifyFailed)
	}
	s.runtime.Manager.SetCredential(profileID, stored)
	return map[string]any{"profileId": profileID, "state": store.MCPStatePrepared}, nil
}

// ProvisionMCPAccount mirrors POST /mcp/profiles/:id/account/provision.
func (s *McpService) ProvisionMCPAccount(profileID string) (map[string]any, error) {
	s.mu.Lock()
	if s.provisioning[profileID] || s.revoking[profileID] {
		s.mu.Unlock()
		return nil, errors.New("Another MCP account operation is in progress")
	}
	s.provisioning[profileID] = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.provisioning, profileID)
		s.mu.Unlock()
	}()

	profile, err := s.store.GetProfile(profileID)
	if err != nil {
		return nil, err
	}
	account, err := s.store.GetMCPManagedAccount(profileID)
	if err != nil {
		return nil, err
	}
	if profile == nil || account == nil {
		return nil, errors.New("MCP account setup is incomplete")
	}
	if account.State != store.MCPStatePrepared {
		return nil, errors.New("MCP account is not ready to provision")
	}
	credential := s.runtime.Manager.GetCredential(profileID)
	if credential == nil {
		return nil, errors.New("The prepared credential is unavailable; revoke and create the account again")
	}
	adminPassword, err := s.store.GetProfilePassword(profileID)
	if err != nil {
		return nil, err
	}

	databaseWriteStarted := false
	err = mcp.ProvisionAccount(context.Background(), profile, adminPassword, account.AccountRef, credential,
		func() error {
			ok, err := s.store.SetMCPManagedAccountState(profileID, store.MCPStateProvisioning)
			if err != nil || !ok {
				return errors.New("MCP account state could not be updated before database changes")
			}
			databaseWriteStarted = true
			return nil
		})
	if err != nil {
		var opErr *mcp.AccountOperationError
		cleanupFailed := errors.As(err, &opErr) && opErr.CleanupFailed
		s.runtime.Manager.ClearCredential(profileID)
		state := store.MCPStatePrepared
		if cleanupFailed {
			state = store.MCPStateRecoveryRequired
		}
		_, _ = s.store.SetMCPManagedAccountState(profileID, state)
		message := "MCP account could not be provisioned"
		if errors.As(err, &opErr) {
			message = opErr.Message
		}
		return nil, fmt.Errorf("%s: %s (databaseWriteStarted=%v)", map[bool]string{true: "RECOVERY_REQUIRED", false: "PROVISIONING_FAILED"}[cleanupFailed], message, databaseWriteStarted)
	}
	_, _ = s.store.SetMCPManagedAccountState(profileID, store.MCPStateReady)
	return map[string]any{"profileId": profileID, "state": store.MCPStateReady}, nil
}

// RevokeMCPAccount mirrors POST /mcp/profiles/:id/account/revoke.
func (s *McpService) RevokeMCPAccount(profileID string) (map[string]any, error) {
	s.mu.Lock()
	if s.provisioning[profileID] || s.revoking[profileID] {
		s.mu.Unlock()
		return nil, errors.New("Another MCP account operation is in progress")
	}
	s.revoking[profileID] = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.revoking, profileID)
		s.mu.Unlock()
	}()

	profile, err := s.store.GetProfile(profileID)
	if err != nil {
		return nil, err
	}
	account, err := s.store.GetMCPManagedAccount(profileID)
	if err != nil {
		return nil, err
	}
	if profile == nil || account == nil {
		return nil, errors.New("Managed MCP account not found")
	}

	if _, err := s.store.SetProfileMCPEnabled(profileID, false); err != nil {
		return nil, err
	}
	s.runtime.Manager.ClearCredential(profileID)
	if account.State != store.MCPStatePrepared && account.State != store.MCPStateLocalCleanupPending {
		adminPassword, err := s.store.GetProfilePassword(profileID)
		if err != nil {
			return nil, err
		}
		if err := mcp.RevokeAccount(context.Background(), profile, adminPassword, account.AccountRef); err != nil {
			_, _ = s.store.SetMCPManagedAccountState(profileID, store.MCPStateRevokeFailed)
			return nil, errors.New("Database account could not be revoked. Retry without changing the profile.")
		}
	}
	// The pending state lets a retry finish local cleanup without dropping
	// the DB account twice.
	_, _ = s.store.SetMCPManagedAccountState(profileID, store.MCPStateLocalCleanupPending)
	if _, err := s.store.ClearMCPManagedAccount(profileID); err != nil {
		return nil, err
	}
	return map[string]any{"profileId": profileID, "revoked": true}, nil
}
