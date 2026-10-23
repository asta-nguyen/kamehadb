package api

import (
	"context"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/database"
)

// testDB builds the shared facade over a fake loader for service fixtures.
func testDB(t *testing.T, loader dbcore.ProfileLoader) *database.DB {
	t.Helper()
	db, err := database.New(loader)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// testRegister bridges a legacy-style adapter factory onto the facade
// registry for fixtures that previously used engines.RegisterFactory.
func testRegister(t *testing.T, db *database.DB, kind string, f func(engines.ConnProfile) (engines.SQLAdapter, error)) {
	t.Helper()
	err := db.Registry.Register(kind, func(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		a, err := f(cfg)
		if err != nil {
			return nil, err
		}
		return dbcore.NewSQLProvider(a), nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
