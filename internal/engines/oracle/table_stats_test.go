package oracle

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines/enginetest"
)

func TestOracleGetTableStats(t *testing.T) {
	t.Run("calculates total bytes from table, index, and lob segments", func(t *testing.T) {
		db := enginetest.DB(t, func(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "FROM dual") {
				// num_rows: 20000, table_bytes: 458752 (448 KB), index_bytes: 1184896 (1.13 MB), lob_bytes: 65536 (64 KB)
				return &enginetest.Rows{
					Names:  []string{"num_rows", "table_bytes", "index_bytes", "lob_bytes"},
					Values: [][]driver.Value{{int64(20000), int64(458752), int64(1184896), int64(65536)}},
				}, nil
			}
			return nil, nil
		})

		a := &Adapter{db: db, username: "KAMEHA"}
		stats, err := a.GetTableStats(context.Background(), "KAMEHA.TEST_TBL")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		wantTotal := int64(458752 + 1184896 + 65536)
		if stats.TotalBytes != wantTotal {
			t.Errorf("TotalBytes = %d, want %d", stats.TotalBytes, wantTotal)
		}
		if stats.IndexesBytes != 1184896 {
			t.Errorf("IndexesBytes = %d, want %d", stats.IndexesBytes, 1184896)
		}
		if stats.RowEstimate != 20000 || stats.NLiveTup != 20000 {
			t.Errorf("RowEstimate = %d, NLiveTup = %d, want 20000", stats.RowEstimate, stats.NLiveTup)
		}
	})

	t.Run("falls back to count when num_rows is null prior to DBMS_STATS", func(t *testing.T) {
		var countExecuted bool
		db := enginetest.DB(t, func(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "FROM dual") {
				// num_rows is NULL (nil), table_bytes: 458752, index_bytes: 1184896, lob_bytes: 0
				return &enginetest.Rows{
					Names:  []string{"num_rows", "table_bytes", "index_bytes", "lob_bytes"},
					Values: [][]driver.Value{{nil, int64(458752), int64(1184896), int64(0)}},
				}, nil
			}
			if strings.Contains(query, "SELECT COUNT(1) FROM") {
				countExecuted = true
				if !strings.Contains(query, `"KAMEHA"."TEST_TBL"`) {
					t.Errorf("unexpected table identifier in count query: %s", query)
				}
				return &enginetest.Rows{
					Names:  []string{"cnt"},
					Values: [][]driver.Value{{int64(20000)}},
				}, nil
			}
			return nil, nil
		})

		a := &Adapter{db: db, username: "KAMEHA"}
		stats, err := a.GetTableStats(context.Background(), "KAMEHA.TEST_TBL")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !countExecuted {
			t.Error("expected fallback COUNT(1) query to be executed when num_rows is NULL")
		}
		if stats.RowEstimate != 20000 || stats.NLiveTup != 20000 {
			t.Errorf("RowEstimate = %d, NLiveTup = %d, want 20000", stats.RowEstimate, stats.NLiveTup)
		}
		if stats.TotalBytes != 458752+1184896 {
			t.Errorf("TotalBytes = %d, want %d", stats.TotalBytes, 458752+1184896)
		}
	})
}
