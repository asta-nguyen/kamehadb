package sqlserver

import (
	"context"
	"database/sql/driver"
	"errors"
	"reflect"
	"strings"
	"testing"

	mssql "github.com/microsoft/go-mssqldb"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/engines/enginetest"
)

// Capture the actual database/sql boundary. Native server plans/collation are
// a separate unavailable check, not inferred from these construction tests.
func TestSQLServerPreviewParametersAndFallback(t *testing.T) {
	for _, test := range []struct {
		dataType    string
		value, want any
		predicate   string
	}{
		{"bigint", "9223372036854775807", int64(9223372036854775807), "CAST(@p3 AS bigint)"},
		{"tinyint", int64(255), int64(255), "CAST(@p3 AS tinyint)"},
		{"varchar", "a' OR 1=1 --", mssql.VarChar("a' OR 1=1 --"), "@p3"},
		{"nvarchar", "日本語 ", "日本語 ", "@p3"},
	} {
		t.Run(test.dataType, func(t *testing.T) {
			scope := engines.NewPreviewScope(engines.KindSQLServer)
			key := engines.ColumnInfo{Name: "i]d", Type: test.dataType, PrimaryKey: true}
			columns := []engines.ColumnInfo{key, {Name: "text", Type: "nvarchar"}}
			limit := int64(2)
			input := engines.ScopePreview(engines.PreviewRowsInput{TableID: "dbo.fixture", Limit: &limit, Search: "needle", SortDirection: "desc"}, scope)
			cursor, err := engines.EncodePreviewCursor(input, key, test.value)
			if err != nil {
				t.Fatal(err)
			}
			input.Cursor = cursor
			calls := 0
			db := enginetest.DB(t, func(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
				calls++
				if !strings.Contains(query, "WHERE ([i]]d] LIKE @p1 OR [text] LIKE @p2) AND [i]]d] < "+test.predicate+" ORDER BY [i]]d] DESC OFFSET @p4 ROWS FETCH NEXT @p5 ROWS ONLY") {
					t.Fatal("predicate/order/identifier changed", query)
				}
				if len(args) != 5 || !reflect.DeepEqual(args[2].Value, test.want) || args[3].Value != int64(0) || args[4].Value != int64(3) {
					t.Fatal("native parameters not exact", args)
				}
				return &enginetest.Rows{Names: []string{key.Name}, Values: [][]driver.Value{{"9"}}}, nil
			})
			a := &Adapter{db: db, requestTimeout: defaultRequestTimeout, previewScope: scope}
			page, err := a.PreviewRowsWithColumns(context.Background(), input, columns)
			if err != nil || page.PaginationMode != engines.PaginationKeyset {
				t.Fatal(page, err)
			}
			input.Limit = nil
			if _, err := a.PreviewRowsWithColumns(context.Background(), input, columns); !errors.Is(err, engines.ErrPreviewCursor) || calls != 1 {
				t.Fatal("stale token reached database", err, calls)
			}
		})
	}
	for _, key := range []engines.ColumnInfo{
		{Name: "id", Type: "uniqueidentifier", PrimaryKey: true},
		{Name: "id", Type: "decimal", PrimaryKey: true},
		{Name: "id", Type: "bigint", PrimaryKey: true, Nullable: true},
	} {
		db := enginetest.DB(t, func(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, " WHERE ") || len(args) != 2 || args[0].Value != int64(12) {
				t.Fatal("unsupported key changed fallback", query, args)
			}
			return &enginetest.Rows{Names: []string{key.Name}}, nil
		})
		a := &Adapter{db: db, requestTimeout: defaultRequestTimeout}
		offset := int64(12)
		page, err := a.PreviewRowsWithColumns(context.Background(), engines.PreviewRowsInput{TableID: "dbo.fixture", Offset: &offset}, []engines.ColumnInfo{key})
		if err != nil || page.PaginationMode != engines.PaginationOffset || page.NextCursor != "" {
			t.Fatal(page, err)
		}
	}
}
