package clickhouse

import (
	"context"
	"database/sql"
	"errors"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

const (
	privateHTTPTimeout = 15 * time.Second
	privateHTTPCancel  = 50 * time.Millisecond
	privateDatabase    = "kamehadb_test_task9"
)

func privateHTTPDB(t *testing.T) (*sql.DB, int64) {
	t.Helper()
	address := os.Getenv("KAMEHADB_TEST_CLICKHOUSE_PREVIEW")
	if address == "" {
		t.Skip("set private loopback ClickHouse HTTP fixture address")
	}
	host, portText, err := net.SplitHostPort(address)
	if err != nil || host != "127.0.0.1" {
		t.Fatal("requires a private loopback fixture", address, err)
	}
	port, err := strconv.ParseInt(portText, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	db := ch.OpenDB(&ch.Options{Protocol: ch.HTTP, Addr: []string{address}, Auth: ch.Auth{Username: defaultUser, Password: "fixture-only"}, Settings: ch.Settings{"wait_end_of_query": 1}})
	t.Cleanup(func() { db.Close() })
	return db, port
}

// A real MergeTree sorting key accepts duplicates, so neither metadata nor
// successful ordering is evidence that it can be a unique seek identity.
func TestPrivateNativeClickHouseFallback(t *testing.T) {
	db, port := privateHTTPDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), privateHTTPTimeout)
	defer cancel()
	if _, err := db.ExecContext(ctx, "CREATE DATABASE "+privateDatabase); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = db.ExecContext(context.Background(), "DROP DATABASE "+privateDatabase) }()
	for _, query := range []string{
		"CREATE TABLE " + privateDatabase + ".pages(id UInt64,label String) ENGINE=MergeTree ORDER BY id",
		"INSERT INTO " + privateDatabase + ".pages VALUES (9,'A'),(9,'B'),(10,'C')",
	} {
		if _, err := db.ExecContext(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	a, err := New(engines.ConnProfile{Kind: engines.KindClickHouse, Host: "127.0.0.1", Port: port, Username: defaultUser, Password: "fixture-only", Database: privateDatabase})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	columns, err := a.GetTableColumns(ctx, "pages")
	if err != nil {
		t.Fatal(err)
	}
	if engines.PreviewPrimaryKey(engines.KindClickHouse, columns) != nil {
		t.Fatal("non-unique key qualified", columns)
	}
	limit := int64(2)
	page, err := a.PreviewRows(ctx, engines.PreviewRowsInput{TableID: "pages", Limit: &limit, SortColumn: "id"})
	if err != nil || page.RowCount != 2 || page.PaginationMode != engines.PaginationOffset || page.NextCursor != "" || page.HasMore == nil || !*page.HasMore {
		t.Fatal(page, err)
	}
	if page.Rows[0]["id"] != page.Rows[1]["id"] {
		t.Fatal("fixture did not contain duplicate sorting keys")
	}
	if _, err := a.PreviewRows(ctx, engines.PreviewRowsInput{TableID: "pages", Cursor: "wrong-engine-cursor"}); !errors.Is(err, engines.ErrPreviewCursor) {
		t.Fatal("unsupported cursor ignored", err)
	}
}

// Capture actual native HTTP first-row/error/cancellation behavior. Keeping
// all-or-nothing buffering is intentional unless error semantics also survive.
func TestPrivateNativeClickHouseHTTPBuffering(t *testing.T) {
	db, _ := privateHTTPDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), privateHTTPTimeout)
	defer cancel()
	for _, wait := range []int{1, 0} {
		queryCtx := ch.Context(ctx, ch.WithSettings(ch.Settings{"wait_end_of_query": wait, "buffer_size": 1, "max_block_size": 1, "max_threads": 1}))
		for sample := 0; sample < 3; sample++ {
			start := time.Now()
			rows, err := db.QueryContext(queryCtx, "SELECT number,sleepEachRow(0.01) FROM numbers(12)")
			if err != nil {
				t.Fatal(err)
			}
			if !rows.Next() {
				rows.Close()
				t.Fatal("missing native first row")
			}
			first := time.Since(start)
			for rows.Next() {
			}
			resultErr := rows.Err()
			rows.Close()
			if resultErr != nil {
				t.Fatal(resultErr)
			}
			t.Logf("wait_end_of_query=%d sample=%d first-row=%s full=%s", wait, sample, first, time.Since(start))
		}
		rows, err := db.QueryContext(queryCtx, "SELECT number,throwIf(number=5,'private_late_error') FROM numbers(12)")
		seen := 0
		if err == nil {
			for rows.Next() {
				seen++
			}
			err = rows.Err()
			rows.Close()
		}
		if err == nil || !strings.Contains(err.Error(), "private_late_error") {
			t.Fatalf("late error lost: wait=%d seen=%d err=%v", wait, seen, err)
		}
		t.Logf("wait_end_of_query=%d late-error surfaced after %d rows", wait, seen)
		a := &Adapter{db: db, database: defaultDatabase}
		result, err := a.RunQuery(queryCtx, engines.RunQueryInput{Query: "SELECT number,throwIf(number=5,'private_late_error') FROM numbers(12)"})
		if err == nil || result != nil {
			t.Fatal("GUI admitted a partial failed query", wait, err)
		}
		start := time.Now()
		// Keep the default HTTP buffer here; only native block size/threads
		// are controlled so the byte-stop comparison is not a tiny-buffer trick.
		boundedCtx := ch.Context(ctx, ch.WithSettings(ch.Settings{"wait_end_of_query": wait, "max_block_size": 1, "max_threads": 1}))
		result, err = a.RunQuery(boundedCtx, engines.RunQueryInput{Query: "SELECT number,repeat('x',64000) AS label,sleepEachRow(0.003) FROM numbers(300)"})
		if err != nil || result == nil {
			t.Fatal("bounded streaming query", wait, err)
		}
		if result.LimitReason != engines.LimitReasonBytes || result.PayloadBytes > engines.MaxGUIResultBytes || len(result.Rows) == 0 {
			t.Fatal("native response was not bounded", result.LimitReason, result.PayloadBytes)
		}
		for _, row := range result.Rows {
			if len(row["label"].(string)) != 64000 {
				t.Fatal("native value clipped")
			}
		}
		t.Logf("wait_end_of_query=%d complete-row byte stop: rows=%d payload=%d wall=%s", wait, len(result.Rows), result.PayloadBytes, time.Since(start))
	}
	short, stop := context.WithTimeout(ctx, privateHTTPCancel)
	start := time.Now()
	_, err := db.QueryContext(short, "SELECT number,sleepEachRow(0.03) FROM numbers(100) SETTINGS max_block_size=1,max_threads=1")
	stop()
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("native HTTP context did not interrupt", err)
	}
	t.Logf("native HTTP cancellation returned in %s; not proof of server rollback/termination", time.Since(start))
	if rows, err := db.QueryContext(ctx, "SELECT 7"); err != nil {
		t.Fatal("pool reuse failed", err)
	} else {
		rows.Close()
	}
}
