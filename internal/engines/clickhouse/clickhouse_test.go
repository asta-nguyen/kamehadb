package clickhouse

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// stubDriver serves canned responses so PreviewRows' search path can be
// exercised without a live server: the system.columns probe either fails or
// returns fixed names, and every other query is recorded and answered with a
// single row. (How / Why / What)
type stubDriver struct {
	probeErr  error
	probeCols []string
	lastQuery string
}

func (d *stubDriver) Open(string) (driver.Conn, error) { return &stubConn{d: d}, nil }

type stubConn struct{ d *stubDriver }

func (c *stubConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare not supported")
}
func (c *stubConn) Close() error              { return nil }
func (c *stubConn) Begin() (driver.Tx, error) { return nil, errors.New("tx not supported") }

func (c *stubConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(query, "system.columns") {
		if c.d.probeErr != nil {
			return nil, c.d.probeErr
		}
		rows := make([][]driver.Value, len(c.d.probeCols))
		for i, name := range c.d.probeCols {
			rows[i] = []driver.Value{name}
		}
		return &stubRows{cols: []string{"name"}, data: rows}, nil
	}
	c.d.lastQuery = query
	return &stubRows{cols: []string{"id"}, data: [][]driver.Value{{int64(1)}}}, nil
}

type stubRows struct {
	cols []string
	data [][]driver.Value
	i    int
}

func (r *stubRows) Columns() []string { return r.cols }
func (r *stubRows) Close() error      { return nil }
func (r *stubRows) Next(dest []driver.Value) error {
	if r.i >= len(r.data) {
		return io.EOF
	}
	copy(dest, r.data[r.i])
	r.i++
	return nil
}

func stubAdapter(t *testing.T, d *stubDriver) *Adapter {
	t.Helper()
	name := strings.ReplaceAll(t.Name(), "/", "_")
	sql.Register(name, d)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &Adapter{db: db, database: "db"}
}

// A search term with a backslash must escape it before the quote — ClickHouse
// treats backslash as the escape character, so a quote-only escape lets a
// backslash swallow the closing quote and corrupts the literal. (Why)
func TestPreviewRowsEscapesSearchLiteral(t *testing.T) {
	d := &stubDriver{probeCols: []string{"a", "b"}}
	a := stubAdapter(t, d)
	if _, err := a.PreviewRows(context.Background(), engines.PreviewRowsInput{
		TableID: "t", Search: `path\to'x`,
	}); err != nil {
		t.Fatal(err)
	}
	want := "positionCaseInsensitive(`a`, 'path\\\\to\\'x') > 0"
	if !strings.Contains(d.lastQuery, want) {
		t.Fatalf("search literal not fully escaped.\nquery: %s\nwant substring: %s", d.lastQuery, want)
	}
}

// A failing system.columns probe must abort the search instead of silently
// running the query without its filter. (Why)
func TestPreviewRowsFailsClosedWhenColumnProbeFails(t *testing.T) {
	d := &stubDriver{probeErr: errors.New("probe denied")}
	a := stubAdapter(t, d)
	_, err := a.PreviewRows(context.Background(), engines.PreviewRowsInput{
		TableID: "t", Search: "x",
	})
	if err == nil {
		t.Fatal("PreviewRows must fail when the search column probe fails")
	}
	if d.lastQuery != "" {
		t.Fatalf("row query must not run without the search filter: %s", d.lastQuery)
	}
}
