package engines

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"
)

type budgetTestDriver struct{}
type budgetTestConn struct{}
type budgetTestRows struct {
	ctx   context.Context
	index int
}

func (budgetTestDriver) Open(string) (driver.Conn, error)  { return budgetTestConn{}, nil }
func (budgetTestConn) Close() error                        { return nil }
func (budgetTestConn) Begin() (driver.Tx, error)           { return nil, errors.New("not supported") }
func (budgetTestConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not supported") }
func (budgetTestConn) QueryContext(ctx context.Context, _ string, _ []driver.NamedValue) (driver.Rows, error) {
	return &budgetTestRows{ctx: ctx}, nil
}
func (*budgetTestRows) Columns() []string { return []string{"payload"} }
func (r *budgetTestRows) Close() error    { return nil }
func (r *budgetTestRows) Next(values []driver.Value) error {
	if r.ctx.Err() != nil {
		return r.ctx.Err()
	}
	if r.index == 10 {
		return io.EOF
	}
	r.index++
	values[0] = strings.Repeat("é", 128)
	return nil
}

func init() { sql.Register("kameha-budget-test", budgetTestDriver{}) }

// A real database/sql cursor exercises its cancellation watcher, not just
// the budget arithmetic, so early-stop cancellation stays regression-covered.
func TestCollectSQLRowsCancelsBeforeCallerClose(t *testing.T) {
	for _, maxRows := range []int64{2, 0} {
		parent := context.Background()
		ctx, cancel := context.WithCancel(parent)
		db, err := sql.Open("kameha-budget-test", "")
		if err != nil {
			t.Fatal(err)
		}
		rows, err := db.QueryContext(ctx, "synthetic")
		if err != nil {
			t.Fatal(err)
		}
		budget := NewResultBudget(parent, cancel, maxRows, resultEnvelopeReserve+600)
		_, admitted, truncated, err := CollectSQLRows(rows, []QueryColumn{{Name: "payload"}}, maxRows, func(v any) any { return v }, budget)
		if err != nil || !truncated || len(admitted) == 0 || ctx.Err() == nil {
			t.Fatalf("early stop: rows=%d truncated=%v error=%v context=%v", len(admitted), truncated, err, ctx.Err())
		}
		rows.Close()
		db.Close()
		cancel()
	}
}
