package engines

import "context"

// Result/metadata types mirror packages/shared/src/types.ts field-for-field
// (camelCase JSON keeps the generated Wails bindings shape-compatible).

// MaxGuiRows caps the maximum number of rows returned to the GUI in a single
// un-paginated query (50,000 rows). This prevents massive IPC transfers and
// WebKit heap saturation when queries accidentally match multi-million row tables.
const MaxGuiRows = 50000

type QueryColumn struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable *bool  `json:"nullable,omitempty"`
}

type QueryResult struct {
	Columns    []QueryColumn    `json:"columns"`
	Rows       []map[string]any `json:"rows"`
	RowCount   int64            `json:"rowCount"`
	DurationMs float64          `json:"durationMs"`
	Truncated  bool             `json:"truncated"`
}

type DatabaseInfo struct {
	Name string `json:"name"`
}

type SchemaInfo struct {
	Name string `json:"name"`
}

type TableInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Schema      string `json:"schema,omitempty"`
	Type        string `json:"type,omitempty"`
	RowEstimate *int64 `json:"rowEstimate,omitempty"`
}

type ColumnForeignKey struct {
	Schema string `json:"schema,omitempty"`
	Table  string `json:"table"`
	Column string `json:"column"`
}

type ColumnInfo struct {
	Name             string            `json:"name"`
	Type             string            `json:"type"`
	Nullable         bool              `json:"nullable"`
	Default          *string           `json:"default"`
	PrimaryKey       bool              `json:"primaryKey"`
	ForeignKey       *ColumnForeignKey `json:"foreignKey,omitempty"`
	IsVector         bool              `json:"isVector,omitempty"`
	VectorDimensions *int64            `json:"vectorDimensions,omitempty"`
}

type TableCompletions struct {
	Name    string       `json:"name"`
	Schema  string       `json:"schema,omitempty"`
	Columns []ColumnInfo `json:"columns"`
}

type IndexInfo struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
	Primary bool     `json:"primary"`
	Method  string   `json:"method,omitempty"`
}

type SchemaSearchMatch struct {
	Schema     string `json:"schema"`
	Table      string `json:"table"`
	Column     string `json:"column,omitempty"`
	ColumnType string `json:"columnType,omitempty"`
	MatchType  string `json:"matchType"`
}

type SchemaSearchInput struct {
	Query  string `json:"query"`
	Schema string `json:"schema,omitempty"`
	Limit  *int   `json:"limit,omitempty"`
}

type PreviewFilter struct {
	Column   string `json:"column"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

type PreviewRowsInput struct {
	TableID       string          `json:"tableId"`
	Schema        string          `json:"schema,omitempty"`
	Offset        *int64          `json:"offset,omitempty"`
	Limit         *int64          `json:"limit,omitempty"`
	SortColumn    string          `json:"sortColumn,omitempty"`
	SortDirection string          `json:"sortDirection,omitempty"`
	Search        string          `json:"search,omitempty"`
	Filters       []PreviewFilter `json:"filters,omitempty"`
}

type RunQueryInput struct {
	Query  string `json:"query"`
	Params []any  `json:"params,omitempty"`
}

type TestConnectionResult struct {
	Success       bool     `json:"success"`
	Message       string   `json:"message,omitempty"`
	ServerVersion string   `json:"serverVersion,omitempty"`
	LatencyMs     *float64 `json:"latencyMs,omitempty"`
}

type IndexStats struct {
	Name         string   `json:"name"`
	Table        string   `json:"table"`
	Columns      []string `json:"columns"`
	Unique       bool     `json:"unique"`
	Primary      bool     `json:"primary"`
	Method       string   `json:"method,omitempty"`
	SizeBytes    int64    `json:"sizeBytes"`
	Scans        int64    `json:"scans"`
	Reads        int64    `json:"reads"`
	UsagePercent float64  `json:"usagePercent"`
}

type TableStats struct {
	TableID         string  `json:"tableId"`
	Name            string  `json:"name"`
	Schema          string  `json:"schema"`
	RowEstimate     int64   `json:"rowEstimate"`
	TotalBytes      int64   `json:"totalBytes"`
	IndexesBytes    int64   `json:"indexesBytes"`
	ToastBytes      int64   `json:"toastBytes"`
	BloatBytes      int64   `json:"bloatBytes"`
	BloatPercent    float64 `json:"bloatPercent"`
	LastVacuum      *string `json:"lastVacuum"`
	LastAutovacuum  *string `json:"lastAutovacuum"`
	LastAnalyze     *string `json:"lastAnalyze"`
	LastAutoanalyze *string `json:"lastAutoanalyze"`
	VacuumCount     int64   `json:"vacuumCount"`
	AutovacuumCount int64   `json:"autovacuumCount"`
	NLiveTup        int64   `json:"nLiveTup"`
	NDeadTup        int64   `json:"nDeadTup"`
}

type DatabaseSize struct {
	Schema      string `json:"schema"`
	Table       string `json:"table"`
	SizeBytes   int64  `json:"sizeBytes"`
	IndexBytes  int64  `json:"indexBytes"`
	TotalBytes  int64  `json:"totalBytes"`
	RowEstimate int64  `json:"rowEstimate"`
}

type ConnectionInfo struct {
	PID             int64   `json:"pid"`
	Usename         string  `json:"usename"`
	ApplicationName string  `json:"applicationName"`
	ClientAddr      *string `json:"clientAddr"`
	BackendStart    string  `json:"backendStart"`
	State           string  `json:"state"`
	Query           *string `json:"query"`
	QueryStart      *string `json:"queryStart"`
	WaitEventType   *string `json:"waitEventType"`
	WaitEvent       *string `json:"waitEvent"`
	DurationSeconds float64 `json:"durationSeconds"`
}

// BoundedQuery* mirror the MCP bounded-read contract (sidecar mcp/types.ts):
// array rows preserve duplicate column names that map rows would collapse.
type BoundedQueryInput struct {
	Query   string `json:"query"`
	MaxRows int64  `json:"maxRows"`
}

type BoundedQueryResult struct {
	Columns    []QueryColumn `json:"columns"`
	Rows       [][]any       `json:"rows"`
	DurationMs float64       `json:"durationMs"`
	Truncated  bool          `json:"truncated"`
}

// BoundedReader is the MCP-only bounded read (TS runQueryBounded).
type BoundedReader interface {
	RunQueryBounded(ctx context.Context, input BoundedQueryInput) (*BoundedQueryResult, error)
}
