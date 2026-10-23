package api

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/mcp"
	"github.com/asta-nguyen/kamehadb/internal/store"
	keyringpkg "github.com/zalando/go-keyring"
)

// One profile yields two independent sessions: the GUI managed provider and
// the MCP scoped adapter never share credentials, instances or teardown.
// Missing MCP credentials fail closed instead of resolving the GUI password.
func TestProviderMCPIsolation(t *testing.T) {
	root := t.TempDir()
	metadata, err := store.Open(filepath.Join(root, "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()
	keyring := map[string]string{}
	restore := store.SetKeyringHooksForTest(
		func(s, u string) (string, error) {
			v, ok := keyring[s+"/"+u]
			if !ok {
				return "", keyringpkg.ErrNotFound
			}
			return v, nil
		},
		func(s, u, p string) error { keyring[s+"/"+u] = p; return nil },
	)
	defer restore()

	name, kind := "iso", engines.KindPostgres
	user, pw, dbName := "gui_u", "gui_pw", "appdb"
	profile, err := metadata.CreateProfile(store.ProfileInput{
		Name: &name, Kind: &kind, Username: &user, Password: &pw, Database: &dbName, Host: ptr("h"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := metadata.SetProfileMCPEnabled(profile.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := metadata.CreateMCPManagedAccount(profile.ID, "ref-iso"); err != nil {
		t.Fatal(err)
	}
	if _, err := metadata.SetMCPManagedAccountState(profile.ID, store.MCPStateReady); err != nil {
		t.Fatal(err)
	}

	db := testDBEmpty(t, metadata)
	f := newLifecycleFakes(t, db)
	mgr := mcp.NewAdapterManager(metadata)
	defer mgr.CloseAll()

	call := func() (*mcp.Connection, error) {
		var conn *mcp.Connection
		_, err := mgr.WithConnection(context.Background(), profile.ID, func(c *mcp.Connection) (any, error) {
			conn = c
			return nil, nil
		})
		return conn, err
	}

	// No managed credential: MCP fails closed while the GUI lookup works.
	guiAdapter, err := db.Get(context.Background(), profile.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := call(); err == nil || !strings.Contains(err.Error(), "credential is unavailable") {
		t.Fatalf("MCP without credential: %v", err)
	}
	if f.sqlCalls.Load() != 1 {
		t.Fatal("MCP failure touched the GUI provider")
	}

	// With a managed credential the MCP session is a different instance.
	mgr.SetCredential(profile.ID, &store.MCPCredentialBundle{Kind: engines.KindPostgres, Username: "mcp_ro", Password: "mcp_pw"})
	conn1, err := call()
	if err != nil {
		t.Fatal(err)
	}
	if conn1.SQL == nil || conn1.Kind != "sql" {
		t.Fatalf("mcp connection: %+v", conn1)
	}
	// GUI invalidation closes only the GUI provider; the MCP session survives.
	db.Invalidate(profile.ID)
	if f.sqlClose.Load() != 1 {
		t.Fatal("GUI invalidate did not close its provider once")
	}
	conn2, err := call()
	if err != nil {
		t.Fatal(err)
	}
	if conn2.SQL != conn1.SQL {
		t.Fatal("GUI invalidation retired the MCP session")
	}
	// MCP invalidation closes only its session; the GUI manager rebuilds.
	mgr.Invalidate(profile.ID)
	conn3, err := call()
	if err != nil {
		t.Fatal(err)
	}
	if conn3.SQL == conn1.SQL {
		t.Fatal("MCP invalidate did not retire its own session")
	}
	if _, err := db.Get(context.Background(), profile.ID); err != nil {
		t.Fatal(err)
	}
	if f.sqlCalls.Load() != 2 {
		t.Fatalf("gui rebuilt %d providers, want 2", f.sqlCalls.Load())
	}
	_ = guiAdapter
}

func ptr(s string) *string { return &s }
