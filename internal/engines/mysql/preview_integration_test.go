package mysql

import (
	"context"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const nativePreviewTimeout = 30 * time.Second

// Only opt into a caller-created private schema. No user profiles or ordinary
// database are opened, and every fixture table is dropped before returning.
func TestNativeMySQLMariaDBPreview(t *testing.T) {
	dsn := os.Getenv("KAMEHADB_TEST_MYSQL_PREVIEW")
	if dsn == "" {
		t.Skip("set a private synthetic MySQL/MariaDB DSN")
	}
	config, err := mysqlDriver.ParseDSN(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if config.Net != "tcp" || !strings.HasPrefix(config.DBName, "kamehadb_test_") {
		t.Fatal("fixture requires TCP and a private kamehadb_test_ schema")
	}
	host, portString, err := net.SplitHostPort(config.Addr)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.ParseInt(portString, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	ctx, stop := context.WithTimeout(context.Background(), nativePreviewTimeout)
	defer stop()
	for _, kind := range []string{engines.KindMySQL, engines.KindMariaDB} {
		t.Run(kind, func(t *testing.T) {
			a, err := New(engines.ConnProfile{Kind: kind, Host: host, Port: port, Database: config.DBName, Username: config.User, Password: config.Passwd})
			if err != nil {
				t.Fatal(err)
			}
			defer a.Close()
			for _, fixture := range []struct {
				name, dataType, values string
				expected               []string
			}{
				{"signed", "BIGINT", "(-9223372036854775808),(9),(10),(9007199254740993),(9223372036854775807)", []string{"-9223372036854775808", "9", "10", "9007199254740993", "9223372036854775807"}},
				{"unsigned", "BIGINT UNSIGNED", "(9),(10),(9007199254740993),(9223372036854775808),(18446744073709551615)", []string{"9", "10", "9007199254740993", "9223372036854775808", "18446744073709551615"}},
				{"text", "VARCHAR(100) COLLATE utf8mb4_bin", "('9'),('A'),('a'),('quoted'' OR 1=1 --'),('日本語')", []string{"9", "A", "a", "quoted' OR 1=1 --", "日本語"}},
			} {
				t.Run(fixture.name, func(t *testing.T) {
					table := "preview_" + fixture.name
					if _, err := a.db.ExecContext(ctx, "CREATE TABLE "+a.esc(table)+"(id "+fixture.dataType+" PRIMARY KEY) DEFAULT CHARSET=utf8mb4"); err != nil {
						t.Fatal(err)
					}
					defer func() { _, _ = a.db.ExecContext(context.Background(), "DROP TABLE "+a.esc(table)) }()
					if _, err := a.db.ExecContext(ctx, "INSERT INTO "+a.esc(table)+" VALUES "+fixture.values); err != nil {
						t.Fatal(err)
					}
					columns, err := a.GetTableColumns(ctx, table)
					if err != nil {
						t.Fatal(err)
					}
					for _, direction := range []string{"asc", "desc"} {
						limit := int64(1)
						input := engines.PreviewRowsInput{TableID: table, Limit: &limit, SortDirection: direction}
						for i := range fixture.expected {
							page, err := a.PreviewRowsWithColumns(ctx, input, columns)
							if err != nil || page.RowCount != 1 || page.PaginationMode != engines.PaginationKeyset {
								t.Fatal(direction, i, page, err)
							}
							index := i
							if direction == "desc" {
								index = len(fixture.expected) - 1 - i
							}
							if got := fmt.Sprint(page.Rows[0]["id"]); got != fixture.expected[index] {
								t.Fatalf("%s/%d: %s != %s", direction, i, got, fixture.expected[index])
							}
							more := i+1 < len(fixture.expected)
							if page.HasMore == nil || *page.HasMore != more || more && page.NextCursor == "" {
								t.Fatal("wrong continuation", page)
							}
							input.Cursor = page.NextCursor
						}
					}
				})
			}
			// Wide searched rows shorten pages; removing the last admitted key
			// must neither repeat earlier matches nor skip the next native row.
			if _, err := a.db.ExecContext(ctx, "CREATE TABLE preview_wide(`i``d` BIGINT PRIMARY KEY,left_text LONGTEXT,right_text VARCHAR(20))"); err != nil {
				t.Fatal(err)
			}
			defer func() { _, _ = a.db.ExecContext(context.Background(), "DROP TABLE preview_wide") }()
			for i := 1; i <= 70; i++ {
				if _, err := a.db.ExecContext(ctx, "INSERT INTO preview_wide VALUES (?,REPEAT('x',64000),'needle')", i); err != nil {
					t.Fatal(err)
				}
			}
			limit := int64(100)
			input := engines.PreviewRowsInput{TableID: "preview_wide", Limit: &limit, Search: "needle"}
			columns, err := a.GetTableColumns(ctx, input.TableID)
			if err != nil {
				t.Fatal(err)
			}
			first, err := a.PreviewRowsWithColumns(ctx, input, columns)
			if err != nil {
				t.Fatal(err)
			}
			if first.RowCount < 1 || first.RowCount >= 70 || first.LimitReason != engines.LimitReasonBytes {
				t.Fatalf("rows=%d reason=%s", first.RowCount, first.LimitReason)
			}
			if _, err := a.db.ExecContext(ctx, "DELETE FROM preview_wide WHERE `i``d` = ?", first.Rows[len(first.Rows)-1]["i`d"]); err != nil {
				t.Fatal(err)
			}
			input.Cursor = first.NextCursor
			second, err := a.PreviewRowsWithColumns(ctx, input, columns)
			if err != nil {
				t.Fatal(err)
			}
			if second.RowCount < 1 || fmt.Sprint(second.Rows[0]["i`d"]) != fmt.Sprint(first.RowCount+1) {
				t.Fatal("OR search/deleted anchor did not advance")
			}
			input.Cursor = ""
			input.SortColumn = "right_text"
			fallback, err := a.PreviewRowsWithColumns(ctx, input, columns)
			if err != nil || fallback.PaginationMode != engines.PaginationOffset {
				t.Fatal("arbitrary order claimed seek", err)
			}
			rows, err := a.db.QueryContext(ctx, "EXPLAIN SELECT * FROM preview_wide WHERE `i``d` > ? ORDER BY `i``d` LIMIT 1", int64(60))
			if err != nil {
				t.Fatal(err)
			}
			names, err := rows.Columns()
			if err != nil {
				rows.Close()
				t.Fatal(err)
			}
			values, pointers := make([]any, len(names)), make([]any, len(names))
			for i := range pointers {
				pointers[i] = &values[i]
			}
			if !rows.Next() {
				rows.Close()
				t.Fatal("no native plan")
			}
			if err := rows.Scan(pointers...); err != nil {
				rows.Close()
				t.Fatal(err)
			}
			rows.Close()
			for i, name := range names {
				if name == "type" {
					if data, ok := values[i].([]byte); !ok || string(data) != "range" {
						t.Fatal("key comparison did not use native range", values)
					}
				}
			}
		})
	}
}
