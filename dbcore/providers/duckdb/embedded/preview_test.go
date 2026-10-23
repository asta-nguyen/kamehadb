package embedded

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Exercise native comparison/binding rather than just token serialization.
// Small 9/10 keys also catch accidental ordering by a decimal-text alias.
func TestNativeDuckDBExactPreviewKeys(t *testing.T) {
	a, err := New(filepath.Join(t.TempDir(), "keys.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx := context.Background()
	for _, test := range []struct {
		name, dataType, values string
		expected               []string
	}{
		{"signed", "BIGINT", "(-9223372036854775808),(9),(10),(9007199254740993),(9223372036854775807)", []string{"-9223372036854775808", "9", "10", "9007199254740993", "9223372036854775807"}},
		{"unsigned", "UBIGINT", "(9),(10),(9007199254740993),(9223372036854775808),(18446744073709551615)", []string{"9", "10", "9007199254740993", "9223372036854775808", "18446744073709551615"}},
		{"wide", "HUGEINT", "(-170141183460469231731687303715884105728),(9),(10),(9223372036854775808),(170141183460469231731687303715884105727)", []string{"-170141183460469231731687303715884105728", "9", "10", "9223372036854775808", "170141183460469231731687303715884105727"}},
		{"unsigned_wide", "UHUGEINT", "(9),(10),(18446744073709551616),(340282366920938463463374607431768211455)", []string{"9", "10", "18446744073709551616", "340282366920938463463374607431768211455"}},
		{"text", "VARCHAR", "('9'),('A'),('a'),('quoted'' OR 1=1 --'),('日本語')", []string{"9", "A", "a", "quoted' OR 1=1 --", "日本語"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, query := range []string{"CREATE TABLE " + esc(test.name) + "(id " + test.dataType + " PRIMARY KEY)", "INSERT INTO " + esc(test.name) + " VALUES " + test.values} {
				if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query}); err != nil {
					t.Fatal(query, err)
				}
			}
			columns, err := a.GetTableColumns(ctx, "main."+test.name)
			if err != nil || len(columns) != 1 || !columns[0].PrimaryKey || columns[0].Nullable {
				t.Fatal(columns, err)
			}
			for _, direction := range []string{"asc", "desc"} {
				limit := int64(1)
				input := engines.PreviewRowsInput{TableID: "main." + test.name, Limit: &limit, SortDirection: direction}
				for i := range test.expected {
					page, err := a.PreviewRowsWithColumns(ctx, input, columns)
					if err != nil || page.RowCount != 1 || page.PaginationMode != engines.PaginationKeyset {
						t.Fatal(direction, i, page, err)
					}
					index := i
					if direction == "desc" {
						index = len(test.expected) - 1 - i
					}
					if got := fmt.Sprint(page.Rows[0]["id"]); got != test.expected[index] {
						t.Fatalf("%s/%d: %s != %s", direction, i, got, test.expected[index])
					}
					more := i+1 < len(test.expected)
					if page.HasMore == nil || *page.HasMore != more || more && page.NextCursor == "" {
						t.Fatal("wrong continuation", page)
					}
					input.Cursor = page.NextCursor
				}
			}
		})
	}
}

// Context, deletion and byte-shortened pages must use the admitted anchor,
// not requested row counts or an inferred snapshot of the database.
func TestNativeDuckDBPreviewScopeBoundsAndFallback(t *testing.T) {
	a, err := New(filepath.Join(t.TempDir(), "pages.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx := context.Background()
	for _, query := range []string{
		`CREATE TABLE pages("i""d" BIGINT PRIMARY KEY, left_text VARCHAR, right_text VARCHAR)`,
		`INSERT INTO pages SELECT i,repeat('x',64000),'needle' FROM range(1,71) t(i)`,
		`CREATE TABLE composite(a BIGINT,b BIGINT,PRIMARY KEY(a,b))`,
		`CREATE TABLE fractional(id DECIMAL(38,2) PRIMARY KEY)`,
		`CREATE VIEW page_view AS SELECT * FROM pages`,
	} {
		if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query}); err != nil {
			t.Fatal(err)
		}
	}
	limit := int64(100)
	input := engines.PreviewRowsInput{TableID: "main.pages", Limit: &limit, Search: "needle"}
	columns, err := a.GetTableColumns(ctx, input.TableID)
	if err != nil {
		t.Fatal(err)
	}
	first, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil || first.PaginationMode != engines.PaginationKeyset || first.RowCount < 1 || first.RowCount >= 70 || first.LimitReason != engines.LimitReasonBytes {
		t.Fatal(first, err)
	}
	last := fmt.Sprint(first.Rows[len(first.Rows)-1][`i"d`])
	if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: `DELETE FROM pages WHERE "i""d" = ` + last}); err != nil {
		t.Fatal(err)
	}
	input.Cursor = first.NextCursor
	second, err := a.PreviewRowsWithColumns(ctx, input, columns)
	if err != nil || second.RowCount < 1 || fmt.Sprint(second.Rows[0][`i"d`]) != fmt.Sprint(first.RowCount+1) {
		t.Fatal("deleted anchor or OR search repeated rows", second, err)
	}
	changed := input
	changed.Search = "different"
	if _, err := a.PreviewRowsWithColumns(ctx, changed, columns); !errors.Is(err, engines.ErrPreviewCursor) {
		t.Fatal("stale context accepted", err)
	}
	other, err := New(filepath.Join(t.TempDir(), "other.duckdb"))
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if _, err := other.PreviewRowsWithColumns(ctx, input, columns); !errors.Is(err, engines.ErrPreviewCursor) {
		t.Fatal("cross-connection cursor accepted", err)
	}
	for _, table := range []string{"main.composite", "main.fractional", "main.page_view"} {
		page, err := a.PreviewRows(ctx, engines.PreviewRowsInput{TableID: table})
		if err != nil || page.PaginationMode != engines.PaginationOffset || page.NextCursor != "" {
			t.Fatal(table, page, err)
		}
	}
	page, err := a.PreviewRows(ctx, engines.PreviewRowsInput{TableID: "main.pages", SortColumn: "right_text"})
	if err != nil || page.PaginationMode != engines.PaginationOffset {
		t.Fatal("arbitrary order claimed seek", page, err)
	}
}
