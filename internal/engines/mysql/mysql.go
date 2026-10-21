// Package mysql ports apps/sidecar/src/adapters/mysql.ts using
// go-sql-driver/mysql. One adapter serves MySQL and MariaDB — the kind only
// changes the MCP session-timeout variable.
package mysql

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	mysqldrv "github.com/go-sql-driver/mysql"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	defaultHost        = "localhost"
	testConnectTimeout = 5 * time.Second
	connectTimeout     = 10 * time.Second // mysql2 default connectTimeout
)

// Reject hints that would lower the server-side execution cap (TS
// rejectsTimeoutWeakeningHint).
var timeoutWeakenRe = regexp.MustCompile(`(?i)set_var\s*\(\s*max_execution_time\s*=`)

// driverConfig keeps TLS scoped to this connection instead of a process-wide driver registration.
func driverConfig(cp engines.ConnProfile) (*mysqldrv.Config, error) {
	host := cp.Host
	if host == "" {
		host = defaultHost
	}
	port := cp.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindMySQL])
	}
	cfg := mysqldrv.NewConfig()
	cfg.User = cp.Username
	cfg.Passwd = cp.Password
	cfg.Net = "tcp"
	cfg.Addr = fmt.Sprintf("%s:%d", host, port)
	cfg.DBName = cp.Database
	cfg.Timeout = connectTimeout
	cfg.ParseTime = true
	if cp.SSL {
		tlsConfig, err := engines.TLSConfig(cp, host)
		if err != nil {
			return nil, err
		}
		cfg.TLS = tlsConfig
	}
	return cfg, nil
}

// Adapter is the database/sql-backed SqlAdapter for MySQL and MariaDB. MCP
// adapters get their statement deadline from the connection itself (openDB).
type Adapter struct {
	db           *sql.DB
	database     string
	isMariaDB    bool
	previewScope string
}

// New mirrors createMysqlAdapter's validation.
func New(cp engines.ConnProfile) (*Adapter, error) {
	return NewWithTimeout(cp, 0)
}

func NewWithTimeout(cp engines.ConnProfile, timeoutMs int64) (*Adapter, error) {
	if cp.Database == "" {
		return nil, errors.New("Database name is required")
	}
	if cp.Username == "" {
		return nil, errors.New("Username is required")
	}
	if !cp.HasPassword && cp.Password == "" {
		return nil, errors.New("Password is required")
	}
	db, err := openDB(cp, timeoutMs)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	return &Adapter{db: db, database: cp.Database, isMariaDB: cp.Kind == engines.KindMariaDB, previewScope: engines.NewPreviewScope(cp.Kind)}, nil
}

func init() {
	for _, kind := range []string{engines.KindMySQL, engines.KindMariaDB} {
		kind := kind
		engines.RegisterFactory(kind, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
			return New(cp)
		})
	}
}

// sessionTimeoutStatement returns the SET that applies the MCP per-statement
// deadline: max_execution_time (ms) on MySQL, max_statement_time (seconds,
// rounded up to at least 1) on MariaDB. Empty when no deadline is configured.
func sessionTimeoutStatement(isMariaDB bool, timeoutMs int64) string {
	if timeoutMs <= 0 {
		return ""
	}
	if isMariaDB {
		seconds := (timeoutMs + 999) / 1000
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Sprintf("SET SESSION max_statement_time = %d", seconds)
	}
	return fmt.Sprintf("SET SESSION max_execution_time = %d", timeoutMs)
}

// sessionInitConnector runs one SET statement on every new physical connection.
// The deadline is a session variable, so setting it at connect time replaces a
// per-call dedicated connection: that pattern had to close the connection while
// the caller still held its open rows, which blocks until the rows are closed.
type sessionInitConnector struct {
	driver.Connector
	statement string
}

