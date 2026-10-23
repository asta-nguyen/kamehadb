package sqlite

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

func TestSQLiteSeekPagesAndByteBoundaries(t *testing.T) {
	a, _ := openTest(t)
	ctx := context.Background()
	if _, err := a.db.Exec(`CREATE TABLE seek_rows(id INTEGER PRIMARY KEY, label TEXT NOT NULL, payload TEXT NOT NULL);
	WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n<130)
	INSERT INTO seek_rows SELECT n, CASE WHEN n%2=0 THEN 'needle' ELSE 'other' END, printf('%064000d',n) FROM nums`); err != nil {
		t.Fatal(err)
	}
	limit := int64(100)
	input := engines.PreviewRowsInput{TableID: "seek_rows", Limit: &limit}
	var last int64
	pages := 0
	for {
		result, err := a.PreviewRows(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		if result.PaginationMode != engines.PaginationKeyset {
			t.Fatal("rowid alias not eligible")
		}
		for _, row := range result.Rows {
			id := row["id"].(int64)
			if id != last+1 {
				t.Fatalf("skipped/repeated id: got %d after %d", id, last)
			}
			last = id
		}
		pages++
		if result.HasMore == nil || !*result.HasMore {
			break
		}
		if result.LimitReason != engines.LimitReasonBytes || result.NextCursor == "" {
			t.Fatal("missing byte-shortened cursor")
		}
		input.Cursor = result.NextCursor
	}
	if last != 130 || pages < 4 {
		t.Fatalf("only %d records in %d pages", last, pages)
	}
	input.Cursor = ""
	input.SortColumn = "id"
	input.SortDirection = "desc"
	input.Search = "needle"
	input.SearchColumn = "label"
	first, err := a.PreviewRows(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if first.Rows[0]["id"] != int64(130) {
		t.Fatal("descending filtered order failed")
	}
	anchor := first.Rows[len(first.Rows)-1]["id"]
	if _, err := a.db.Exec("DELETE FROM seek_rows WHERE id=?", anchor); err != nil {
		t.Fatal(err)
	}
	input.Cursor = first.NextCursor
	next, err := a.PreviewRows(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if next.Rows[0]["id"].(int64) >= anchor.(int64) {
		t.Fatal("deleted anchor broke seek")
	}
	input.Search = "other"
	if _, err := a.PreviewRows(ctx, input); !errors.Is(err, engines.ErrPreviewCursor) {
		t.Fatal("stale search cursor accepted", err)
	}
}

func TestSQLitePreviewFallbackShapes(t *testing.T) {
	a, _ := openTest(t)
	if _, err := a.db.Exec(`CREATE TABLE no_pk(id INTEGER);
	CREATE TABLE nullable_pk(id TEXT PRIMARY KEY);
	CREATE TABLE composite(a INTEGER,b INTEGER,PRIMARY KEY(a,b));
	CREATE TABLE inline_desc(id INTEGER PRIMARY KEY DESC);
	CREATE TABLE real_key(id REAL PRIMARY KEY NOT NULL);
	CREATE TABLE alias(id INTEGER PRIMARY KEY);
	CREATE TABLE text_key(id TEXT PRIMARY KEY NOT NULL);
	CREATE VIEW alias_view AS SELECT * FROM alias;
	INSERT INTO alias VALUES(1),(2),(3);
	INSERT INTO text_key VALUES('a'),('b'),('c')`); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"no_pk", "nullable_pk", "composite", "inline_desc", "real_key", "alias_view"} {
		result, err := a.PreviewRows(context.Background(), engines.PreviewRowsInput{TableID: table})
		if err != nil || result.PaginationMode != engines.PaginationOffset {
			t.Fatalf("%s did not fall back: %v", table, err)
		}
	}
	limit := int64(1)
	input := engines.PreviewRowsInput{TableID: "text_key", Limit: &limit}
	first, err := a.PreviewRows(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	input.Cursor = first.NextCursor
	next, err := a.PreviewRows(context.Background(), input)
	if err != nil || next.Rows[0]["id"] != "b" {
		t.Fatal("text key seek failed", err)
	}
}

func TestSQLiteSeekPlanOnMillionRows(t *testing.T) {
	a, _ := openTest(t)
	if _, err := a.db.Exec(`CREATE TABLE large_keys(id INTEGER PRIMARY KEY,label TEXT NOT NULL);
	WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n<1000000)
	INSERT INTO large_keys SELECT n,printf('%07d',1000001-n) FROM nums`); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`SELECT * FROM large_keys ORDER BY id LIMIT 50 OFFSET 999950`,
		`SELECT * FROM large_keys WHERE id>999950 ORDER BY id LIMIT 50`,
		`SELECT * FROM large_keys ORDER BY label LIMIT 50`,
	} {
		rows, err := a.db.Query("EXPLAIN QUERY PLAN " + query)
		if err != nil {
			t.Fatal(err)
		}
		var details []string
		for rows.Next() {
			var id, parent, unused int
			var detail string
			if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
				t.Fatal(err)
			}
			details = append(details, detail)
		}
		rows.Close()
		if rows.Err() != nil {
			t.Fatal(rows.Err())
		}
		t.Log(query, details)
		if strings.Contains(query, "WHERE id>") && !strings.Contains(strings.Join(details, " "), "SEARCH") {
			t.Fatal("seek did not use indexed search")
		}
	}
}

func TestSQLiteBigIntegerCellsAreLossless(t *testing.T) {
	a, _ := openTest(t)
	if _, err := a.db.Exec(`CREATE TABLE big_keys(id INTEGER PRIMARY KEY);INSERT INTO big_keys VALUES(9007199254740993),(9007199254740994)`); err != nil {
		t.Fatal(err)
	}
	limit := int64(1)
	input := engines.PreviewRowsInput{TableID: "big_keys", Limit: &limit}
	first, err := a.PreviewRows(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if first.Rows[0]["id"] != "9007199254740993" {
		t.Fatalf("big integer cell can round in WebView: %v", first.Rows[0])
	}
	input.Cursor = first.NextCursor
	next, err := a.PreviewRows(context.Background(), input)
	if err != nil || next.Rows[0]["id"] != "9007199254740994" {
		t.Fatal("lossless integer cursor failed", err)
	}
}
