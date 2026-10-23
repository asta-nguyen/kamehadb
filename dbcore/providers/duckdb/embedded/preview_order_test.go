package embedded

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// DuckDB sorts on several threads, so the order of tied rows is not guaranteed.
// This fixture happened to stay stable without a tiebreaker, so the test guards
// that the key-extended ORDER BY is valid and exact on the real engine; the SQL
// text itself is asserted in preview_order_sql_test.go.
func TestNativeDuckDBOffsetPagesAreStableWithDuplicateSortValues(t *testing.T) {
	a, err := New(filepath.Join(t.TempDir(), "order.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx := context.Background()
	for _, query := range []string{
		"CREATE TABLE dup_rows(id BIGINT PRIMARY KEY, grp INTEGER NOT NULL)",
		"INSERT INTO dup_rows SELECT range, range % 3 FROM range(1, 3001)",
	} {
		if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query}); err != nil {
			t.Fatal(query, err)
		}
	}
	const pageSize = int64(100)
	seen := map[string]bool{}
	for offset := int64(0); ; offset += pageSize {
		off, limit := offset, pageSize
		page, err := a.PreviewRows(ctx, engines.PreviewRowsInput{
			TableID: "main.dup_rows", SortColumn: "grp", Offset: &off, Limit: &limit, PaginationMode: engines.PaginationOffset,
		})
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
