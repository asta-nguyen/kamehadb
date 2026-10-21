package sqlserver

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
	q := func(name string) string { return esc(name) }
	for _, test := range []struct {
		name      string
		columns   []engines.ColumnInfo
		sort, dir string
		want      string
	}{
		{"sort by a non-key column", []engines.ColumnInfo{{Name: "id", Type: "int", PrimaryKey: true}, {Name: "name", Type: "nvarchar"}}, "name", "desc", "ORDER BY " + q("name") + " DESC, " + q("id") + " DESC OFFSET"},
		{"composite key without a sort", []engines.ColumnInfo{{Name: "a", Type: "int", PrimaryKey: true}, {Name: "b", Type: "int", PrimaryKey: true}, {Name: "c", Type: "nvarchar"}}, "", "", "ORDER BY " + q("a") + " ASC, " + q("b") + " ASC OFFSET"},
		{"sort by one composite key column", []engines.ColumnInfo{{Name: "a", Type: "int", PrimaryKey: true}, {Name: "b", Type: "int", PrimaryKey: true}, {Name: "c", Type: "nvarchar"}}, "b", "", "ORDER BY " + q("b") + " ASC, " + q("a") + " ASC OFFSET"},
		{"sort by the single key adds nothing", []engines.ColumnInfo{{Name: "id", Type: "int", PrimaryKey: true}, {Name: "name", Type: "nvarchar"}}, "id", "desc", "ORDER BY " + q("id") + " DESC OFFSET"},
		{"table without a key keeps its order", []engines.ColumnInfo{{Name: "c", Type: "nvarchar"}}, "", "", "ORDER BY 1 OFFSET"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var query string
			db := enginetest.DB(t, func(_ context.Context, sent string, _ []driver.NamedValue) (driver.Rows, error) {
				query = sent
				return &enginetest.Rows{Names: []string{"c"}}, nil
			})
			a := &Adapter{db: db, requestTimeout: defaultRequestTimeout, previewScope: engines.NewPreviewScope(engines.KindSQLServer)}
			input := engines.PreviewRowsInput{TableID: "dbo.dup", SortColumn: test.sort, SortDirection: test.dir}
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
