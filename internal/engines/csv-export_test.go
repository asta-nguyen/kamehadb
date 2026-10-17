package engines

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"io"
	"strings"
	"testing"
)

type failingCSVWriter struct{}

func (failingCSVWriter) Write([]byte) (int, error) { return 0, errors.New("disk full") }

func TestCSVExporterValuesAndHeaders(t *testing.T) {
	var out bytes.Buffer
	writer, err := NewCSVExporter(&out, []string{"duplicate", "duplicate", "=header", "blob"})
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteRow(context.Background(), []any{"a,\"b\"\r\n日本語", " \t=SUM(1)", nil, []byte{0xff, 0x00}}); err != nil {
		t.Fatal(err)
	}
	stats, err := writer.Finish(context.Background())
	if err != nil || stats.Bytes != int64(out.Len()) || stats.Rows != 1 {
		t.Fatal("wrong stats", stats, err)
	}
	rows, err := csv.NewReader(strings.NewReader(out.String())).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if rows[0][0] != rows[0][1] || rows[0][2] != "'=header" || rows[1][1] != "' \t=SUM(1)" || rows[1][3] != "\\xff00" {
		t.Fatalf("wrong CSV: %v", rows)
	}
	if !strings.Contains(rows[1][0], "日本語") || !strings.Contains(rows[1][0], "\"b\"") {
		t.Fatal("value changed")
	}
}

// A generated stream verifies the writer's state is fixed-size rather than
// accumulating rows; allocation/whole-app peaks are measured separately.
func TestCSVExporterLargeStreamAndFailures(t *testing.T) {
	writer, err := NewCSVExporter(io.Discard, []string{"id", "value"})
	if err != nil {
		t.Fatal(err)
	}
	row := []any{int64(0), "payload"}
	for n := int64(0); n < 100000; n++ {
		row[0] = n
		if err := writer.WriteRow(context.Background(), row); err != nil {
			t.Fatal(err)
		}
	}
	stats, err := writer.Finish(context.Background())
	if err != nil || stats.Rows != 100000 {
		t.Fatal("stream incomplete", stats, err)
	}
	bad, err := NewCSVExporter(failingCSVWriter{}, []string{"value"})
	if err != nil {
		t.Fatal(err)
	}
	if err := bad.WriteRow(context.Background(), []any{strings.Repeat("x", csvBufferBytes*2)}); err == nil {
		t.Fatal("write failure hidden")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := writer.WriteRow(cancelled, row); !errors.Is(err, context.Canceled) {
		t.Fatal("cancel ignored")
	}
}
