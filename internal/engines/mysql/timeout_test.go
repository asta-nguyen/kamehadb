package mysql

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// queryRowsTestTimeout bounds how long a test waits before declaring that a
// call is stuck on a held connection instead of letting the suite hang.
const queryRowsTestTimeout = 3 * time.Second

// fakeConnector is a minimal database/sql driver: it records the statements
// executed on each new connection and serves two canned rows to any query, so
// connection handling can be tested without a MySQL server.
type fakeConnector struct {
	mu      sync.Mutex
	execs   []string
	execErr error
}

func (f *fakeConnector) Connect(context.Context) (driver.Conn, error) { return &fakeConn{f: f}, nil }
func (f *fakeConnector) Driver() driver.Driver                        { return fakeDriver{} }
func (f *fakeConnector) executed() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.execs...)
}

type fakeDriver struct{}

func (fakeDriver) Open(string) (driver.Conn, error) { return nil, errors.New("unused") }

type fakeConn struct{ f *fakeConnector }

func (c *fakeConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unused") }
func (c *fakeConn) Close() error                        { return nil }
func (c *fakeConn) Begin() (driver.Tx, error)           { return nil, errors.New("unused") }
func (c *fakeConn) ExecContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Result, error) {
	c.f.mu.Lock()
	defer c.f.mu.Unlock()
	c.f.execs = append(c.f.execs, query)
	return driver.RowsAffected(0), c.f.execErr
}
func (c *fakeConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &fakeRows{remaining: 2}, nil
}

type fakeRows struct{ remaining int }

func (r *fakeRows) Columns() []string { return []string{"v"} }
func (r *fakeRows) Close() error      { return nil }
func (r *fakeRows) Next(dest []driver.Value) error {
	if r.remaining == 0 {
		return io.EOF
	}
	r.remaining--
	dest[0] = int64(r.remaining)
	return nil
}

// queryRows hands the open cursor to the caller, so it must not close the
// connection backing it: sql.Conn.Close blocks until the rows are closed, and
// the caller cannot close them before queryRows returns. That deadlocked every
// MCP query on MySQL/MariaDB. One pooled connection makes a leaked hold visible
// as a stuck second query.
func TestQueryRowsHandsBackRowsAndReleasesConnection(t *testing.T) {
	db := sql.OpenDB(&fakeConnector{})
	defer db.Close()
	db.SetMaxOpenConns(1)
	a := &Adapter{db: db}

	done := make(chan error, 1)
	go func() {
		for pass := 0; pass < 2; pass++ {
			rows, err := a.queryRows(context.Background(), "SELECT v")
			if err != nil {
				done <- err
				return
			}
			count := 0
			for rows.Next() {
				count++
			}
			err = rows.Err()
			rows.Close()
			if err != nil || count != 2 {
				done <- fmt.Errorf("pass %d: rows=%d err=%v", pass, count, err)
				return
			}
		}
		done <- nil
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(queryRowsTestTimeout):
		t.Fatal("queryRows never returned usable rows: it holds the connection its own rows need")
	}
}

// The MCP deadline is a session variable, so it must be set once on every new
// physical connection rather than on a dedicated per-call connection.
func TestSessionInitConnectorAppliesTimeoutOncePerConnection(t *testing.T) {
	fake := &fakeConnector{}
	const statement = "SET SESSION max_execution_time = 1500"
	db := sql.OpenDB(sessionInitConnector{Connector: fake, statement: statement})
	defer db.Close()
	db.SetMaxOpenConns(1)
	for i := 0; i < 3; i++ {
		rows, err := db.QueryContext(context.Background(), "SELECT v")
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
		}
		rows.Close()
	}
	if got := fake.executed(); len(got) != 1 || got[0] != statement {
		t.Fatalf("timeout statement runs = %v, want exactly one %q", got, statement)
	}
}

// A server that rejects the variable must fail the connection with the
// established message instead of silently running without a deadline.
func TestSessionInitConnectorRejectsUnsupportedVariable(t *testing.T) {
	fake := &fakeConnector{execErr: errors.New("Unknown system variable")}
	db := sql.OpenDB(sessionInitConnector{Connector: fake, statement: "SET SESSION max_execution_time = 1"})
	defer db.Close()
	err := db.PingContext(context.Background())
	if err == nil || err.Error() != "MySQL or MariaDB rejected the native query timeout setting" {
		t.Fatalf("want rejection error, got %v", err)
	}
}

func TestSessionTimeoutStatement(t *testing.T) {
	cases := []struct {
		isMariaDB bool
		ms        int64
		want      string
	}{
		{false, 1500, "SET SESSION max_execution_time = 1500"},
		{true, 1500, "SET SESSION max_statement_time = 2"}, // seconds, rounded up
		{true, 1, "SET SESSION max_statement_time = 1"},    // never below one second
		{false, 0, ""},
		{true, -5, ""},
	}
	for _, c := range cases {
		if got := sessionTimeoutStatement(c.isMariaDB, c.ms); got != c.want {
			t.Errorf("sessionTimeoutStatement(%v, %d) = %q, want %q", c.isMariaDB, c.ms, got, c.want)
		}
	}
}

// Opening is lazy, so this only proves the connector path accepts the DSN the
// plain sql.Open path accepts, including awkward password characters.
func TestNewWithTimeoutBuildsConnector(t *testing.T) {
	for _, kind := range []string{engines.KindMySQL, engines.KindMariaDB} {
		a, err := NewWithTimeout(engines.ConnProfile{Kind: kind, Database: "d", Username: "u", Password: "p@ss/w:rd?"}, 1500)
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		a.Close()
	}
}
