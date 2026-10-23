package duckdb

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Register adds the DuckDB factory, binding the runtime directory resolver
// and optional diagnostic logger into this registration. Options are
// per-registry: different registries may supply different runtimes without
// sharing package state.
func Register(r *dbcore.Registry, dir func() (string, error), logf func(string)) error {
	return r.Register(engines.KindDuckDB, func(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		a, err := New(cfg.FilePath, dir, logf)
		if err != nil {
			return nil, err
		}
		return dbcore.NewSQLProvider(a), nil
	})
}
