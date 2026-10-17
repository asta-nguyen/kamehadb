package sqlite

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

// Exercise real driver rows, since a cap applied only after collection would
// still let wide results saturate the backend before reaching the GUI.
func TestGUIByteBudgets(t *testing.T) {
	const queryBytes = 8 << 20
	const previewBytes = 2 << 20
	a, _ := openTest(t)
	ctx := context.Background()
	query := `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 300)
		SELECT x, printf('%65536s', 'wide') AS payload FROM c`
	result, err := a.RunQuery(ctx, engines.RunQueryInput{Query: query})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) > queryBytes || !result.Truncated || result.RowCount == 300 {
		t.Fatalf("query budget: bytes=%d rows=%d truncated=%v", len(encoded), result.RowCount, result.Truncated)
	}
	if _, err := a.db.Exec(`CREATE TABLE wide (id INTEGER PRIMARY KEY, payload TEXT);
		WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 80)
		INSERT INTO wide SELECT x, printf('%65536s', 'wide') FROM c`); err != nil {
		t.Fatal(err)
	}
	result, err = a.PreviewRows(ctx, engines.PreviewRowsInput{TableID: "wide"})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err = json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) > previewBytes || !result.Truncated || result.RowCount == 80 {
		t.Fatalf("preview budget: bytes=%d rows=%d truncated=%v", len(encoded), result.RowCount, result.Truncated)
	}
	for _, row := range result.Rows {
		if len(row["payload"].(string)) != 65536 {
			t.Fatal("a cell was silently clipped")
		}
	}
}

func TestInvalidPreviewBounds(t *testing.T) {
	a, _ := openTest(t)
	negative, zero := int64(-1), int64(0)
	for _, input := range []engines.PreviewRowsInput{
		{TableID: "users", Offset: &negative},
		{TableID: "users", Limit: &zero},
		{TableID: "users", Limit: &negative},
	} {
		if _, err := a.PreviewRows(context.Background(), input); err == nil {
			t.Fatalf("invalid bounds accepted: %+v", input)
		}
	}
}
