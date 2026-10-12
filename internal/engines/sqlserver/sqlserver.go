// Package sqlserver ports apps/sidecar/src/adapters/sqlserver.ts on
// microsoft/go-mssqldb (database/sql driver name "sqlserver").
package sqlserver

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	_ "github.com/microsoft/go-mssqldb"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	defaultHost        = "localhost"
	defaultDatabase    = "master"
	testConnectTimeout = 5 * time.Second
	connectTimeout     = 10 * time.Second
	// MCP_QUERY_TIMEOUT_MS — default statement deadline for adapter requests.
	defaultRequestTimeout = 30 * time.Second
)

// DSN builds the go-mssqldb URL for a connect profile — exported for the
// MCP provisioner's one-off admin connections.
func DSN(cp engines.ConnProfile, timeout time.Duration) string { return dsn(cp, timeout) }

func dsn(cp engines.ConnProfile, timeout time.Duration) string {
	host := cp.Host
	if host == "" {
		host = defaultHost
	}
	port := cp.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindSQLServer])
	}
	database := cp.Database
	if database == "" {
		database = defaultDatabase
	}
	q := url.Values{}
	q.Set("database", database)
	q.Set("connection timeout", fmt.Sprintf("%d", int64(timeout/time.Second)))
	u := &url.URL{
		Scheme:   "sqlserver",
		User:     url.UserPassword(cp.Username, cp.Password),
		Host:     fmt.Sprintf("%s:%d", host, port),
		RawQuery: q.Encode(),
	}
	return u.String()
}

type Adapter struct {
	db             *sql.DB
	requestTimeout time.Duration
}

// New mirrors createSqlServerAdapter. timeoutMs is the MCP request timeout
// option; the zero value falls back to MCP_QUERY_TIMEOUT_MS.
func New(cp engines.ConnProfile) (*Adapter, error) {
	return NewWithTimeout(cp, 0)
}

func NewWithTimeout(cp engines.ConnProfile, timeoutMs int64) (*Adapter, error) {
	db, err := sql.Open("sqlserver", dsn(cp, connectTimeout))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	db.SetConnMaxIdleTime(30 * time.Second)
	reqTimeout := defaultRequestTimeout
	if timeoutMs > 0 {
		reqTimeout = time.Duration(timeoutMs) * time.Millisecond
	}
	return &Adapter{db: db, requestTimeout: reqTimeout}, nil
}

func init() {
	engines.RegisterFactory(engines.KindSQLServer, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
		return New(cp)
	})
}

// queryCtx applies the requestTimeout the mssql pool configured per request.
func (a *Adapter) queryCtx(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, a.requestTimeout)
}

func esc(id string) string { return engines.QuoteIdentifier(engines.KindSQLServer, id) }

func splitTableID(tableID string) (string, string) {
	parts := strings.Split(tableID, ".")
	if len(parts) > 1 {
		return parts[0], parts[1]
	}
	return "dbo", tableID
}

func normalizeValue(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		return string(t)
	case time.Time:
		return t.Format(time.RFC3339Nano)
	default:
		return v
	}
}

// rowsToMaps scans an active sql.Rows cursor into map rows, capping at maxRows (0 for unlimited).
// Pre-allocates and reuses the scan pointer buffer across iterations to prevent millions of
// small heap allocations when reading large result sets. (How / Why / What)
func rowsToMaps(rows *sql.Rows, maxRows int64) ([]engines.QueryColumn, []map[string]any, bool, error) {
	names, err := rows.Columns()
	if err != nil {
		return nil, nil, false, err
	}
	types, _ := rows.ColumnTypes()
	qcols := make([]engines.QueryColumn, len(names))
	for i, name := range names {
		typ := ""
		if i < len(types) {
			typ = types[i].DatabaseTypeName()
		}
		qcols[i] = engines.QueryColumn{Name: name, Type: typ}
	}
	out := make([]map[string]any, 0, 64)
	vals := make([]any, len(names))
	ptrs := make([]any, len(names))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	truncated := false
	for rows.Next() {
		if maxRows > 0 && int64(len(out)) >= maxRows {
			truncated = true
			break
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, nil, false, err
		}
		m := make(map[string]any, len(names))
		for i, name := range names {
			m[name] = normalizeValue(vals[i])
		}
		out = append(out, m)
	}
	return qcols, out, truncated, rows.Err()
}

