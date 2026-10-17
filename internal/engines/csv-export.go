package engines

import (
	"bufio"
	"context"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode"
)

const csvBufferBytes = 32 << 10

type QueryExportStats struct {
	Rows  int64 `json:"rows"`
	Bytes int64 `json:"bytes"`
}

type csvCountingWriter struct {
	writer io.Writer
	bytes  int64
}

func (w *csvCountingWriter) Write(data []byte) (int, error) {
	n, err := w.writer.Write(data)
	w.bytes += int64(n)
	return n, err
}

// Retain only the current row and a fixed output buffer; full exports must not
// build result maps, giant strings or a WebView Blob proportional to the table.
type CSVExporter struct {
	writer  *csv.Writer
	counter *csvCountingWriter
	rows    int64
}

func NewCSVExporter(output io.Writer, columns []string) (*CSVExporter, error) {
	counter := &csvCountingWriter{writer: output}
	writer := csv.NewWriter(bufio.NewWriterSize(counter, csvBufferBytes))
	headers := make([]string, len(columns))
	for i, name := range columns {
		headers[i] = protectCSVFormula(name)
	}
	if err := writer.Write(headers); err != nil {
		return nil, err
	}
	return &CSVExporter{writer: writer, counter: counter}, nil
}

// Reuse the row slice at the reader and encode each cell in isolation. Binary
// fields use lossless hex instead of invalid UTF-8 silently changing bytes.
func (e *CSVExporter) WriteRow(ctx context.Context, values []any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	row := make([]string, len(values))
	for i, value := range values {
		text, err := csvValue(value)
		if err != nil {
			return err
		}
		row[i] = protectCSVFormula(text)
	}
	if err := e.writer.Write(row); err != nil {
		return err
	}
	e.rows++
	return nil
}

func (e *CSVExporter) Finish(ctx context.Context) (*QueryExportStats, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	e.writer.Flush()
	if err := e.writer.Error(); err != nil {
		return nil, err
	}
	return &QueryExportStats{Rows: e.rows, Bytes: e.counter.bytes}, nil
}

func csvValue(value any) (string, error) {
	switch v := value.(type) {
	case nil:
		return "", nil
	case string:
		return v, nil
	case []byte:
		return "\\x" + hex.EncodeToString(v), nil
	case time.Time:
		return v.Format(time.RFC3339Nano), nil
	case map[string]any, []any:
		data, err := json.Marshal(v)
		return string(data), err
	default:
		return fmt.Sprint(v), nil
	}
}

// Match current-result export's spreadsheet protection, including whitespace
// before a formula trigger; CSV quoting alone does not prevent execution.
func protectCSVFormula(value string) string {
	trimmed := strings.TrimLeftFunc(value, unicode.IsSpace)
	if len(trimmed) > 0 && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return "'" + value
	}
	return value
}
