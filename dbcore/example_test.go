package dbcore_test

// Executable examples for the two supported assembly modes (plan #110,
// Task 6): selective registration + uncached probes, and the all-in-one
// registry + managed per-id providers. SQLite keeps them self-contained.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/all"
	"github.com/asta-nguyen/kamehadb/dbcore/providers/sqlite"
)

func newTempDB() (string, func()) {
	dir, err := os.MkdirTemp("", "dbcore-example")
	if err != nil {
		panic(err)
	}
	return filepath.Join(dir, "example.db"), func() { os.RemoveAll(dir) }
}

// ExampleRegistry_open shows selective use: register only the kinds a caller
// needs, then probe connections without caching. The caller owns the returned
// provider and closes it; Registry keeps nothing.
func ExampleRegistry_open() {
	dbFile, cleanup := newTempDB()
	defer cleanup()

	reg := dbcore.NewRegistry()
	if err := sqlite.Register(reg); err != nil {
		panic(err)
	}

	p, err := reg.Open(context.Background(), engines.KindSQLite, dbcore.Config{FilePath: dbFile})
	if err != nil {
		panic(err)
	}
	defer p.Close()

	adapter, err := dbcore.SQL(p)
	if err != nil {
		panic(err)
	}
	res, err := adapter.RunQuery(context.Background(), engines.RunQueryInput{Query: "select 1 as n"})
	if err != nil {
		panic(err)
	}
	fmt.Println(len(res.Rows))
	// Output: 1
}

// ExampleManager shows all-in-one use: all.New registers every live kind,
// and Manager owns one provider per connection id resolved through a
// ProfileLoader. Callers never close providers themselves; Invalidate retires
// a single id, Close tears everything down.
func ExampleManager() {
	dbFile, cleanup := newTempDB()
	defer cleanup()

	reg, err := all.New(all.Options{})
	if err != nil {
		panic(err)
	}
	m := dbcore.NewManager(loaderFunc(func(id string) (dbcore.Config, error) {
		return dbcore.Config{Kind: engines.KindSQLite, FilePath: dbFile}, nil
	}), reg)
	defer m.Close()

	p, err := m.Get(context.Background(), "conn-1", nil)
	if err != nil {
		panic(err)
	}
	adapter, err := dbcore.SQL(p)
	if err != nil {
		panic(err)
	}
	res, err := adapter.RunQuery(context.Background(), engines.RunQueryInput{Query: "select 1 as n"})
	if err != nil {
		panic(err)
	}
	fmt.Println(len(res.Rows))
	// Output: 1
}

type loaderFunc func(id string) (dbcore.Config, error)

func (f loaderFunc) ProfileForConnect(id string) (dbcore.Config, error) { return f(id) }
