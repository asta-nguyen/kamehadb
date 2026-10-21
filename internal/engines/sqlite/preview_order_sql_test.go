package sqlite

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/engines/enginetest"
)

// OFFSET paging is only exact if the ORDER BY is total: the primary key must
// follow the sort column, otherwise equal sort values may swap places between
// requests and rows repeat or vanish across pages. This checks the SQL sent to
// the driver, not a live server.
func TestPreviewOrderAppendsPrimaryKeyTiebreaker(t *testing.T) {
	q := func(name string) string { return `"` + name + `"` }
	for _, test := range []struct {
		name      string
		columns   []engines.ColumnInfo
		sort, dir string
		want      string
	}{
		{"sort by a non-key column", []engines.ColumnInfo{{Name: "id", Type: "integer", PrimaryKey: true}, {Name: "name", Type: "text"}}, "name", "desc", "ORDER BY " + q("name") + " DESC, " + q("id") + " DESC LIMIT"},
		{"composite key without a sort", []engines.ColumnInfo{{Name: "a", Type: "integer", PrimaryKey: true}, {Name: "b", Type: "integer", PrimaryKey: true}, {Name: "c", Type: "text"}}, "", "", "ORDER BY " + q("a") + " ASC, " + q("b") + " ASC LIMIT"},
		{"sort by one composite key column", []engines.ColumnInfo{{Name: "a", Type: "integer", PrimaryKey: true}, {Name: "b", Type: "integer", PrimaryKey: true}, {Name: "c", Type: "text"}}, "b", "", "ORDER BY " + q("b") + " ASC, " + q("a") + " ASC LIMIT"},
		{"sort by the single key adds nothing", []engines.ColumnInfo{{Name: "id", Type: "integer", PrimaryKey: true}, {Name: "name", Type: "text"}}, "id", "desc", "ORDER BY " + q("id") + " DESC LIMIT"},
		{"table without a key keeps its order", []engines.ColumnInfo{{Name: "c", Type: "text"}}, "", "", ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			var query string
			db := enginetest.DB(t, func(_ context.Context, sent string, _ []driver.NamedValue) (driver.Rows, error) {
				query = sent
				return &enginetest.Rows{Names: []string{"c"}}, nil
			})
			a := &Adapter{db: db, previewScope: engines.NewPreviewScope(engines.KindSQLite)}
			input := engines.PreviewRowsInput{TableID: "dup", SortColumn: test.sort, SortDirection: test.dir}
			if _, err := a.PreviewRowsWithColumns(context.Background(), input, test.columns); err != nil {
				t.Fatal(err)
			}
			if test.want == "" {
				if strings.Contains(query, "ORDER BY") {
					t.Fatalf("unexpected ORDER BY: %s", query)
				}
				return
			}
			if !strings.Contains(query, test.want) {
				t.Fatalf("want %q in:\n%s", test.want, query)
			}
		})
	}
}

func TestPreviewDeferredJoinLateRowLookup(t *testing.T) {
	var query string
	db := enginetest.DB(t, func(_ context.Context, sent string, _ []driver.NamedValue) (driver.Rows, error) {
		query = sent
		return &enginetest.Rows{Names: []string{"id", "name"}}, nil
	})
	a := &Adapter{db: db, previewScope: engines.NewPreviewScope(engines.KindSQLite)}
	offset := int64(1000)
	cols := []engines.ColumnInfo{
		{Name: "id", Type: "integer", PrimaryKey: true},
		{Name: "name", Type: "text"},
	}
	input := engines.PreviewRowsInput{
		TableID: "users",
		Offset:  &offset,
	}
	if _, err := a.PreviewRowsWithColumns(context.Background(), input, cols); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(query, "INNER JOIN") || !strings.Contains(query, "_kameha_sub") {
		t.Fatalf("expected deferred join subquery, got: %s", query)
	}
	if !strings.Contains(query, "LIMIT ? OFFSET ?") {
		t.Fatalf("expected LIMIT and OFFSET in subquery, got: %s", query)
	}
}
