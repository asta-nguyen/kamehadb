package sqlite

import (
	"context"
	"fmt"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Equal sort values need the primary key as a tiebreaker so OFFSET pages can
// neither repeat nor skip rows. SQLite happened to keep ties stable on this
// fixture, so this guards the key-extended ORDER BY on the real engine; the SQL
// text is asserted in preview_order_sql_test.go.
func TestSQLiteOffsetPagesAreStableWithDuplicateSortValues(t *testing.T) {
	a, _ := openTest(t)
	ctx := context.Background()
	if _, err := a.db.Exec(`CREATE TABLE dup_rows(id INTEGER PRIMARY KEY, grp INTEGER NOT NULL);
	WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n<3000)
	INSERT INTO dup_rows SELECT n, n%3 FROM nums`); err != nil {
		t.Fatal(err)
	}
	const pageSize = int64(100)
	seen := map[string]bool{}
	for offset := int64(0); ; offset += pageSize {
		off, limit := offset, pageSize
		page, err := a.PreviewRows(ctx, engines.PreviewRowsInput{
			TableID: "dup_rows", SortColumn: "grp", Offset: &off, Limit: &limit, PaginationMode: engines.PaginationOffset,
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
