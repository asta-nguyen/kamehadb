package postgres

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The opt-in fixture uses generated read-only rows, with no permanent schema
// objects. Raw JSON and bigint text must survive a native export unchanged.
func TestPostgresNativeCSV(t *testing.T) {
	dsn := os.Getenv("KAMEHADB_TEST_POSTGRES")
	if dsn == "" {
		t.Skip("set KAMEHADB_TEST_POSTGRES for private fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), previewTestTimeout)
	defer cancel()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 1
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	a := &Adapter{pool: pool}
	var out bytes.Buffer
	stats, err := a.ExportQueryCSV(ctx, engines.RunQueryInput{
		Query:  `SELECT n AS duplicate,n AS duplicate,9007199254740993::bigint AS big,'{"id":9007199254740993}'::jsonb AS doc, '=日本語' AS value, current_setting('transaction_read_only') AS readonly FROM generate_series(1,10) n WHERE n>$1 LIMIT 2`,
		Params: []any{int64(3)},
	}, &out)
	if err != nil || stats.Rows != 2 || stats.Bytes != int64(out.Len()) {
		t.Fatal("original params/LIMIT failed", stats, err)
	}
	rows, err := csv.NewReader(strings.NewReader(out.String())).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if rows[0][0] != rows[0][1] || rows[1][0] != "4" || rows[1][2] != "9007199254740993" || !strings.Contains(rows[1][3], "9007199254740993") || rows[1][4] != "'=日本語" || rows[1][5] != "on" {
		t.Fatalf("values/read-only changed: %v", rows)
	}
	for _, query := range []string{`UPDATE t SET v=1`, `WITH changed AS (DELETE FROM t RETURNING *) SELECT * FROM changed`, `SELECT 1; INSERT INTO t VALUES(1)`} {
		if _, err := a.ExportQueryCSV(ctx, engines.RunQueryInput{Query: query}, io.Discard); err == nil {
			t.Fatal("writing export accepted")
		}
	}
	stats, err = a.ExportQueryCSV(ctx, engines.RunQueryInput{Query: `SELECT n,'日本語' FROM generate_series(1,60000) n`}, io.Discard)
	if err != nil || stats.Rows != 60000 {
		t.Fatal("full export inherited GUI ceiling", stats, err)
	}

	// Stop a large native stream at its first buffer flush. Reusing the only
	// pool slot proves early close did not drain gigabytes or leak a transaction.
	for _, cancelled := range []bool{false, true} {
		t.Run(map[bool]string{false: "write failure", true: "cancel"}[cancelled], func(t *testing.T) {
			request, stop := context.WithCancel(ctx)
			defer stop()
			failure := errors.New("disk full")
			writer := &interruptedExportWriter{err: failure}
			if cancelled {
				writer.cancel = stop
				writer.err = context.Canceled
			}
			done := make(chan error, 1)
			go func() {
				_, err := a.ExportQueryCSV(request, engines.RunQueryInput{
					Query: `SELECT n, repeat('x', 65536) FROM generate_series(1,60000) n`,
				}, writer)
				done <- err
			}()
			select {
			case err := <-done:
				if !errors.Is(err, writer.err) {
					t.Fatalf("interruption hidden: %v", err)
				}
			case <-time.After(exportTestCleanupTimeout):
				stop()
				t.Fatal("export did not stop promptly")
			}
			if writer.calls == 0 {
				t.Fatal("test did not reach the native stream")
			}
			check, cancel := context.WithTimeout(ctx, exportTestCleanupTimeout)
			defer cancel()
			var one int
			if err := pool.QueryRow(check, `SELECT 1`).Scan(&one); err != nil || one != 1 {
				t.Fatal("pool not reusable after export interruption", err)
			}
		})
	}
}

const exportTestCleanupTimeout = 5 * time.Second

type interruptedExportWriter struct {
	cancel context.CancelFunc
	err    error
	calls  int
}

func (w *interruptedExportWriter) Write([]byte) (int, error) {
	w.calls++
	if w.cancel != nil {
		w.cancel()
	}
	return 0, w.err
}
