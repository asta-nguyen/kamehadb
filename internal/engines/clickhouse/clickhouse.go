// Package clickhouse ports apps/sidecar/src/adapters/clickhouse.ts on
// clickhouse-go/v2 over the HTTP protocol (same as @clickhouse/client).
// Like the TS adapter it interpolates escaped literals — ClickHouse accepts
// backslash-escaped quotes in single-quoted strings.
package clickhouse

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	defaultHost        = "localhost"
	defaultUser        = "default"
	defaultDatabase    = "default"
	testConnectTimeout = 5 * time.Second
)

func openDB(cp engines.ConnProfile) *sql.DB {
	host := cp.Host
	if host == "" {
		host = defaultHost
	}
	port := cp.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindClickHouse])
	}
	user := cp.Username
	if user == "" {
		user = defaultUser
	}
	database := cp.Database
	if database == "" {
		database = defaultDatabase
	}
	return ch.OpenDB(&ch.Options{
		Protocol: ch.HTTP,
		Addr:     []string{fmt.Sprintf("%s:%d", host, port)},
		Auth: ch.Auth{
			Database: database,
			Username: user,
			Password: cp.Password,
		},
		// Stream native blocks so collection can stop before the full result
		// is buffered server-side. Late driver errors still reject the entire
		// GUI result; a native block may exceed the admission budget transiently.
		Settings: ch.Settings{"wait_end_of_query": 0},
	})
}

// TS escapeId — backslash-escaped backtick, NOT the doubled-backtick style.
func esc(id string) string {
	return "`" + strings.ReplaceAll(id, "`", "\\`") + "`"
}

// TS escapeClickHouseVal — backslash escapes for single-quoted literals.
func escVal(val string) string {
	return "'" + strings.ReplaceAll(strings.ReplaceAll(val, "\\", "\\\\"), "'", "\\'") + "'"
}

type Adapter struct {
	db       *sql.DB
	database string
}

func New(cp engines.ConnProfile) (*Adapter, error) {
	database := cp.Database
	if database == "" {
		database = defaultDatabase
	}
	db := openDB(cp)
	db.SetMaxOpenConns(5)
	return &Adapter{db: db, database: database}, nil
}

func init() {
	engines.RegisterFactory(engines.KindClickHouse, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
		return New(cp)
	})
}