func (c sessionInitConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	// A server that rejects the variable must fail loudly; running without the
	// deadline would silently drop the MCP read limit.
	execer, ok := conn.(driver.ExecerContext)
	if ok {
		_, err = execer.ExecContext(ctx, c.statement, nil)
	}
	if !ok || err != nil {
		conn.Close()
		return nil, errors.New("MySQL or MariaDB rejected the native query timeout setting")
	}
	return conn, nil
}

// openDB opens the pool for a profile. With a deadline configured (MCP only) it
// goes through the connector so every connection starts with the deadline set.
func openDB(cp engines.ConnProfile, timeoutMs int64) (*sql.DB, error) {
	statement := sessionTimeoutStatement(cp.Kind == engines.KindMariaDB, timeoutMs)
	cfg, err := driverConfig(cp)
	if err != nil {
		return nil, err
	}
	connector, err := mysqldrv.NewConnector(cfg)
	if err != nil {
		return nil, err
	}
	dbConnector := connector
	if statement != "" {
		dbConnector = sessionInitConnector{Connector: connector, statement: statement}
	}
	return sql.OpenDB(dbConnector), nil
}

// OpenDB opens a MySQL or MariaDB pool using the profile's TLS settings.
func OpenDB(cp engines.ConnProfile) (*sql.DB, error) {
	return openDB(cp, 0)
}

func (a *Adapter) queryRows(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return a.db.QueryContext(ctx, query, args...)
}

