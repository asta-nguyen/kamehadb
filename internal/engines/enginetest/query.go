// Package enginetest captures database/sql dispatch for dialect regressions.
// It verifies query/parameter construction, not a live server's plans/collation.
package enginetest

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"testing"
)

type QueryFunc func(context.Context, string, []driver.NamedValue) (driver.Rows, error)

type (
	connector  struct{ query QueryFunc }
	connection struct{ query QueryFunc }
	stubDriver struct{}
)

func DB(t *testing.T, query QueryFunc) *sql.DB {
	t.Helper()
	db := sql.OpenDB(connector{query})
	t.Cleanup(func() { db.Close() })
	return db
}

func (c connector) Connect(context.Context) (driver.Conn, error) { return connection(c), nil }
func (c connector) Driver() driver.Driver                        { return stubDriver{} }
func (stubDriver) Open(string) (driver.Conn, error)              { return nil, errors.New("use connector") }

func (connection) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepared query")
}

func (connection) Begin() (driver.Tx, error)                { return nil, errors.New("unexpected transaction") }
func (connection) Close() error                             { return nil }
func (connection) CheckNamedValue(*driver.NamedValue) error { return nil }
func (c connection) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	return c.query(ctx, query, args)
}

type Rows struct {
	Names    []string
	Values   [][]driver.Value
	position int
}

func (r *Rows) Columns() []string { return r.Names }
func (r *Rows) Close() error      { return nil }
func (r *Rows) Next(values []driver.Value) error {
	if r.position >= len(r.Values) {
		return io.EOF
	}
	copy(values, r.Values[r.position])
	r.position++
	return nil
}
