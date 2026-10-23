package mcp

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

const provisionTestTimeout = 30 * time.Second

// The provisioner ran its DDL through conn.Query and never closed the result,
// so the very next statement failed with "conn busy": provisioning reported
// failure while leaving a LOGIN role behind that revoke could not remove either.
// This opt-in test provisions and revokes a managed account against a real
// PostgreSQL and checks the role actually appears and disappears.
func TestProvisionAndRevokePostgresAccount(t *testing.T) {
	dsn := os.Getenv("KAMEHADB_TEST_POSTGRES")
	if dsn == "" {
		t.Skip("set KAMEHADB_TEST_POSTGRES for private fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), provisionTestTimeout)
	defer cancel()
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Registered before the role cleanup below: cleanups run last-in-first-out,
	// so the role is dropped while this connection is still open.
	t.Cleanup(func() { admin.Close(context.Background()) })

	host, port, database, user := cfg.Host, int64(cfg.Port), cfg.Database, cfg.User
	profile := &store.Profile{
		ID: "pg-provision-test", Kind: engines.KindPostgres, Name: "pg",
		Host: &host, Port: &port, Database: &database, Username: &user,
	}
	const accountRef = "provision-integration-test"
	credential, err := PrepareAccount(profile, accountRef)
	if err != nil {
		t.Fatal(err)
	}

	// Remove any role a failed run left behind so the test is repeatable and
	// never leaves one on the shared fixture either way.
	dropRole := func() {
		cleanup, stop := context.WithTimeout(context.Background(), provisionTestTimeout)
		defer stop()
		role := pgx.Identifier{credential.Username}.Sanitize()
		var exists bool
		if err := admin.QueryRow(cleanup, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)`, credential.Username).Scan(&exists); err != nil || !exists {
			return
		}
		_, _ = admin.Exec(cleanup, `REVOKE CONNECT ON DATABASE `+pgx.Identifier{database}.Sanitize()+` FROM `+role)
		_, _ = admin.Exec(cleanup, `DROP ROLE `+role)
	}
	dropRole()
	t.Cleanup(dropRole)

	if err := ProvisionAccount(ctx, profile, cfg.Password, accountRef, credential, func() error { return nil }); err != nil {
		t.Fatalf("provision failed: %v", err)
	}
	var canConnect bool
	if err := admin.QueryRow(ctx, `SELECT has_database_privilege($1, $2, 'CONNECT')`, credential.Username, database).Scan(&canConnect); err != nil || !canConnect {
		t.Fatalf("managed role cannot connect: ok=%v err=%v", canConnect, err)
	}

	if err := RevokeAccount(ctx, profile, cfg.Password, accountRef); err != nil {
		t.Fatalf("revoke failed: %v", err)
	}
	var exists bool
	if err := admin.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)`, credential.Username).Scan(&exists); err != nil || exists {
		t.Fatalf("role still present after revoke: exists=%v err=%v", exists, err)
	}
}
