package postgres

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/jackc/pgx/v5/pgxpool"
)

const previewTestTimeout = 2 * time.Minute

// An opt-in single-connection TEMP fixture cannot persist or modify user
// tables. It exercises real pgx cursor typing, search composition and plans.
func TestPostgresSeekPreview(t *testing.T) {
	dsn := os.Getenv("KAMEHADB_TEST_POSTGRES")
	if dsn == "" {
		t.Skip("set KAMEHADB_TEST_POSTGRES for private fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), previewTestTimeout)
	defer cancel()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 1
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	a := &Adapter{pool: pool}
	if _, err := pool.Exec(ctx, `CREATE TEMP TABLE cursor_probe(id bigint PRIMARY KEY, label text NOT NULL, payload text NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO cursor_probe SELECT n, CASE WHEN n % 2 = 0 THEN 'needle' ELSE 'other' END, CASE WHEN n % 2 = 1 THEN 'needle' ELSE 'other' END FROM generate_series(1,1000000) n`); err != nil {
		t.Fatal(err)
	}
	var schema string
	if err := pool.QueryRow(ctx, `SELECT pg_my_temp_schema()::regnamespace::text`).Scan(&schema); err != nil {
		t.Fatal(err)
	}
	table := schema + ".cursor_probe"
	columns, err := a.GetTableColumns(ctx, table)
	if err != nil {
		t.Fatal(err)
	}
	limit := int64(50)
	input := engines.PreviewRowsInput{TableID: table, Limit: &limit, Search: "needle"}
	first, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil {
		t.Fatal(err)
	}
	if first.PaginationMode != engines.PaginationKeyset || first.NextCursor == "" || first.Rows[0]["id"] != int64(1) {
		t.Fatalf("bad first page: %+v", first)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM cursor_probe WHERE id=50`); err != nil {
		t.Fatal(err)
	}
	input.Cursor = first.NextCursor
	next, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil {
		t.Fatal(err)
	}
	if next.Rows[0]["id"] != int64(51) {
		t.Fatalf("search OR/cursor skipped or repeated rows: %v", next.Rows[0])
	}
	input.Cursor = ""
	input.SortColumn = "id"
	input.SortDirection = "desc"
	last, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil {
		t.Fatal(err)
	}
	if last.Rows[0]["id"] != int64(1000000) {
		t.Fatal("descending order failed")
	}
	input.Cursor = last.NextCursor
	previous, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil {
		t.Fatal(err)
	}
	if previous.Rows[0]["id"] != int64(999950) {
		t.Fatal("descending cursor failed")
	}
	input.Cursor = ""
	input.SortColumn = "label"
	fallback, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil || fallback.PaginationMode != engines.PaginationOffset {
		t.Fatal("arbitrary sort did not fall back", err)
	}

	// Native values and tokens stay lossless for the other eligible key types.
	for _, fixture := range []struct{ table, ddl, first, second string }{
		{"big_cursor", `CREATE TEMP TABLE big_cursor(id bigint PRIMARY KEY); INSERT INTO big_cursor VALUES(9007199254740993),(9007199254740994)`, "9007199254740993", "9007199254740994"},
		{"uuid_cursor", `CREATE TEMP TABLE uuid_cursor(id uuid PRIMARY KEY); INSERT INTO uuid_cursor VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002')`, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"},
		{"text_cursor", `CREATE TEMP TABLE text_cursor(id text PRIMARY KEY); INSERT INTO text_cursor VALUES('alpha'),('beta')`, "alpha", "beta"},
	} {
		if _, err := pool.Exec(ctx, fixture.ddl); err != nil {
			t.Fatal(err)
		}
		one := int64(1)
		request := engines.PreviewRowsInput{TableID: schema + "." + fixture.table, Limit: &one}
		page, err := a.PreviewRows(ctx, request)
		if err != nil || page.Rows[0]["id"] != fixture.first {
			t.Fatal("typed first page", fixture.table, err)
		}
		request.Cursor = page.NextCursor
		page, err = a.PreviewRows(ctx, request)
		if err != nil || page.Rows[0]["id"] != fixture.second {
			t.Fatal("typed next page", fixture.table, err)
		}
	}

	for _, query := range []string{
		`SELECT * FROM cursor_probe ORDER BY id LIMIT 50 OFFSET 999900`,
		`SELECT * FROM cursor_probe WHERE id > 999900 ORDER BY id LIMIT 50`,
		`SELECT * FROM cursor_probe ORDER BY label LIMIT 50`,
	} {
		rows, err := pool.Query(ctx, "EXPLAIN (ANALYZE, BUFFERS) "+query)
		if err != nil {
			t.Fatal(err)
		}
		var plan []string
		for rows.Next() {
			var line string
			if err := rows.Scan(&line); err != nil {
				t.Fatal(err)
			}
			plan = append(plan, line)
		}
		rows.Close()
		if rows.Err() != nil {
			t.Fatal(rows.Err())
		}
		t.Log(fmt.Sprint(query, "\n", plan))
	}
}
