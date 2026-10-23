package mysql

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Register adds MySQL and MariaDB factories (same adapter, legacy mapping).
func Register(r *dbcore.Registry) error {
	for _, kind := range []string{engines.KindMySQL, engines.KindMariaDB} {
		if err := r.Register(kind, func(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
			a, err := New(cfg)
			if err != nil {
				return nil, err
			}
			return dbcore.NewSQLProvider(a), nil
		}); err != nil {
			return err
		}
	}
	return nil
}
