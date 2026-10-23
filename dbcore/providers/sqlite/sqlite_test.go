package sqlite

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

func openTest(t *testing.T) (*Adapter, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT DEFAULT 'none',
		team_id INTEGER REFERENCES teams(id));
		CREATE TABLE teams (id INTEGER PRIMARY KEY, title TEXT);
		CREATE INDEX idx_users_name ON users(name);
		INSERT INTO teams (title) VALUES ('a'), ('b');
		INSERT INTO users (name, email, team_id) VALUES ('x','x@x',1), ('y','y@y',2), ('z','z@z',1);`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	a, err := New(engines.ConnProfile{Kind: engines.KindSQLite, FilePath: path})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.Close() })
	return a, path
}

func TestMetadata(t *testing.T) {
	a, _ := openTest(t)
	ctx := context.Background()

	tables, err := a.ListTables(ctx, nil)
	if err != nil || len(tables) != 2 {
		t.Fatalf("tables: %v %v", tables, err)
	}

	cols, err := a.GetTableColumns(ctx, "users")
	if err != nil || len(cols) != 4 {
		t.Fatalf("cols: %+v %v", cols, err)
	}
	if !cols[0].PrimaryKey || cols[1].Nullable || cols[2].Default == nil {
		t.Fatalf("column flags wrong: %+v", cols)
	}
	if cols[3].ForeignKey == nil || cols[3].ForeignKey.Table != "teams" {
		t.Fatalf("fk missing: %+v", cols[3])
	}

	idx, err := a.GetTableIndexes(ctx, "users")
	if err != nil || len(idx) == 0 {
		t.Fatalf("indexes: %+v %v", idx, err)
	}
	var found bool
	for _, i := range idx {
		if i.Name == "idx_users_name" && len(i.Columns) == 1 && i.Columns[0] == "name" && i.Unique {
			t.Fatal("idx_users_name should be non-unique")
		}
		if i.Name == "idx_users_name" {
			found = true
		}
	}
	if !found {
		t.Fatalf("idx_users_name not found in %+v", idx)
	}
}

func TestQueryAndPreview(t *testing.T) {
	a, _ := openTest(t)
	ctx := context.Background()

	res, err := a.RunQuery(ctx, engines.RunQueryInput{Query: "SELECT name FROM users WHERE id = ?", Params: []any{int64(1)}})
	if err != nil || res.RowCount != 1 || res.Rows[0]["name"] != "x" {
		t.Fatalf("runQuery: %+v %v", res, err)
	}
	// Exec path: rowCount reflects changes.
	res, err = a.RunQuery(ctx, engines.RunQueryInput{Query: "UPDATE users SET name = 'x2' WHERE id = 1"})
	if err != nil || res.RowCount != 1 {
		t.Fatalf("exec rowCount: %+v %v", res, err)
	}

	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "@",
	})
	if err != nil || res.RowCount != 3 {
		t.Fatalf("preview search: %+v %v", res, err)
	}
	limit := int64(2)
	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Limit: &limit, SortColumn: "name", SortDirection: "desc",
	})
	if err != nil || res.RowCount != 2 || !res.Truncated || res.Rows[0]["name"] != "z" {
		t.Fatalf("preview sort/limit: %+v %v", res, err)
	}
}

func TestSearchAndStats(t *testing.T) {
	a, _ := openTest(t)
	ctx := context.Background()

	m, err := a.SearchSchema(ctx, engines.SchemaSearchInput{Query: "user"})
	if err != nil || len(m) == 0 || m[0].MatchType != "table" {
		t.Fatalf("search: %+v %v", m, err)
	}
	m, err = a.SearchSchema(ctx, engines.SchemaSearchInput{Query: "email"})
	if err != nil || len(m) == 0 || m[0].MatchType != "column" || m[0].Table != "users" {
		t.Fatalf("column search: %+v %v", m, err)
	}

	stats, err := a.GetTableStats(ctx, "users")
	if err != nil || stats.RowEstimate != 3 {
		t.Fatalf("stats: %+v %v", stats, err)
	}
	sizes, err := a.GetDatabaseSizes(ctx, nil)
	if err != nil || len(sizes) != 2 {
		t.Fatalf("sizes: %+v %v", sizes, err)
	}
	conns, err := a.GetActiveConnections(ctx)
	if err != nil || len(conns) != 1 || conns[0].State != "active" {
		t.Fatalf("active: %+v %v", conns, err)
	}
}

func TestTestSqliteConnection(t *testing.T) {
	_, path := openTest(t)
	res, err := TestSqliteConnection(context.Background(), engines.ConnProfile{FilePath: path})
	if err != nil || !res.Success || res.ServerVersion == "" {
		t.Fatalf("test conn: %+v %v", res, err)
	}
	res, err = TestSqliteConnection(context.Background(), engines.ConnProfile{})
	if err != nil || res.Success || res.Message == "" {
		t.Fatalf("missing path should fail with message: %+v %v", res, err)
	}
}

func TestSearchColumnFilterAndTruncation(t *testing.T) {
	a, _ := openTest(t)
	ctx := context.Background()

	// Text search finds matching users via email
	res, err := a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "x@x",
	})
	if err != nil || res.RowCount != 1 || res.Rows[0]["name"] != "x" {
		t.Fatalf("text search failed: %+v %v", res, err)
	}

	// Non-matching text search yields 0 rows without error
	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "nonexistent_string_12345",
	})
	if err != nil || res.RowCount != 0 {
		t.Fatalf("empty search failed: %+v %v", res, err)
	}

	// Truncation check with recursive CTE generating rows exceeding MaxGuiRows
	q := "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt LIMIT 60000) SELECT x FROM cnt"
	res, err = a.RunQuery(ctx, engines.RunQueryInput{Query: q})
	if err != nil {
		t.Fatalf("run query with 60000 rows: %v", err)
	}
	if !res.Truncated || res.RowCount != engines.MaxGuiRows {
		t.Fatalf("expected truncated query at %d rows, got rowCount=%d truncated=%v",
			engines.MaxGuiRows, res.RowCount, res.Truncated)
	}

	// Specific column search on 'email' matches
	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "x@x", SearchColumn: "email",
	})
	if err != nil || res.RowCount != 1 {
		t.Fatalf("searchColumn 'email' failed: %+v %v", res, err)
	}

	// Specific column search on 'name' doesn't match 'x@x'
	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "x@x", SearchColumn: "name",
	})
	if err != nil || res.RowCount != 0 {
		t.Fatalf("searchColumn 'name' should not match 'x@x': %+v %v", res, err)
	}

	// Case-sensitive search with MatchCase = true (uses instr)
	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "x@x", MatchCase: true,
	})
	if err != nil || res.RowCount != 1 {
		t.Fatalf("MatchCase=true instr search failed: %+v %v", res, err)
	}

	// Case-sensitive search with wrong casing yields 0 rows
	res, err = a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "users", Search: "X@X", MatchCase: true,
	})
	if err != nil || res.RowCount != 0 {
		t.Fatalf("MatchCase=true wrong case should yield 0 rows: %+v %v", res, err)
	}
}
