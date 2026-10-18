package engines

import (
	"context"
	"errors"
	"io"
	"strings"
)

// SQLAdapter mirrors the SqlAdapter contract in packages/shared. Optional
// methods become small interfaces type-asserted by callers, like the TS
// `method?` members.
type SQLAdapter interface {
	TestConnection(ctx context.Context) (*TestConnectionResult, error)
	ListDatabases(ctx context.Context) ([]DatabaseInfo, error)
	ListSchemas(ctx context.Context, database *string) ([]SchemaInfo, error)
	ListTables(ctx context.Context, schema *string) ([]TableInfo, error)
	GetTableColumns(ctx context.Context, tableID string) ([]ColumnInfo, error)
	GetTableIndexes(ctx context.Context, tableID string) ([]IndexInfo, error)
	GetCompletions(ctx context.Context, schema *string) ([]TableCompletions, error)
	PreviewRows(ctx context.Context, input PreviewRowsInput) (*QueryResult, error)
	RunQuery(ctx context.Context, input RunQueryInput) (*QueryResult, error)
	Close() error
}

// MetadataPreviewer reuses authoritative service-cached columns for seek
// planning; direct adapter callers still use the mandatory PreviewRows method.
type MetadataPreviewer interface {
	PreviewRowsWithColumns(ctx context.Context, input PreviewRowsInput, columns []ColumnInfo) (*QueryResult, error)
}

// QueryExporter streams a read-only original query without GUI row/payload
// limits. Engines without it retain bounded current-result frontend exports.
type QueryExporter interface {
	ExportQueryCSV(ctx context.Context, input RunQueryInput, writer io.Writer) (*QueryExportStats, error)
}

// Optional capabilities (TS `?` members):
type SchemaSearcher interface {
	SearchSchema(ctx context.Context, input SchemaSearchInput) ([]SchemaSearchMatch, error)
}
type IndexStatser interface {
	GetIndexStats(ctx context.Context, tableID string) ([]IndexStats, error)
}
type TableStatser interface {
	GetTableStats(ctx context.Context, tableID string) (*TableStats, error)
}
type DatabaseSizer interface {
	GetDatabaseSizes(ctx context.Context, schema *string) ([]DatabaseSize, error)
}
type SessionLister interface {
	GetActiveConnections(ctx context.Context) ([]ConnectionInfo, error)
}

var errNotSupported = errors.New("Not supported")

// UnsupportedAdapter mirrors the fallback getSqlAdapter caches for kinds
// without a factory: empty lists, failing runQuery/previewRows.
type UnsupportedAdapter struct {
	Kind string
}

func (a *UnsupportedAdapter) TestConnection(ctx context.Context) (*TestConnectionResult, error) {
	return &TestConnectionResult{Success: false, Message: "Unsupported for " + a.Kind}, nil
}

func (a *UnsupportedAdapter) ListDatabases(ctx context.Context) ([]DatabaseInfo, error) {
	return []DatabaseInfo{}, nil
}

func (a *UnsupportedAdapter) ListSchemas(ctx context.Context, database *string) ([]SchemaInfo, error) {
	return []SchemaInfo{}, nil
}

func (a *UnsupportedAdapter) ListTables(ctx context.Context, schema *string) ([]TableInfo, error) {
	return []TableInfo{}, nil
}

func (a *UnsupportedAdapter) GetTableColumns(ctx context.Context, tableID string) ([]ColumnInfo, error) {
	return []ColumnInfo{}, nil
}

func (a *UnsupportedAdapter) GetTableIndexes(ctx context.Context, tableID string) ([]IndexInfo, error) {
	return []IndexInfo{}, nil
}

func (a *UnsupportedAdapter) GetCompletions(ctx context.Context, schema *string) ([]TableCompletions, error) {
	return []TableCompletions{}, nil
}

func (a *UnsupportedAdapter) PreviewRows(ctx context.Context, input PreviewRowsInput) (*QueryResult, error) {
	return nil, errNotSupported
}

func (a *UnsupportedAdapter) RunQuery(ctx context.Context, input RunQueryInput) (*QueryResult, error) {
	return nil, errNotSupported
}
func (a *UnsupportedAdapter) Close() error { return nil }

// QuoteIdentifier quotes a SQL identifier per dialect — identifiers cannot
// be bound parameters, so adapters route all metadata names through this.
func QuoteIdentifier(kind, name string) string {
	switch kind {
	case KindMySQL, KindMariaDB:
		return "`" + strings.ReplaceAll(name, "`", "``") + "`"
	case KindSQLServer:
		return "[" + strings.ReplaceAll(name, "]", "]]") + "]"
	default:
		return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	}
}
