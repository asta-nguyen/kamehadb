// Package all assembles a registry with every live provider registered.
// New performs no connections or downloads.
package all

import (
	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/clickhouse"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/duckdb"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/mongo"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/mysql"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/oracle"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/postgres"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/redis"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/sqlite"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/sqlserver"
)

// Options carries app-owned runtime wiring for providers that need it.
type Options struct {
	// DuckDBRuntimeDir resolves the app data dir for the managed helper.
	DuckDBRuntimeDir func() (string, error)
	// DuckDBLog receives optional diagnostic messages.
	DuckDBLog func(string)
}

// New returns a registry with all ten live kinds registered. Registration is
// instance-local; no provider is constructed here. DuckDB's runtime options
// bind into this registration only — nothing mutates shared package state.
func New(opts Options) (*dbcore.Registry, error) {
	r := dbcore.NewRegistry()
	for _, reg := range []func(*dbcore.Registry) error{
		postgres.Register, mysql.Register, sqlite.Register,
		sqlserver.Register, oracle.Register, clickhouse.Register,
		mongo.Register, redis.Register,
	} {
		if err := reg(r); err != nil {
			return nil, err
		}
	}
	if err := duckdb.Register(r, opts.DuckDBRuntimeDir, opts.DuckDBLog); err != nil {
		return nil, err
	}
	return r, nil
}
