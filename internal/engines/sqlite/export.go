package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/url"
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/sqlsafety"
)

// Use an independent read-only connection so export cancellation cannot cancel
// the grid or inherit a writing transaction. query_only also protects temp and
// attached databases; screening rejects ATTACH/PRAGMA/statement chains.
func (a *Adapter) ExportQueryCSV(ctx context.Context, input engines.RunQueryInput, output io.Writer) (*engines.QueryExportStats, error) {
	if safe, reason := sqlsafety.Check(input.Query); !safe {
		return nil, errors.New(reason)
	}
	if strings.TrimSpace(input.Query) == "" {
		return nil, errors.New("A read-only query is required for export")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	uri := url.URL{Scheme: "file", Path: a.path, RawQuery: "mode=ro"}
	db, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if err := configureMemory(db); err != nil {
		return nil, err
	}
	if _, err := db.ExecContext(ctx, "PRAGMA query_only = ON"); err != nil {
		return nil, err
	}
	rows, err := db.QueryContext(ctx, input.Query, input.Params...)
	if err != nil {
		return nil, err
	}
	defer func() { cancel(); rows.Close() }()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	writer, err := engines.NewCSVExporter(output, columns)
	if err != nil {
		return nil, err
	}
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	for rows.Next() {
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		if err := writer.WriteRow(ctx, values); err != nil {
			return nil, err
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return writer.Finish(ctx)
}
