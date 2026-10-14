package embedded

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/marcboeker/go-duckdb/v2"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func testDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.duckdb")
	db, err := sql.Open("duckdb", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		"CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR, active BOOLEAN DEFAULT true)",
		"INSERT INTO users VALUES (1, 'alice', true), (2, 'bob', false), (3, 'carol', true)",
		"CREATE TABLE orders (id INTEGER, user_id INTEGER, total DECIMAL(10,2))",
		"INSERT INTO orders VALUES (1, 1, 9.99), (2, 1, 19.99)",
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	return path
}

func TestAdapterEndToEnd(t *testing.T) {
	path := testDB(t)
	a, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx := context.Background()

	res, err := a.TestConnection(ctx)
	if err != nil || !res.Success {
		t.Fatalf("testConnection: %+v %v", res, err)
	}
	if res.ServerVersion == "" {
		t.Fatal("empty server version")
	}

	dbs, err := a.ListDatabases(ctx)
	if err != nil || len(dbs) != 1 {
		t.Fatalf("listDatabases: %+v %v", dbs, err)
	}

	schemas, err := a.ListSchemas(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	foundMain := false
	for _, s := range schemas {
		if s.Name == "main" {
			foundMain = true
		}
	}
	if !foundMain {
		t.Fatalf("main schema missing: %+v", schemas)
	}

	main := "main"
	tables, err := a.ListTables(ctx, &main)
	if err != nil || len(tables) != 2 {
		t.Fatalf("listTables: %+v %v", tables, err)
	}

	cols, err := a.GetTableColumns(ctx, "main.users")
	if err != nil || len(cols) != 3 {
		t.Fatalf("columns: %+v %v", cols, err)
	}
	if !cols[0].PrimaryKey {
		t.Fatalf("expected pk on id: %+v", cols)
	}

	idx, err := a.GetTableIndexes(ctx, "main.users")
	if err != nil {
		t.Fatal(err)
	}
	pkFound := false
	for _, i := range idx {
		if i.Primary {
			pkFound = true
		}
	}
	if !pkFound {
		t.Fatalf("no pk index: %+v", idx)
	}

	prev, err := a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "main.users", SortColumn: "id", SortDirection: "asc",
	})
	if err != nil || prev.RowCount != 3 {
		t.Fatalf("preview: %+v %v", prev, err)
	}
	if prev.Rows[0]["name"] != "alice" {
		t.Fatalf("row order wrong: %+v", prev.Rows[0])
	}

	searched, err := a.PreviewRows(ctx, engines.PreviewRowsInput{
		TableID: "main.users", Search: "bob",
	})
	if err != nil || searched.RowCount != 1 {
		t.Fatalf("search preview: %+v %v", searched, err)
	}

	qr, err := a.RunQuery(ctx, engines.RunQueryInput{Query: "SELECT COUNT(*) AS n FROM orders"})
	if err != nil || qr.RowCount != 1 {
		t.Fatalf("runQuery: %+v %v", qr, err)
	}

	stats, err := a.GetTableStats(ctx, "main.users")
	if err != nil || stats.RowEstimate != 3 {
		t.Fatalf("stats: %+v %v", stats, err)
	}

	comps, err := a.GetCompletions(ctx, &main)
	if err != nil || len(comps) != 2 {
		t.Fatalf("completions: %+v %v", comps, err)
	}
}

func TestTestDuckDBConnection(t *testing.T) {
	path := testDB(t)
	res, err := TestDuckDBConnection(context.Background(), path)
	if err != nil || !res.Success {
		t.Fatalf("%+v %v", res, err)
	}
	res, err = TestDuckDBConnection(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	// Empty path creates an in-memory db — still succeeds; failure path is a
	// directory that cannot be created.
	res, err = TestDuckDBConnection(context.Background(), filepath.Join(t.TempDir(), "missing-dir", "x.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	if res.Success {
		t.Fatal("expected failure for uncreatable path")
	}
}