func splitTableID(defaultDB, tableID string) (string, string) {
	parts := strings.Split(tableID, ".")
	if len(parts) > 1 {
		return parts[0], parts[1]
	}
	return defaultDB, tableID
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

// queryMaps scans an active query into map rows, capping at maxRows (0 for unlimited).
// Pre-allocates and reuses the scan pointer buffer across iterations to prevent millions of
// small heap allocations when reading large result sets. (How / Why / What)
func (a *Adapter) queryMaps(ctx context.Context, query string, maxRows int64, budget *engines.ResultBudget) ([]engines.QueryColumn, []map[string]any, bool, error) {
	rows, err := a.db.QueryContext(ctx, query)
	if err != nil {
		return nil, nil, false, err
	}
	defer rows.Close()
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
	return engines.CollectSQLRows(rows, qcols, maxRows, normalizeValue, budget)
}

func (a *Adapter) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	var version string
	if err := a.db.QueryRowContext(ctx, "SELECT version() AS version").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	rows, err := a.db.QueryContext(ctx,
		"SELECT name FROM system.databases WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY name")
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

// ListSchemas — ClickHouse uses databases as schemas.
func (a *Adapter) ListSchemas(ctx context.Context, _ *string) ([]engines.SchemaInfo, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT name FROM system.databases ORDER BY name")
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
	var query string
	if schema != nil && *schema != "" {
		query = `SELECT name, database FROM system.tables WHERE database = ` + escVal(*schema) +
			` AND database NOT IN ('INFORMATION_SCHEMA', 'information_schema', 'system') AND engine NOT IN ('SystemTable', 'SystemLog') ORDER BY name`
	} else {
		// No schema specified — return tables from all non-system databases.
		query = `SELECT name, database FROM system.tables WHERE database NOT IN ('INFORMATION_SCHEMA', 'information_schema', 'system') AND engine NOT IN ('SystemTable', 'SystemLog') ORDER BY database, name`
	}
	rows, err := a.db.QueryContext(ctx, query)
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
	db, table := splitTableID(a.database, tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT name, type, default_kind, default_expression FROM system.columns WHERE database = `+escVal(db)+
			` AND table = `+escVal(table)+` ORDER BY position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.ColumnInfo{}
	for rows.Next() {
		var c engines.ColumnInfo
		var defaultKind string
		var defaultExpr sql.NullString
		if err := rows.Scan(&c.Name, &c.Type, &defaultKind, &defaultExpr); err != nil {
			return nil, err
		}
		c.Nullable = strings.HasPrefix(c.Type, "Nullable(")
		if defaultKind == "DEFAULT" && defaultExpr.Valid {
			s := defaultExpr.String
			c.Default = &s
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetTableIndexes — ClickHouse data-skipping indexes from
// system.data_skipping_indices.
func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	db, table := splitTableID(a.database, tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT name, type, expr, granularity FROM system.data_skipping_indices WHERE database = `+escVal(db)+
			` AND table = `+escVal(table)+` ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.IndexInfo{}
	for rows.Next() {
		var name, typ, expr string
		var granularity int64
		if err := rows.Scan(&name, &typ, &expr, &granularity); err != nil {
			return nil, err
		}
		out = append(out, engines.IndexInfo{
			Name:    name,
			Columns: []string{expr},
			Method:  typ,
		})
	}
	return out, rows.Err()
}

func (a *Adapter) GetTableStats(ctx context.Context, tableID string) (*engines.TableStats, error) {
	db, table := splitTableID(a.database, tableID)
	var rowEstimate, totalBytes int64
	var modTime sql.NullString
	err := a.db.QueryRowContext(ctx,
		`SELECT name, total_rows, total_bytes, metadata_modification_time
		 FROM system.tables
		 WHERE database = `+escVal(db)+` AND name = `+escVal(table)).Scan(
		new(string), &rowEstimate, &totalBytes, &modTime)
	if err != nil {
		return nil, err
	}
	return &engines.TableStats{
		TableID: tableID, Name: table, Schema: db,
		RowEstimate: rowEstimate, TotalBytes: totalBytes, NLiveTup: rowEstimate,
	}, nil
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	db := a.database
	if schema != nil && *schema != "" {
		db = *schema
	}
	rows, err := a.db.QueryContext(ctx,
		`SELECT c.table AS "table", c.name, c.type, c.default_kind, c.default_expression
		 FROM system.columns c
		 JOIN system.tables t ON c.database = t.database AND c.table = t.name
		 WHERE c.database = `+escVal(db)+` AND t.engine NOT IN ('SystemTable', 'SystemLog')
		 ORDER BY c.table, c.position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.TableCompletions{}
	byName := map[string]*engines.TableCompletions{}
	for rows.Next() {
		var tableName, colName, typ, defaultKind string
		var defaultExpr sql.NullString
		if err := rows.Scan(&tableName, &colName, &typ, &defaultKind, &defaultExpr); err != nil {
			return nil, err
		}
		col := engines.ColumnInfo{
			Name: colName, Type: typ,
			Nullable: strings.HasPrefix(typ, "Nullable("),
		}
		if defaultKind == "DEFAULT" && defaultExpr.Valid {
			s := defaultExpr.String
			col.Default = &s
		}
		t, ok := byName[tableName]
		if !ok {
			out = append(out, engines.TableCompletions{Name: tableName, Schema: db})
			t = &out[len(out)-1]
			byName[tableName] = t
		}
		t.Columns = append(t.Columns, col)
	}
	return out, rows.Err()
}

// PreviewRows — no search clause on ClickHouse in the TS adapter either.
func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	start := time.Now()
	db, table := splitTableID(a.database, input.TableID)
	limit, offset, err := engines.PreviewBounds(input)
	if err != nil {
		return nil, err
	}
	// A MergeTree sorting key is not unique. Reject foreign/stale anchors
	// rather than silently ignoring them and restarting an offset window.
	if _, err := engines.UsePreviewCursor(input, nil, offset); err != nil {
		return nil, err
	}
	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	budget := engines.NewResultBudget(parent, cancel, limit, engines.MaxPreviewResultBytes)
	var sb strings.Builder
	sb.WriteString("SELECT * FROM ")
	sb.WriteString(esc(db))
	sb.WriteString(".")
	sb.WriteString(esc(table))

	if input.Search != "" {
		colRows, err := a.db.QueryContext(ctx,
			"SELECT name FROM system.columns WHERE database = ? AND table = ? AND (type LIKE '%String%' OR type LIKE '%FixedString%') ORDER BY position",
			db, table)
		if err != nil {
			// Fail closed: a search must never silently run without its filter.
			return nil, err
		}
		defer colRows.Close()
		var cols []string
		for colRows.Next() {
			var name string
			if err := colRows.Scan(&name); err != nil {
				return nil, err
			}
			if input.SearchColumn != "" && name != input.SearchColumn {
				continue
			}
			cols = append(cols, name)
		}
		if err := colRows.Err(); err != nil {
			return nil, err
		}
		if len(cols) > 0 {
			clauses := make([]string, len(cols))
			fn := "positionCaseInsensitive"
			if input.MatchCase {
				fn = "position"
			}
			searchLit := escVal(input.Search)
			for i, col := range cols {
				clauses[i] = fmt.Sprintf("%s(%s, %s) > 0", fn, esc(col), searchLit)
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
	}
	fmt.Fprintf(&sb, " LIMIT %d OFFSET %d", limit+1, offset)

	qcols, mapRows, truncated, err := a.queryMaps(ctx, sb.String(), limit, budget)
	if err != nil {
		return nil, err
	}
	return budget.Apply(&engines.QueryResult{
		Columns: qcols, Rows: mapRows, RowCount: int64(len(mapRows)),
		DurationMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Truncated:  truncated, PaginationMode: "offset",
	}), nil
}

func (a *Adapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	start := time.Now()
	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	budget := engines.NewResultBudget(parent, cancel, engines.MaxGuiRows, engines.MaxGUIResultBytes)
	qcols, mapRows, truncated, err := a.queryMaps(ctx, input.Query, engines.MaxGuiRows, budget)
	if err != nil {
		return nil, err
	}
	if mapRows == nil {
		mapRows = []map[string]any{}
	}
	return budget.Apply(&engines.QueryResult{
		Columns: qcols, Rows: mapRows, RowCount: int64(len(mapRows)),
		DurationMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Truncated:  truncated,
	}), nil
}

func (a *Adapter) GetDatabaseSizes(ctx context.Context, _ *string) ([]engines.DatabaseSize, error) {
	rows, err := a.db.QueryContext(ctx,
		`SELECT database, name, total_rows, total_bytes
		 FROM system.tables
		 WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
		   AND engine NOT IN ('SystemTable', 'SystemLog')
		 ORDER BY total_bytes DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.DatabaseSize{}
	for rows.Next() {
		var d engines.DatabaseSize
		var rowEst, total sql.NullInt64
		if err := rows.Scan(&d.Schema, &d.Table, &rowEst, &total); err != nil {
			return nil, err
		}
		d.SizeBytes = total.Int64
		d.TotalBytes = total.Int64
		d.RowEstimate = rowEst.Int64
		out = append(out, d)
	}
	return out, rows.Err()
}

func (a *Adapter) Close() error {
	return a.db.Close()
}

// TestClickHouseConnection mirrors testClickHouseConnection.
func TestClickHouseConnection(ctx context.Context, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	db := openDB(cp)
	db.SetMaxOpenConns(1)
	defer db.Close()
	ctx2, cancel := context.WithTimeout(ctx, testConnectTimeout)
	defer cancel()
	var version string
	if err := db.QueryRowContext(ctx2, "SELECT version() AS version").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}
