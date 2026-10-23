package oracle

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/engines/enginetest"
)

// OFFSET paging is only exact if the ORDER BY is total: the primary key must
// follow the sort column, otherwise equal sort values may swap places between
// requests and rows repeat or vanish across pages. This checks the SQL sent to
// the driver, not a live server.
func TestPreviewOrderAppendsPrimaryKeyTiebreaker(t *testing.T) {
	q := func(name string) string { return previewSourceAlias + "." + esc(name) }
	for _, test := range []struct {
		name      string
		columns   []engines.ColumnInfo
		sort, dir string
		want      string
	}{
		{"sort by a non-key column", []engines.ColumnInfo{{Name: "id", Type: "NUMBER(38,0)", PrimaryKey: true}, {Name: "name", Type: "VARCHAR2"}}, "name", "desc", "ORDER BY " + q("name") + " DESC, " + q("id") + " ASC)"},
		{"composite key without a sort", []engines.ColumnInfo{{Name: "a", Type: "NUMBER(38,0)", PrimaryKey: true}, {Name: "b", Type: "NUMBER(38,0)", PrimaryKey: true}, {Name: "c", Type: "VARCHAR2"}}, "", "", "ORDER BY " + q("a") + " ASC, " + q("b") + " ASC)"},
		{"sort by one composite key column", []engines.ColumnInfo{{Name: "a", Type: "NUMBER(38,0)", PrimaryKey: true}, {Name: "b", Type: "NUMBER(38,0)", PrimaryKey: true}, {Name: "c", Type: "VARCHAR2"}}, "b", "", "ORDER BY " + q("b") + " ASC, " + q("a") + " ASC)"},
		{"sort by the single key adds nothing", []engines.ColumnInfo{{Name: "id", Type: "NUMBER(38,0)", PrimaryKey: true}, {Name: "name", Type: "VARCHAR2"}}, "id", "desc", "ORDER BY " + q("id") + " DESC)"},
		{"table without a key keeps its order", []engines.ColumnInfo{{Name: "c", Type: "VARCHAR2"}}, "", "", ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			var query string
			db := enginetest.DB(t, func(_ context.Context, sent string, _ []driver.NamedValue) (driver.Rows, error) {
				query = sent
				return &enginetest.Rows{Names: []string{"c"}}, nil
			})
			a := &Adapter{db: db, username: "OWNER", previewScope: engines.NewPreviewScope(engines.KindOracle)}
			input := engines.PreviewRowsInput{TableID: "OWNER.DUP", SortColumn: test.sort, SortDirection: test.dir}
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
