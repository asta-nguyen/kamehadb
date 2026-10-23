package oracle

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/engines/enginetest"
)

// NUMBER anchors must bypass native floating-point decoding and bind only
// validated decimal digits. This verifies SQL construction, not a live Oracle.
func TestOraclePreviewExactNumberAndTextParameters(t *testing.T) {
	for _, test := range []struct{ dataType, value string }{
		{"NUMBER(38,0)", "99999999999999999999999999999999999999"},
		{"NUMBER(38,0)", "-99999999999999999999999999999999999999"},
		{"VARCHAR2", "日本語' OR 1=1 --"},
	} {
		t.Run(test.dataType+"/"+test.value, func(t *testing.T) {
			scope := engines.NewPreviewScope(engines.KindOracle)
			key := engines.ColumnInfo{Name: `I"D`, Type: test.dataType, PrimaryKey: true}
			columns := []engines.ColumnInfo{key, {Name: "TEXT", Type: "VARCHAR2"}}
			input := engines.ScopePreview(engines.PreviewRowsInput{TableID: "OWNER.FIXTURE", Search: "needle", SortDirection: "desc"}, scope)
			cursor, err := engines.EncodePreviewCursor(input, key, test.value)
			if err != nil {
				t.Fatal(err)
			}
			input.Cursor = cursor
			calls := 0
			db := enginetest.DB(t, func(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
				calls++
				if !strings.Contains(query, `WHERE (LOWER("I""D") LIKE LOWER(:search) OR LOWER("TEXT") LIKE LOWER(:search)) AND "I""D" < `) || !strings.Contains(query, `ORDER BY kameha_preview."I""D" DESC`) || strings.Contains(query, test.value) {
					t.Fatal("order/OR grouping/identifier/binding changed", query)
				}
				if strings.HasPrefix(test.dataType, "NUMBER(") && (!strings.Contains(query, `TO_CHAR("I""D", `) || !strings.Contains(query, "TO_NUMBER(:anchor)")) {
					t.Fatal("number key would decode or compare imprecisely", query)
				}
				values := map[string]any{}
				for _, arg := range args {
					values[arg.Name] = arg.Value
				}
				if values["anchor"] != test.value || values["page_end"] != int64(engines.DefaultPreviewRows+1) || values["search"] != "%needle%" {
					t.Fatal("named parameters changed", args)
				}
				if _, ok := values["page_offset"]; ok {
					t.Fatal("seek walked an offset")
				}
				return &enginetest.Rows{Names: []string{key.Name}, Values: [][]driver.Value{{"9"}}}, nil
			})
			a := &Adapter{db: db, username: "OWNER", previewScope: scope}
			page, err := a.PreviewRowsWithColumns(context.Background(), input, columns)
			if err != nil || page.PaginationMode != engines.PaginationKeyset {
				t.Fatal(page, err)
			}
			input.MatchCase = true
			if _, err := a.PreviewRowsWithColumns(context.Background(), input, columns); !errors.Is(err, engines.ErrPreviewCursor) || calls != 1 {
				t.Fatal("changed search reached database", err, calls)
			}
		})
	}
	for _, dataType := range []string{"NUMBER", "NUMBER(38,2)", "NUMBER(*,0)", "BINARY_DOUBLE"} {
		db := enginetest.DB(t, func(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
			if !strings.Contains(query, "WHERE rnum > :page_offset") || strings.Contains(query, "TO_NUMBER(:anchor)") {
				t.Fatal("unproven numeric identity sought", query)
			}
			return &enginetest.Rows{Names: []string{"ID"}}, nil
		})
		a := &Adapter{db: db, username: "OWNER"}
		page, err := a.PreviewRowsWithColumns(context.Background(), engines.PreviewRowsInput{TableID: "OWNER.FIXTURE"}, []engines.ColumnInfo{{Name: "ID", Type: dataType, PrimaryKey: true}})
		if err != nil || page.PaginationMode != engines.PaginationOffset {
			t.Fatal(dataType, page, err)
		}
	}
}
