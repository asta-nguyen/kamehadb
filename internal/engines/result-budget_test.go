package engines

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"
)

func TestResultBudgetWholeRows(t *testing.T) {
	parent := context.Background()
	child, cancel := context.WithCancel(parent)
	defer cancel()
	budget := NewResultBudget(parent, cancel, 2, MaxPreviewResultBytes)
	columns := []QueryColumn{{Name: "payload", Type: "text"}}
	if err := budget.SetColumns(columns); err != nil {
		t.Fatal(err)
	}
	rows := make([]map[string]any, 0)
	for _, value := range []string{"é<&\"\n", "second", "third"} {
		row := map[string]any{"payload": value}
		ok, err := budget.Add(row)
		if err != nil {
			t.Fatal(err)
		}
		if ok {
			rows = append(rows, row)
		}
	}
	result := budget.Apply(&QueryResult{Columns: columns, Rows: rows, RowCount: int64(len(rows))})
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if result.LimitReason != LimitReasonRows || !*result.HasMore || child.Err() == nil {
		t.Fatalf("row stop did not cancel: %+v", result)
	}
	if result.PayloadBytes < int64(len(data)) || result.PayloadBytes > MaxPreviewResultBytes || rows[0]["payload"] != "é<&\"\n" {
		t.Fatal("incorrect accounting or altered value")
	}
	if err := budget.Error(context.Canceled); err != nil {
		t.Fatalf("intentional stop surfaced as failure: %v", err)
	}
}

func TestResultBudgetExactBytes(t *testing.T) {
	row := map[string]any{"payload": "escaped\"\né"}
	ctx := context.Background()
	_, cancel := context.WithCancel(ctx)
	defer cancel()
	baseline := NewResultBudget(ctx, cancel, 10, MaxGUIResultBytes)
	if err := baseline.SetColumns([]QueryColumn{}); err != nil {
		t.Fatal(err)
	}
	n, err := encodedSize(row, MaxGUIResultBytes)
	if err != nil {
		t.Fatal(err)
	}
	for _, delta := range []int64{0, -1} {
		budget := NewResultBudget(ctx, cancel, 10, baseline.bytes+n+1+delta)
		if err := budget.SetColumns([]QueryColumn{}); err != nil {
			t.Fatal(err)
		}
		accepted, err := budget.Add(row)
		if err != nil || accepted != (delta == 0) {
			t.Fatalf("delta %d: accepted=%v error=%v", delta, accepted, err)
		}
	}
}

func TestResultBudgetOversizedAndParentCancellation(t *testing.T) {
	parent, cancelParent := context.WithCancel(context.Background())
	child, cancel := context.WithCancel(parent)
	defer cancel()
	budget := NewResultBudget(parent, cancel, 10, MaxPreviewResultBytes)
	if err := budget.SetColumns([]QueryColumn{}); err != nil {
		t.Fatal(err)
	}
	ok, err := budget.Add(map[string]any{"payload": strings.Repeat("x", MaxPreviewResultBytes)})
	result := budget.Apply(&QueryResult{Rows: []map[string]any{}})
	if err != nil || ok || *result.HasMore || !result.Truncated || child.Err() == nil {
		t.Fatalf("oversized first row: %+v, error=%v", result, err)
	}
	cancelParent()
	if !errors.Is(budget.Error(nil), context.Canceled) {
		t.Fatal("parent cancellation was hidden")
	}
}

func TestResultBudgetMetadataAndEncodingErrors(t *testing.T) {
	ctx := context.Background()
	child, cancel := context.WithCancel(ctx)
	defer cancel()
	budget := NewResultBudget(ctx, cancel, 10, MaxPreviewResultBytes)
	if err := budget.SetColumns([]QueryColumn{{Name: strings.Repeat("x", MaxPreviewResultBytes)}}); err == nil || child.Err() == nil {
		t.Fatal("oversized metadata did not fail and cancel")
	}
	_, cancel2 := context.WithCancel(ctx)
	defer cancel2()
	budget = NewResultBudget(ctx, cancel2, 10, MaxPreviewResultBytes)
	if _, err := budget.Add(map[string]any{"invalid": math.NaN()}); err == nil {
		t.Fatal("serialization error was hidden as truncation")
	}
}

func TestPreviewBounds(t *testing.T) {
	tooLarge := int64(MaxPreviewRows + 1)
	limit, offset, err := PreviewBounds(PreviewRowsInput{Limit: &tooLarge})
	if err != nil || limit != MaxPreviewRows || offset != 0 {
		t.Fatalf("clamp: %d %d %v", limit, offset, err)
	}
	negative, zero, overflow := int64(-1), int64(0), int64(math.MaxInt64)
	for _, input := range []PreviewRowsInput{{Limit: &negative}, {Limit: &zero}, {Offset: &negative}, {Offset: &overflow}} {
		if _, _, err := PreviewBounds(input); err == nil {
			t.Fatalf("invalid bounds accepted: %+v", input)
		}
	}
}
