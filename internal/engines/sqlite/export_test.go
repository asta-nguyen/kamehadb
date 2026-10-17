package sqlite

import (
	"bytes"
	"context"
	"encoding/csv"
	"io"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

func TestSQLiteNativeFullExportAndReadOnly(t *testing.T) {
	a, _ := openTest(t)
	if _, err := a.db.Exec(`CREATE TABLE export_rows(id INTEGER PRIMARY KEY,label TEXT);INSERT INTO export_rows VALUES(1,'日本語'),(2,'=formula'),(3,'a,b')`); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	stats, err := a.ExportQueryCSV(context.Background(), engines.RunQueryInput{Query: `SELECT id,label FROM export_rows WHERE id>=? ORDER BY id LIMIT 2`, Params: []any{int64(2)}}, &out)
	if err != nil || stats.Rows != 2 || stats.Bytes != int64(out.Len()) {
		t.Fatal("original LIMIT/params not preserved", stats, err)
	}
	rows, err := csv.NewReader(strings.NewReader(out.String())).ReadAll()
	if err != nil || rows[1][1] != "'=formula" || rows[2][1] != "a,b" {
		t.Fatal("bad data", rows, err)
	}
	for _, query := range []string{`UPDATE export_rows SET label='changed'`, `WITH changed AS (DELETE FROM export_rows RETURNING *) SELECT * FROM changed`, `SELECT 1; DELETE FROM export_rows`, `ATTACH 'new.sqlite' AS writable`, `PRAGMA query_only=OFF`} {
		if _, err := a.ExportQueryCSV(context.Background(), engines.RunQueryInput{Query: query}, io.Discard); err == nil {
			t.Fatalf("writing/unsafe export accepted: %s", query)
		}
	}
	var count int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM export_rows`).Scan(&count); err != nil || count != 3 {
		t.Fatal("source changed", count, err)
	}
	stats, err = a.ExportQueryCSV(context.Background(), engines.RunQueryInput{Query: `WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n<60000) SELECT n,'日本語' FROM nums`}, io.Discard)
	if err != nil || stats.Rows != 60000 {
		t.Fatal("full export inherited GUI cap", stats, err)
	}
}