// rowsToMaps scans an active sql.Rows cursor into map rows, capping at maxRows (0 for unlimited).
// Pre-allocates and reuses the scan pointer buffer across iterations to prevent millions of
// small heap allocations when reading large result sets. (How / Why / What)
func rowsToMaps(rows *sql.Rows, maxRows int64, budget *engines.ResultBudget) ([]engines.QueryColumn, []map[string]any, bool, error) {
	cols, err := rows.ColumnTypes()
	if err != nil {
		return nil, nil, false, err
	}
	names, err := rows.Columns()
	if err != nil {
		return nil, nil, false, err
	}
	qcols := make([]engines.QueryColumn, len(cols))
	for i, c := range cols {
		nullable, _ := c.Nullable()
		qcols[i] = engines.QueryColumn{Name: names[i], Type: c.DatabaseTypeName(), Nullable: &nullable}
	}
	return engines.CollectSQLRows(rows, qcols, maxRows, normalizeValue, budget)
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

// splitTableID mirrors TS tableId.split('.'): parts[0]/parts[1], extras
// dropped.
func splitTableID(defaultSchema, tableID string) (string, string) {
	parts := strings.Split(tableID, ".")
	if len(parts) > 1 {
		return parts[0], parts[1]
	}
	return defaultSchema, tableID
}

func (a *Adapter) esc(id string) string {
	return engines.QuoteIdentifier(engines.KindMySQL, id)
}

func (a *Adapter) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	rows, err := a.queryRows(ctx, "SELECT VERSION() AS version")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	version := ""
	if rows.Next() {
		_ = rows.Scan(&version)
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	rows, err := a.queryRows(ctx, "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY name")
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

func (a *Adapter) ListSchemas(ctx context.Context, database *string) ([]engines.SchemaInfo, error) {
	dbs, err := a.ListDatabases(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]engines.SchemaInfo, len(dbs))
	for i, d := range dbs {
		out[i].Name = d.Name
	}
	return out, nil
}

func (a *Adapter) ListTables(ctx context.Context, schema *string) ([]engines.TableInfo, error) {
	db := a.database
	if schema != nil {
		db = *schema
	}
	rows, err := a.queryRows(ctx,
		"SELECT TABLE_NAME AS name, TABLE_SCHEMA AS schema_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
		db)
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
	schema, table := splitTableID(a.database, tableID)
	rows, err := a.queryRows(ctx,
		`SELECT
		  c.COLUMN_NAME AS name,
		  c.COLUMN_TYPE AS type,
		  c.IS_NULLABLE AS nullable,
		  c.COLUMN_DEFAULT AS `+"`default`"+`,
		  IF(c.COLUMN_KEY = 'PRI', TRUE, FALSE) AS primary_key,
		  ku.REFERENCED_TABLE_NAME AS ref_table,
		  ku.REFERENCED_COLUMN_NAME AS ref_column
		FROM INFORMATION_SCHEMA.COLUMNS c
		LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
		  ON c.TABLE_SCHEMA = ku.TABLE_SCHEMA AND c.TABLE_NAME = ku.TABLE_NAME AND c.COLUMN_NAME = ku.COLUMN_NAME
		  AND ku.REFERENCED_TABLE_NAME IS NOT NULL
		WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
		ORDER BY c.ORDINAL_POSITION`,
		schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.ColumnInfo{}
	for rows.Next() {
		var c engines.ColumnInfo
		var nullable string
		var def sql.NullString
		var refTable, refCol sql.NullString
		if err := rows.Scan(&c.Name, &c.Type, &nullable, &def, &c.PrimaryKey, &refTable, &refCol); err != nil {
			return nil, err
		}
		c.Nullable = nullable == "YES"
		if def.Valid {
			s := def.String
			c.Default = &s
		}
		if refTable.Valid {
			c.ForeignKey = &engines.ColumnForeignKey{Table: refTable.String, Column: refCol.String}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	db := a.database
	if schema != nil {
		db = *schema
	}
	if db == "" {
		return []engines.TableCompletions{}, nil
	}
	rows, err := a.queryRows(ctx,
		`SELECT
		  c.TABLE_NAME AS table_name,
		  c.COLUMN_NAME AS column_name,
		  c.COLUMN_TYPE AS type,
		  c.IS_NULLABLE AS nullable,
		  c.COLUMN_DEFAULT AS `+"`default`"+`,
		  IF(c.COLUMN_KEY = 'PRI', TRUE, FALSE) AS primary_key,
		  ku.REFERENCED_TABLE_NAME AS ref_table,
		  ku.REFERENCED_COLUMN_NAME AS ref_column
		FROM INFORMATION_SCHEMA.COLUMNS c
		LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
		  ON c.TABLE_SCHEMA = ku.TABLE_SCHEMA
		  AND c.TABLE_NAME = ku.TABLE_NAME
		  AND c.COLUMN_NAME = ku.COLUMN_NAME
		  AND ku.REFERENCED_TABLE_NAME IS NOT NULL
		WHERE c.TABLE_SCHEMA = ?
		  AND c.TABLE_NAME IN (
		    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
		    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
		  )
		ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
		db, db)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.TableCompletions{}
	byName := map[string]*engines.TableCompletions{}
	for rows.Next() {
		var tableName string
		var col engines.ColumnInfo
		var nullable string
		var def sql.NullString
		var refTable, refCol sql.NullString
		if err := rows.Scan(&tableName, &col.Name, &col.Type, &nullable, &def, &col.PrimaryKey, &refTable, &refCol); err != nil {
			return nil, err
		}
		col.Nullable = nullable == "YES"
		if def.Valid {
			s := def.String
			col.Default = &s
		}
		if refTable.Valid {
			col.ForeignKey = &engines.ColumnForeignKey{Table: refTable.String, Column: refCol.String}
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

func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	schema, table := splitTableID(a.database, tableID)
	rows, err := a.queryRows(ctx,
		`SELECT INDEX_NAME AS Key_name, COLUMN_NAME AS Column_name, NON_UNIQUE AS Non_unique
		 FROM INFORMATION_SCHEMA.STATISTICS
		 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		 ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
		schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.IndexInfo{}
	byName := map[string]*engines.IndexInfo{}
	for rows.Next() {
		var name, col string
		var nonUnique bool
		if err := rows.Scan(&name, &col, &nonUnique); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			out = append(out, engines.IndexInfo{Name: name, Unique: !nonUnique, Primary: name == "PRIMARY"})
			idx = &out[len(out)-1]
			byName[name] = idx
		}
		idx.Columns = append(idx.Columns, col)
	}
	return out, rows.Err()
}

// Direct calls obtain metadata once; service calls reuse its existing TTL cache.
func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	columns, err := a.GetTableColumns(ctx, input.TableID)
	if err != nil {
		return nil, err
	}
	return a.PreviewRowsWithColumns(ctx, input, columns)
}

// Keep native collation/order and bind exact signed/unsigned anchors. Search OR
// terms are grouped so the seek predicate applies to every matching column.
func (a *Adapter) PreviewRowsWithColumns(ctx context.Context, input engines.PreviewRowsInput, columns []engines.ColumnInfo) (*engines.QueryResult, error) {
	input = engines.ScopePreview(input, a.previewScope)
	start := time.Now()
	schema, table := splitTableID(a.database, input.TableID)
	limit, offset, err := engines.PreviewBounds(input)
	if err != nil {
		return nil, err
	}
	kind := engines.KindMySQL
	if a.isMariaDB {
		kind = engines.KindMariaDB
	}
	key := engines.PreviewPrimaryKey(kind, columns)
	seek, err := engines.UsePreviewCursor(input, key, offset)
	if err != nil {
		return nil, err
	}
	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	budget := engines.NewResultBudget(parent, cancel, limit, engines.MaxPreviewResultBytes)
	order := input.SortColumn
	if order == "" && key != nil {
		order = key.Name
	}

	// For deep offset pagination with a single primary key and no full-table text search,
	// use a deferred join (late row lookup). The subquery scans only the primary key index
	// to skip the offset pages without deserializing full table row data from disk, then
	// joins back to retrieve complete columns only for the selected page rows. (How / Why / What)
	useDeferredJoin := !seek && offset > 0 && key != nil && input.Search == ""

	var sb strings.Builder
	var params []any

	if useDeferredJoin {
		tbl := a.esc(schema) + "." + a.esc(table)
		innerOrder := engines.PreviewOrderBy(columns, order, input.SortDirection, a.esc)
		outerOrder := engines.PreviewOrderBy(columns, order, input.SortDirection, func(name string) string {
			return "_kameha_t." + a.esc(name)
		})

		sb.WriteString("SELECT _kameha_t.* FROM " + tbl + " AS _kameha_t INNER JOIN (SELECT " + a.esc(key.Name) + " AS _kameha_pk FROM " + tbl)
		if innerOrder != "" {
			sb.WriteString(" ORDER BY " + innerOrder)
		}
		sb.WriteString(" LIMIT ? OFFSET ?) AS _kameha_sub ON _kameha_t." + a.esc(key.Name) + " = _kameha_sub._kameha_pk")
		if outerOrder != "" {
			sb.WriteString(" ORDER BY " + outerOrder)
		}
		params = append(params, limit+1, offset)
	} else {
		sb.WriteString("SELECT * FROM " + a.esc(schema) + "." + a.esc(table))
		if input.Search != "" {
			var clauses []string
			for _, col := range columns {
				if input.SearchColumn != "" && col.Name != input.SearchColumn {
					continue
				}
				clause := a.esc(col.Name) + " LIKE ?"
				if input.MatchCase {
					clause = "BINARY " + clause
				}
				clauses = append(clauses, clause)
				params = append(params, "%"+input.Search+"%")
			}
			if len(clauses) > 0 {
				sb.WriteString(" WHERE (" + strings.Join(clauses, " OR ") + ")")
			} else {
				sb.WriteString(" WHERE 1 = 0")
			}
		}
		if seek && input.Cursor != "" {
			value, err := engines.DecodePreviewCursor(input, *key)
			if err != nil {
				return nil, err
			}
			if input.Search != "" {
				sb.WriteString(" AND ")
			} else {
				sb.WriteString(" WHERE ")
			}
			sb.WriteString(a.esc(key.Name))
			if input.SortDirection == "desc" {
				sb.WriteString(" < ?")
			} else {
				sb.WriteString(" > ?")
			}
			params = append(params, value)
		}
		// The key follows the sort column so OFFSET pages stay exact when values tie.
		if orderBy := engines.PreviewOrderBy(columns, order, input.SortDirection, a.esc); orderBy != "" {
			sb.WriteString(" ORDER BY " + orderBy)
		}
		sb.WriteString(" LIMIT ?")
		params = append(params, limit+1)
		if !seek {
			sb.WriteString(" OFFSET ?")
			params = append(params, offset)
		}
	}
	rows, err := a.db.QueryContext(ctx, sb.String(), params...)
	if err != nil {
		return nil, err
	}
	qcols, mapRows, truncated, err := rowsToMaps(rows, limit, budget)
	rows.Close()
	if err != nil {
		return nil, err
	}
	result := budget.Apply(&engines.QueryResult{
		Columns: qcols, Rows: mapRows, RowCount: int64(len(mapRows)),
		DurationMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Truncated:  truncated,
	})
	return engines.FinishPreview(result, input, key, seek), nil
}

func (a *Adapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	start := time.Now()
	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	budget := engines.NewResultBudget(parent, cancel, engines.MaxGuiRows, engines.MaxGUIResultBytes)
	rows, err := a.queryRows(ctx, input.Query, input.Params...)
	if err != nil {
		return nil, err
	}
	qcols, mapRows, truncated, err := rowsToMaps(rows, engines.MaxGuiRows, budget)
	rows.Close()
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

// RunQueryBounded is the MCP-only bounded read: stops after maxRows+1 rows so
// a large result is never buffered whole. Go drivers honour ctx cancel, so
// the pooled conn is released rather than destroyed.
func (a *Adapter) RunQueryBounded(ctx context.Context, input engines.BoundedQueryInput) (*engines.BoundedQueryResult, error) {
	start := time.Now()
	rowLimit := input.MaxRows
	if rowLimit < 1 {
		rowLimit = 1
	}
	if timeoutWeakenRe.MatchString(input.Query) {
		return nil, errors.New("SET_VAR(max_execution_time=...) hints are not allowed in MCP queries")
	}
	rows, err := a.queryRows(ctx, input.Query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	qcols := make([]engines.QueryColumn, len(names))
	for i, n := range names {
		qcols[i] = engines.QueryColumn{Name: n, Type: "unknown"}
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
		DurationMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Truncated:  truncated,
	}, rows.Err()
}

var _ engines.BoundedReader = (*Adapter)(nil)

func (a *Adapter) GetActiveConnections(ctx context.Context) ([]engines.ConnectionInfo, error) {
	rows, err := a.db.QueryContext(ctx,
		`SELECT
		  ID AS pid,
		  USER AS usename,
		  'mysql' AS applicationName,
		  HOST AS clientAddr,
		  COMMAND AS state,
		  INFO AS query,
		  TIME AS durationSeconds
		FROM information_schema.PROCESSLIST
		WHERE DB = ? AND ID != CONNECTION_ID()
		ORDER BY TIME`,
		a.database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// PROCESSLIST does not expose when each connection started; use the
	// current inspection time as an approximation for backendStart.
	inspectedAt := time.Now().UTC().Format(time.RFC3339)
	out := []engines.ConnectionInfo{}
	for rows.Next() {
		var c engines.ConnectionInfo
		var clientAddr, query sql.NullString
		if err := rows.Scan(&c.PID, &c.Usename, &c.ApplicationName, &clientAddr, &c.State, &query, &c.DurationSeconds); err != nil {
			return nil, err
		}
		if clientAddr.Valid {
			s := clientAddr.String
			c.ClientAddr = &s
		}
		if query.Valid {
			s := query.String
			c.Query = &s
		}
		c.BackendStart = inspectedAt
		out = append(out, c)
	}
	return out, rows.Err()
}

func (a *Adapter) SearchSchema(ctx context.Context, input engines.SchemaSearchInput) ([]engines.SchemaSearchMatch, error) {
	term := "%" + input.Query + "%"
	db := a.database
	if input.Schema != "" {
		db = input.Schema
	}
	limit := 50
	if input.Limit != nil {
		limit = *input.Limit
	}
	rows, err := a.db.QueryContext(ctx,
		`SELECT TABLE_SCHEMA, TABLE_NAME, NULL AS COLUMN_NAME, NULL AS COLUMN_TYPE, 'table' AS MATCH_TYPE
		 FROM INFORMATION_SCHEMA.TABLES
		 WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE ?
		 UNION ALL
		 SELECT c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.COLUMN_TYPE, 'column' AS MATCH_TYPE
		 FROM INFORMATION_SCHEMA.COLUMNS c
		 WHERE c.TABLE_SCHEMA = ? AND c.COLUMN_NAME LIKE ?
		 ORDER BY MATCH_TYPE, TABLE_NAME, COLUMN_NAME
		 LIMIT ?`,
		db, term, db, term, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.SchemaSearchMatch{}
	for rows.Next() {
		var m engines.SchemaSearchMatch
		var colName, colType sql.NullString
		if err := rows.Scan(&m.Schema, &m.Table, &colName, &colType, &m.MatchType); err != nil {
			return nil, err
		}
		if colName.Valid {
			m.Column = colName.String
		}
		if colType.Valid {
			m.ColumnType = colType.String
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (a *Adapter) GetTableStats(ctx context.Context, tableID string) (*engines.TableStats, error) {
	schema, table := splitTableID(a.database, tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT
		  (SELECT COUNT(*) FROM `+a.esc(schema)+`.`+a.esc(table)+`) AS row_count,
		  COALESCE(t.data_length + t.index_length, 0) AS total_bytes,
		  COALESCE(t.data_length, 0) AS data_bytes,
		  COALESCE(t.index_length, 0) AS index_bytes
		FROM information_schema.TABLES t
		WHERE t.table_schema = ? AND t.table_name = ?`,
		schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := &engines.TableStats{TableID: tableID, Name: table, Schema: schema}
	if rows.Next() {
		var rowCount, total, data, index int64
		if err := rows.Scan(&rowCount, &total, &data, &index); err != nil {
			return nil, err
		}
		stats.RowEstimate = rowCount
		stats.TotalBytes = total
		stats.IndexesBytes = index
		stats.NLiveTup = rowCount
	}
	return stats, rows.Err()
}

func (a *Adapter) GetIndexStats(ctx context.Context, tableID string) ([]engines.IndexStats, error) {
	schema, table := splitTableID(a.database, tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT
		  INDEX_NAME AS name,
		  COLUMN_NAME AS column_name,
		  NON_UNIQUE AS non_unique,
		  SEQ_IN_INDEX AS seq
		FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
		schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.IndexStats{}
	byName := map[string]*engines.IndexStats{}
	for rows.Next() {
		var name, col string
		var nonUnique bool
		var seq int
		if err := rows.Scan(&name, &col, &nonUnique, &seq); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			out = append(out, engines.IndexStats{Name: name, Table: tableID, Unique: !nonUnique, Primary: name == "PRIMARY"})
			idx = &out[len(out)-1]
			byName[name] = idx
		}
		idx.Columns = append(idx.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Enrich with index scan stats from performance_schema when enabled and permitted.
	// We run this as a best-effort query; if performance_schema is disabled or inaccessible,
	// we silently proceed so index metadata remains available. (How / Why / What)
	pRows, pErr := a.db.QueryContext(ctx,
		`SELECT
		  INDEX_NAME,
		  COUNT_STAR,
		  COUNT_READ
		FROM performance_schema.table_io_waits_summary_by_index_usage
		WHERE OBJECT_SCHEMA = ? AND OBJECT_NAME = ? AND INDEX_NAME IS NOT NULL`,
		schema, table)
	if pErr == nil {
		defer pRows.Close()
		var totalScans int64
		for pRows.Next() {
			var idxName string
			var countStar, countRead int64
			if err := pRows.Scan(&idxName, &countStar, &countRead); err == nil {
				if idx, ok := byName[idxName]; ok {
					idx.Scans = countStar
					idx.Reads = countRead
					totalScans += countStar
				}
			}
		}
		if totalScans > 0 {
			for i := range out {
				out[i].UsagePercent = (float64(out[i].Scans) / float64(totalScans)) * 100.0
			}
		}
	}

	// In MySQL/InnoDB, per-index physical byte sizes are tracked in mysql.innodb_index_stats.
	// We query it best-effort; if inaccessible or absent, we fall back to information_schema.TABLES
	// so the primary clustered index size reflects the table's DATA_LENGTH. (How / Why / What)
	sRows, sErr := a.db.QueryContext(ctx,
		`SELECT index_name, stat_value * @@innodb_page_size
		FROM mysql.innodb_index_stats
		WHERE database_name = ? AND table_name = ? AND stat_name = 'size'`,
		schema, table)
	hasInnoDBIndexSizes := false
	if sErr == nil {
		defer sRows.Close()
		for sRows.Next() {
			var idxName string
			var sizeBytes int64
			if err := sRows.Scan(&idxName, &sizeBytes); err == nil {
				if idx, ok := byName[idxName]; ok {
					idx.SizeBytes = sizeBytes
					hasInnoDBIndexSizes = true
				}
			}
		}
	}
	if !hasInnoDBIndexSizes {
		var dataLength, indexLength sql.NullInt64
		if err := a.db.QueryRowContext(ctx,
			`SELECT DATA_LENGTH, INDEX_LENGTH
			FROM information_schema.TABLES
			WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
			schema, table).Scan(&dataLength, &indexLength); err == nil {
			if pk, ok := byName["PRIMARY"]; ok && dataLength.Valid {
				pk.SizeBytes = dataLength.Int64
			}
			// If there is exactly one secondary index, its size equals INDEX_LENGTH.
			if len(out) == 2 && indexLength.Valid {
				for i := range out {
					if !out[i].Primary {
						out[i].SizeBytes = indexLength.Int64
					}
				}
			}
		}
	}

	return out, nil
}

func (a *Adapter) GetDatabaseSizes(ctx context.Context, schema *string) ([]engines.DatabaseSize, error) {
	db := a.database
	rows, err := a.db.QueryContext(ctx,
		`SELECT
		  TABLE_NAME AS table_name,
		  TABLE_ROWS AS row_estimate,
		  DATA_LENGTH + INDEX_LENGTH AS total_bytes,
		  INDEX_LENGTH AS index_bytes
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
		ORDER BY total_bytes DESC`,
		db)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.DatabaseSize{}
	for rows.Next() {
		var d engines.DatabaseSize
		var rowEst, total, index sql.NullInt64
		if err := rows.Scan(&d.Table, &rowEst, &total, &index); err != nil {
			return nil, err
		}
		d.Schema = db
		d.SizeBytes = total.Int64
		d.IndexBytes = index.Int64
		d.TotalBytes = total.Int64
		d.RowEstimate = rowEst.Int64
		out = append(out, d)
	}
	return out, rows.Err()
}

func (a *Adapter) Close() error {
	return a.db.Close()
}

// TestMysqlConnection mirrors testMysqlConnection — fresh limit-1 pool,
// SELECT VERSION(), discard.
func TestMysqlConnection(ctx context.Context, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	db, err := openDB(cp, 0)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	ctx2, cancel := context.WithTimeout(ctx, testConnectTimeout)
	defer cancel()
	var version string
	if err := db.QueryRowContext(ctx2, "SELECT VERSION() AS version").Scan(&version); err != nil {
		return nil, classifyConnectError(err)
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func classifyConnectError(err error) error {
	var myErr *mysqldrv.MySQLError
	if errors.As(err, &myErr) {
		switch myErr.Number {
		case 1045: // ER_ACCESS_DENIED_ERROR
			return errors.New("Authentication failed. Check username and password.")
		case 1049: // ER_BAD_DB_ERROR
			return errors.New("Database does not exist on the server.")
		case 1044: // ER_DBACCESS_DENIED_ERROR
			return errors.New("No permission to access that database.")
		}
	}
	return err
}
