package postgres

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/sqlsafety"
	"github.com/jackc/pgx/v5"
)

const exportRollbackTimeout = 5 * time.Second

// PostgreSQL enforces read-only execution in addition to keyword screening.
// Simple-protocol raw text preserves numeric/JSON precision without Go maps;
// the original SQL (including intentional LIMIT) is never rewritten or replayed.
func (a *Adapter) ExportQueryCSV(ctx context.Context, input engines.RunQueryInput, output io.Writer) (*engines.QueryExportStats, error) {
	if safe, reason := sqlsafety.Check(input.Query); !safe {
		return nil, errors.New(reason)
	}
	if strings.TrimSpace(input.Query) == "" {
		return nil, errors.New("A read-only query is required for export")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	tx, err := a.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), exportRollbackTimeout)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	args := append([]any{pgx.QueryExecModeSimpleProtocol}, input.Params...)
	rows, err := tx.Query(ctx, input.Query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { cancel(); rows.Close() }()
	fields := rows.FieldDescriptions()
	columns := make([]string, len(fields))
	for i, field := range fields {
		columns[i] = field.Name
	}
	writer, err := engines.NewCSVExporter(output, columns)
	if err != nil {
		return nil, err
	}
	values := make([]any, len(fields))
	for rows.Next() {
		for i, raw := range rows.RawValues() {
			if raw == nil {
				values[i] = nil
			} else {
				values[i] = string(raw)
			}
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
