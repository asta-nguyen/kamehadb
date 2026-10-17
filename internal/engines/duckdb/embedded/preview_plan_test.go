package embedded

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Record native optimizer behavior separately from correct bounded paging.
// A unique key/predicate is not a promise that DuckDB chooses an ordered index.
func TestNativeDuckDBMillionPreviewPlan(t *testing.T) {
	a, err := New(filepath.Join(t.TempDir(), "million.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx := context.Background()
	for _, query := range []string{"CREATE TABLE million(id BIGINT PRIMARY KEY)", "INSERT INTO million SELECT i FROM range(1,1000001) t(i)"} {
		if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query}); err != nil {
			t.Fatal(err)
		}
	}
	columns, err := a.GetTableColumns(ctx, "main.million")
	if err != nil {
		t.Fatal(err)
	}
	limit := int64(50)
	input := engines.ScopePreview(engines.PreviewRowsInput{TableID: "main.million", Limit: &limit}, a.previewScope)
	input.Cursor, err = engines.EncodePreviewCursor(input, columns[0], int64(999900))
	if err != nil {
		t.Fatal(err)
	}
	page, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil || page.RowCount != 50 || page.PaginationMode != engines.PaginationKeyset {
		t.Fatal(page, err)
	}
	if fmt.Sprint(page.Rows[0]["id"]) != "999901" || fmt.Sprint(page.Rows[49]["id"]) != "999950" {
		t.Fatal("wrong deep page")
	}
	for _, query := range []string{"EXPLAIN ANALYZE SELECT * FROM million WHERE id>999900 ORDER BY id LIMIT 50", "EXPLAIN ANALYZE SELECT * FROM million ORDER BY id LIMIT 50 OFFSET 999900"} {
		plan, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query})
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range plan.Rows {
			t.Logf("%s\n%s", query, row["explain_value"])
		}
	}
}