func (a *Adapter) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	var version string
	if err := a.db.QueryRowContext(ctx, "SELECT @@VERSION AS version").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT name FROM sys.databases WHERE state = 0 ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.DatabaseInfo{}
	for rows.Next() {
		var d engines.DatabaseInfo
		if err := rows.Scan(&d.Name); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (a *Adapter) ListSchemas(ctx context.Context, _ *string) ([]engines.SchemaInfo, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT name FROM sys.schemas ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.SchemaInfo{}
	for rows.Next() {
		var s engines.SchemaInfo
		if err := rows.Scan(&s.Name); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (a *Adapter) ListTables(ctx context.Context, schema *string) ([]engines.TableInfo, error) {
	s := "dbo"
	if schema != nil && *schema != "" {
		s = *schema
	}
	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	rows, err := a.db.QueryContext(ctx2, `
		SELECT TABLE_NAME AS name, TABLE_SCHEMA AS schema_name
		FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_SCHEMA = @p1 AND TABLE_TYPE = 'BASE TABLE'
		ORDER BY TABLE_NAME`, s)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.TableInfo{}
	for rows.Next() {
		var t engines.TableInfo
		if err := rows.Scan(&t.Name, &t.Schema); err != nil {
			return nil, err
		}
		t.ID = t.Schema + "." + t.Name
		out = append(out, t)
	}
	return out, rows.Err()
}

func (a *Adapter) GetTableColumns(ctx context.Context, tableID string) ([]engines.ColumnInfo, error) {
	schema, table := splitTableID(tableID)
	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	rows, err := a.db.QueryContext(ctx2, `
		SELECT
		  c.COLUMN_NAME AS name,
		  c.DATA_TYPE AS type,
		  c.IS_NULLABLE AS nullable,
		  c.COLUMN_DEFAULT AS [default],
		  COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity,
		  CASE WHEN k.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS primary_key
		FROM INFORMATION_SCHEMA.COLUMNS c
		LEFT JOIN (
		  SELECT ku.COLUMN_NAME
		  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
		  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
		    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
		  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
		    AND ku.TABLE_SCHEMA = @p1
		    AND ku.TABLE_NAME = @p2
		) k ON c.COLUMN_NAME = k.COLUMN_NAME
		WHERE c.TABLE_SCHEMA = @p1 AND c.TABLE_NAME = @p2
		ORDER BY c.ORDINAL_POSITION`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.ColumnInfo{}
	for rows.Next() {
		var c engines.ColumnInfo
		var nullable string
		var def sql.NullString
		var isIdentity, pk sql.NullInt64
		if err := rows.Scan(&c.Name, &c.Type, &nullable, &def, &isIdentity, &pk); err != nil {
			return nil, err
		}
		c.Nullable = nullable == "YES"
		if def.Valid {
			s := def.String
			c.Default = &s
		}
		c.PrimaryKey = pk.Int64 != 0
		out = append(out, c)
	}
	return out, rows.Err()
}

func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	schema, table := splitTableID(tableID)
	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	rows, err := a.db.QueryContext(ctx2, `
		SELECT
		  i.name AS index_name,
		  c.name AS column_name,
		  i.is_unique,
		  i.is_primary_key
		FROM sys.indexes i
		JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = @p1 AND t.name = @p2
		ORDER BY i.name, ic.key_ordinal`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.IndexInfo{}
	byName := map[string]*engines.IndexInfo{}
	for rows.Next() {
		var name, col string
		var unique, primary bool
		if err := rows.Scan(&name, &col, &unique, &primary); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			out = append(out, engines.IndexInfo{Name: name, Unique: unique, Primary: primary})
			idx = &out[len(out)-1]
			byName[name] = idx
		}
		idx.Columns = append(idx.Columns, col)
	}
	return out, rows.Err()
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	s := "dbo"
	if schema != nil && *schema != "" {
		s = *schema
	}
	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	rows, err := a.db.QueryContext(ctx2, `
		SELECT
		  c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE AS type,
		  c.IS_NULLABLE AS nullable, c.COLUMN_DEFAULT AS [default]
		FROM INFORMATION_SCHEMA.COLUMNS c
		WHERE c.TABLE_SCHEMA = @p1
		ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`, s)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.TableCompletions{}
	byName := map[string]*engines.TableCompletions{}
	for rows.Next() {
		var tableName, colName, typ, nullable string
		var def sql.NullString
		if err := rows.Scan(&tableName, &colName, &typ, &nullable, &def); err != nil {
			return nil, err
		}
		col := engines.ColumnInfo{Name: colName, Type: typ, Nullable: nullable == "YES"}
		if def.Valid {
			d := def.String
			col.Default = &d
		}
		t, ok := byName[tableName]
		if !ok {
			out = append(out, engines.TableCompletions{Name: tableName, Schema: s})
			t = &out[len(out)-1]
			byName[tableName] = t
		}
		t.Columns = append(t.Columns, col)
	}
	return out, rows.Err()
}

func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	schema, table := splitTableID(input.TableID)
	offset := int64(0)
	if input.Offset != nil {
		offset = *input.Offset
	}
	limit := int64(100)
	if input.Limit != nil {
		limit = *input.Limit
	}
	var sb strings.Builder
	var params []any
	sb.WriteString("SELECT * FROM ")
	sb.WriteString(esc(schema))
	sb.WriteString(".")
	sb.WriteString(esc(table))

	if input.Search != "" {
		ctx2, cancel := a.queryCtx(ctx)
		colRows, err := a.db.QueryContext(ctx2, `
			SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_SCHEMA = @p1 AND TABLE_NAME = @p2
			ORDER BY ORDINAL_POSITION`, schema, table)
		cancel()
		if err != nil {
			return nil, err
		}
		var searchCols []string
		for colRows.Next() {
			var c string
			if err := colRows.Scan(&c); err != nil {
				colRows.Close()
				return nil, err
			}
			if input.SearchColumn != "" && c != input.SearchColumn {
				continue
			}
			searchCols = append(searchCols, c)
		}
		colRows.Close()
		if len(searchCols) > 0 {
			clauses := make([]string, len(searchCols))
			for i, col := range searchCols {
				if input.MatchCase {
					clauses[i] = esc(col) + fmt.Sprintf(" COLLATE Latin1_General_BIN LIKE @p%d", len(params)+1)
				} else {
					clauses[i] = esc(col) + fmt.Sprintf(" LIKE @p%d", len(params)+1)
				}
				params = append(params, "%"+input.Search+"%")
			}
			sb.WriteString(" WHERE ")
			sb.WriteString(strings.Join(clauses, " OR "))
		} else {
			sb.WriteString(" WHERE 1 = 0")
		}
	}

	if input.SortColumn != "" {
		sb.WriteString(" ORDER BY ")
		sb.WriteString(esc(input.SortColumn))
		if input.SortDirection == "desc" {
			sb.WriteString(" DESC")
		} else {
			sb.WriteString(" ASC")
		}
	} else {
		sb.WriteString(" ORDER BY 1")
	}
	fmt.Fprintf(&sb, " OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", offset, limit)

	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	start := time.Now()
	rows, err := a.db.QueryContext(ctx2, sb.String(), params...)
	if err != nil {
		return nil, err
	}
	qcols, mapRows, _, err := rowsToMaps(rows, 0)
	rows.Close()
	if err != nil {
		return nil, err
	}
	return &engines.QueryResult{
		Columns:    qcols,
		Rows:       mapRows,
		RowCount:   int64(len(mapRows)),
		DurationMs: float64(time.Since(start).Milliseconds()),
		Truncated:  int64(len(mapRows)) >= limit,
	}, nil
}

func (a *Adapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	start := time.Now()
	rows, err := a.db.QueryContext(ctx2, input.Query, input.Params...)
	if err != nil {
		return nil, err
	}
	qcols, mapRows, truncated, err := rowsToMaps(rows, engines.MaxGuiRows)
	rows.Close()
	if err != nil {
		return nil, err
	}
	if mapRows == nil {
		mapRows = []map[string]any{}
	}
	return &engines.QueryResult{
		Columns:    qcols,
		Rows:       mapRows,
		RowCount:   int64(len(mapRows)),
		DurationMs: float64(time.Since(start).Milliseconds()),
		Truncated:  truncated,
	}, nil
}

// RunQueryBounded mirrors the streaming MCP read: scanning stops after
// maxRows+1 rows and the ctx-canceled remainder is never materialized.
func (a *Adapter) RunQueryBounded(ctx context.Context, input engines.BoundedQueryInput) (*engines.BoundedQueryResult, error) {
	start := time.Now()
	rowLimit := input.MaxRows
	if rowLimit < 1 {
		rowLimit = 1
	}
	ctx2, cancel := a.queryCtx(ctx)
	defer cancel()
	rows, err := a.db.QueryContext(ctx2, input.Query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	types, _ := rows.ColumnTypes()
	qcols := make([]engines.QueryColumn, len(names))
	for i, name := range names {
		typ := "unknown"
		if i < len(types) && types[i].DatabaseTypeName() != "" {
			typ = types[i].DatabaseTypeName()
		}
		qcols[i] = engines.QueryColumn{Name: name, Type: typ}
	}
	out := [][]any{}
	truncated := false
	for rows.Next() {
		vals := make([]any, len(names))
		ptrs := make([]any, len(names))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		for i := range vals {
			vals[i] = normalizeValue(vals[i])
		}
		if int64(len(out)) < rowLimit {
			out = append(out, vals)
		} else {
			truncated = true
			break
		}
	}
	return &engines.BoundedQueryResult{
		Columns:    qcols,
		Rows:       out,
		DurationMs: float64(time.Since(start).Milliseconds()),
		Truncated:  truncated,
	}, nil
}

var _ engines.BoundedReader = (*Adapter)(nil)

func (a *Adapter) Close() error {
	return a.db.Close()
}

// TestSqlServerConnection mirrors testSqlServerConnection — fresh pool,
// SELECT @@VERSION, discard.
func TestSqlServerConnection(ctx context.Context, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	db, err := sql.Open("sqlserver", dsn(cp, testConnectTimeout))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	ctx2, cancel := context.WithTimeout(ctx, testConnectTimeout)
	defer cancel()
	var version string
	if err := db.QueryRowContext(ctx2, "SELECT @@VERSION AS version").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}
