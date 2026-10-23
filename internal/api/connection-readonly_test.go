package api

import (
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// The GUI write policy is not part of the MCP-protected connection identity,
// so a managed read-only MCP account must not block the user from changing it.
func TestReadOnlySettingCanChangeWithManagedMCPAccount(t *testing.T) {
	metadata, err := store.Open(filepath.Join(t.TempDir(), "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()

	name, kind := "managed", engines.KindPostgres
	profile, err := metadata.CreateProfile(store.ProfileInput{Name: &name, Kind: &kind})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := metadata.DB().Exec(
		`INSERT INTO mcp_managed_accounts (profile_id, keychain_ref, state) VALUES (?, 'ref', ?)`,
		profile.ID, store.MCPStateReady); err != nil {
		t.Fatal(err)
	}

	service := NewConnectionsService(metadata, testDB(t, &requestSQLLoader{}))
	writable := false
	updated, err := service.UpdateConnection(profile.ID, store.ProfileInput{ReadOnly: &writable})
	if err != nil {
		t.Fatalf("change GUI policy with managed MCP account: %v", err)
	}
	if updated.ReadOnly {
		t.Fatal("explicit false did not persist")
	}

	host := "elsewhere"
	if _, err := service.UpdateConnection(profile.ID, store.ProfileInput{Host: &host}); err == nil {
		t.Fatal("MCP-protected target change should still be rejected")
	}
}
