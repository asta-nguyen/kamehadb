package api

import (
	"context"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

type sortTestLoader struct{}

func (sortTestLoader) ProfileForConnect(string) (engines.ConnProfile, error) {
	return engines.ConnProfile{Kind: "test-cached-sort"}, nil
}

type sortTestAdapter struct {
	engines.UnsupportedAdapter
	reads int
}

func (a *sortTestAdapter) GetTableColumns(context.Context, string) ([]engines.ColumnInfo, error) {
	a.reads++
	return []engines.ColumnInfo{{Name: "name", Type: "text"}}, nil
}

func (a *sortTestAdapter) PreviewRows(context.Context, engines.PreviewRowsInput) (*engines.QueryResult, error) {
	return &engines.QueryResult{Columns: []engines.QueryColumn{}, Rows: []map[string]any{}}, nil
}

// Sorting should validate against the same TTL metadata already used by the
// grid, not pay for another information_schema query on every sort click.
func TestSortUsesCachedColumnsWithoutWeakeningValidation(t *testing.T) {
	adapter := &sortTestAdapter{}
	engines.RegisterFactory("test-cached-sort", func(engines.ConnProfile) (engines.SQLAdapter, error) { return adapter, nil })
	registry := engines.NewRegistry(sortTestLoader{})
	defer registry.Close()
	service := NewSqlService(registry, newTTLCache())
	if _, err := service.GetTableColumns("connection", "users"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.PreviewRows("connection", engines.PreviewRowsInput{TableID: "users", SortColumn: "name"}); err != nil {
		t.Fatal(err)
	}
	if adapter.reads != 1 {
		t.Fatalf("sort performed %d column reads after metadata was cached", adapter.reads)
	}
	if _, err := service.PreviewRows("connection", engines.PreviewRowsInput{TableID: "users", SortColumn: "not_a_column"}); err == nil {
		t.Fatal("invalid sort column was accepted")
	}
}
