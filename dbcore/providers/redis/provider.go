package redis

import (
	"context"
	"strconv"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	dbredis "github.com/asta-nguyen/kamehadb/dbcore/redis"
)

// Provider adapts the adapter to the common lifecycle; the contract
// capability is the adapter itself.
type Provider struct{ *Adapter }

// Redis exposes the driver-free operations capability.
func (p Provider) Redis() dbredis.Operations { return p.Adapter }

// Register adds the Redis factory to the registry. The factory owns the
// ConnProfile -> native Config mapping: host/port/password plus a
// nonnegative parsed logical database, defaulting to zero for empty,
// invalid or negative input.
func Register(r *dbcore.Registry) error {
	return r.Register(engines.KindRedis, func(ctx context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		rc := Config{Host: cfg.Host, Port: cfg.Port, Password: cfg.Password}
		if n, err := strconv.Atoi(cfg.Database); err == nil && n >= 0 {
			rc.Database = n
		}
		return Provider{New(rc)}, nil
	})
}
