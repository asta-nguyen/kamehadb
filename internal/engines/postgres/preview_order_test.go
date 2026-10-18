package postgres

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Sorting by a column with many equal values and no tiebreaker lets PostgreSQL
// order ties differently per request, so OFFSET pages repeat or skip rows. The
// primary key must follow the sort column to make every page boundary exact.
func TestPostgresOffsetPagesAreStableWithDuplicateSortValues(t *testing.T) {
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
	// One connection keeps the session-local temp table visible to every page.
	cfg.MaxConns = 1
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	a := &Adapter{pool: pool}
	if _, err := pool.Exec(ctx, `CREATE TEMP TABLE dup_rows AS SELECT n AS id, n % 3 AS grp FROM generate_series(1,3000) n`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `ALTER TABLE dup_rows ADD PRIMARY KEY (id)`); err != nil {
		t.Fatal(err)
	}
	var schema string
	if err := pool.QueryRow(ctx, `SELECT pg_my_temp_schema()::regnamespace::text`).Scan(&schema); err != nil {
		t.Fatal(err)
	}
	table := schema + ".dup_rows"
	columns, err := a.GetTableColumns(ctx, table)
	if err != nil {
		t.Fatal(err)
	}

	const pageSize = int64(100)
	seen := map[string]bool{}
	for offset := int64(0); ; offset += pageSize {
		off, limit := offset, pageSize
		page, err := a.PreviewRowsWithColumns(ctx, engines.PreviewRowsInput{
			TableID: table, SortColumn: "grp", Offset: &off, Limit: &limit, PaginationMode: engines.PaginationOffset,
		}, columns)
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range page.Rows {
			id := fmt.Sprint(row["id"])
			if seen[id] {
				t.Fatalf("row %s returned twice across offset pages", id)
			}
			seen[id] = true
		}
		if page.HasMore == nil || !*page.HasMore {
			break
		}
	}
	if len(seen) != 3000 {
		t.Fatalf("paging returned %d distinct rows, want 3000 (rows were skipped)", len(seen))
	}
}
