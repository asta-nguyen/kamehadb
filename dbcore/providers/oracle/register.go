package oracle

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Register adds this engine's factory to the registry (instance-local).
func Register(r *dbcore.Registry) error {
	return r.Register(engines.KindOracle, func(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		a, err := New(cfg)
		if err != nil {
			return nil, err
		}
		return dbcore.NewSQLProvider(a), nil
	})
}
