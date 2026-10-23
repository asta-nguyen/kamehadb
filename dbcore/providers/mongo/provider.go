package mongo

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	dbmongo "github.com/asta-nguyen/kamehadb/dbcore/mongo"
)

// Provider adapts the adapter to the common lifecycle: the contract
// capability is the adapter itself; only Close is translated.
type Provider struct{ *Adapter }

func (p Provider) Close() error { return p.Adapter.Close(context.Background()) }

// Mongo exposes the driver-free operations capability.
func (p Provider) Mongo() dbmongo.Operations { return p.Adapter }

// Register adds the MongoDB factory to the registry. The factory owns the
// ConnProfile -> native Config mapping (connection string + database).
func Register(r *dbcore.Registry) error {
	return r.Register(engines.KindMongoDB, func(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		a, err := New(Config{ConnectionString: cfg.ConnectionString, Database: cfg.Database})
		if err != nil {
			return nil, err
		}
		return Provider{a}, nil
	})
}
