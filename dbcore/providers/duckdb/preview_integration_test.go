package duckdb

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/duckdriver"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// Repeat large-key continuation through the actual child/protocol boundary.
// Native adapter tests alone do not prove that JSON and cached metadata survive.
func TestManagedNativeDuckDBPreviewCursors(t *testing.T) {
	path := os.Getenv(testDriverEnv)
	if path == "" {
		t.Skip("set " + testDriverEnv + " to an explicitly built native helper")
	}
	root := t.TempDir()
	t.Setenv("KAMEHADB_DATA_DIR", filepath.Join(root, "data"))
	t.Setenv(duckdriver.LocalDriverEnv, path)
	a, err := New(filepath.Join(root, "private.duckdb"), testRuntimeDir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	ctx, cancel := context.WithTimeout(context.Background(), testDriverTimeout)
	defer cancel()
	for _, test := range []struct{ name, dataType, last string }{
		{"unsigned", "UBIGINT", "18446744073709551615"},
		{"wide", "HUGEINT", "170141183460469231731687303715884105727"},
		{"unsigned_wide", "UHUGEINT", "340282366920938463463374607431768211455"},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, query := range []string{"CREATE TABLE " + test.name + "(id " + test.dataType + " PRIMARY KEY)", "INSERT INTO " + test.name + " VALUES (9),(10),(" + test.last + ")"} {
				if _, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query}); err != nil {
					t.Fatal(err)
				}
			}
			columns, err := a.GetTableColumns(ctx, "main."+test.name)
			if err != nil {
				t.Fatal(err)
			}
			limit := int64(1)
			input := engines.PreviewRowsInput{TableID: "main." + test.name, Limit: &limit}
			for i, expected := range []string{"9", "10", test.last} {
				page, err := a.PreviewRowsWithColumns(ctx, input, columns)
				if err != nil || page.RowCount != 1 || page.PaginationMode != engines.PaginationKeyset {
					t.Fatal(page, err)
				}
				if got := fmt.Sprint(page.Rows[0]["id"]); got != expected {
					t.Fatal("RPC key rounded or order changed", got, expected)
				}
				if i < 2 && page.NextCursor == "" {
					t.Fatal("RPC dropped cursor")
				}
				input.Cursor = page.NextCursor
			}
			input.Cursor = ""
			first, err := a.PreviewRowsWithColumns(ctx, input, columns)
			if err != nil {
				t.Fatal(err)
			}
			input.Cursor = first.NextCursor
			other, err := New(filepath.Join(root, test.name+"-other.duckdb"), testRuntimeDir, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer other.Close()
			if _, err := other.PreviewRowsWithColumns(ctx, input, columns); err == nil || !strings.Contains(err.Error(), engines.ErrPreviewCursor.Error()) {
				t.Fatal("RPC accepted cross-helper scope", err)
			}
		})
	}
}
