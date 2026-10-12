// Package mysql ports apps/sidecar/src/adapters/mysql.ts using
// go-sql-driver/mysql. One adapter serves MySQL and MariaDB — the kind only
// changes the MCP session-timeout variable.
package mysql

import (
	"context"
	"database/sql"
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

// DSN builds the go-sql-driver DSN for a connect profile — exported so the
// MCP provisioner can open one-off admin connections through the same
// format instead of duplicating it.
func DSN(cp engines.ConnProfile) string { return dsn(cp) }

func dsn(cp engines.ConnProfile) string {
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
		cfg.TLSConfig = "skip-verify"
	}
	return cfg.FormatDSN()
}

// Adapter is the database/sql-backed SqlAdapter for MySQL and MariaDB.
// timeoutMs mirrors McpAdapterTimeoutOptions (MCP adapters only).
type Adapter struct {
	db        *sql.DB
	database  string
	isMariaDB bool
	timeoutMs int64
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
	db, err := sql.Open("mysql", dsn(cp))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	return &Adapter{db: db, database: cp.Database, isMariaDB: cp.Kind == engines.KindMariaDB, timeoutMs: timeoutMs}, nil
}

func init() {
	for _, kind := range []string{engines.KindMySQL, engines.KindMariaDB} {
		kind := kind
		engines.RegisterFactory(kind, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
			return New(cp)
		})
	}
}

// applyMcpTimeout sets the per-session statement deadline before an MCP call:
// max_execution_time (ms) on MySQL, max_statement_time (s) on MariaDB.
func (a *Adapter) applyMcpTimeout(ctx context.Context, conn *sql.Conn) error {
	if a.timeoutMs <= 0 {
		return nil
	}
	v := a.timeoutMs
	variable := "max_execution_time"
	if a.isMariaDB {
		variable = "max_statement_time"
		v = (a.timeoutMs + 999) / 1000
		if v < 1 {
			v = 1
		}
	}
	if _, err := conn.ExecContext(ctx, fmt.Sprintf("SET SESSION %s = %d", variable, v)); err != nil {
		return errors.New("MySQL or MariaDB rejected the native query timeout setting")
	}
	return nil
}

func (a *Adapter) queryRows(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if a.timeoutMs <= 0 {
		return a.db.QueryContext(ctx, query, args...)
	}
	conn, err := a.db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if err := a.applyMcpTimeout(ctx, conn); err != nil {
		return nil, err
	}
	return conn.QueryContext(ctx, query, args...)
}

// rowsToMaps scans an active sql.Rows cursor into map rows, capping at maxRows (0 for unlimited).
// Pre-allocates and reuses the scan pointer buffer across iterations to prevent millions of
// small heap allocations when reading large result sets. (How / Why / What)
func rowsToMaps(rows *sql.Rows, maxRows int64) ([]engines.QueryColumn, []map[string]any, bool, error) {
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
	out := make([]map[string]any, 0, 64)
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
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
		m := make(map[string]any, len(cols))
		for i, name := range names {
			m[name] = normalizeValue(vals[i])
		}
		out = append(out, m)
	}
	return qcols, out, truncated, rows.Err()
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
		rows.Scan(&version)
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

func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	schema, table := splitTableID(a.database, input.TableID)
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
	sb.WriteString(a.esc(schema))
	sb.WriteString(".")
	sb.WriteString(a.esc(table))

	if input.Search != "" {
		colRows, err := a.queryRows(ctx,
			"SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
			schema, table)
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
					clauses[i] = "BINARY " + a.esc(col) + " LIKE ?"
				} else {
					clauses[i] = a.esc(col) + " LIKE ?"
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
		sb.WriteString(a.esc(input.SortColumn))
		if input.SortDirection == "desc" {
			sb.WriteString(" DESC")
		} else {
			sb.WriteString(" ASC")
		}
	}
	fmt.Fprintf(&sb, " LIMIT %d OFFSET %d", limit, offset)

	start := time.Now()
	rows, err := a.db.QueryContext(ctx, sb.String(), params...)
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
	start := time.Now()
	rows, err := a.queryRows(ctx, input.Query, input.Params...)
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
		DurationMs: float64(time.Since(start).Milliseconds()),
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
	return out, rows.Err()
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
	db, err := sql.Open("mysql", dsn(cp))
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
