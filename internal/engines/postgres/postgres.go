// Package postgres ports apps/sidecar/src/adapters/postgres.ts onto pgx/v5.
package postgres

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	defaultHost        = "localhost"
	maxConns           = 5
	connectTimeout     = 10 * time.Second
	idleTimeout        = 30 * time.Second
	testConnectTimeout = 5 * time.Second
	// MCPQueryTimeoutMS mirrors MCP_QUERY_TIMEOUT_MS in sidecar constants.
	MCPQueryTimeoutMS = 30_000
)

// ErrTimeoutUnavailable mirrors McpTimeoutUnavailableError: the server
// refused SET statement_timeout, so a bounded read would run unbounded.
var ErrTimeoutUnavailable = errors.New("PostgreSQL rejected the native statement timeout setting")

var pgTypeNames = map[uint32]string{
	16:   "boolean",
	20:   "bigint",
	21:   "smallint",
	23:   "integer",
	25:   "text",
	700:  "real",
	701:  "double",
	1043: "varchar",
	1082: "date",
	1114: "timestamp",
	1184: "timestamptz",
	1700: "numeric",
}

func pgTypeName(oid uint32) string {
	if name, ok := pgTypeNames[oid]; ok {
		return name
	}
	return "unknown"
}

// splitTableID takes the first two dot-separated parts, like TS split('.').
func splitTableID(tableID string) (schema, table string) {
	parts := strings.Split(tableID, ".")
	if len(parts) > 0 {
		schema = parts[0]
	}
	if len(parts) > 1 {
		table = parts[1]
	}
	return schema, table
}

func init() {
	engines.RegisterFactory(engines.KindPostgres, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
		return New(cp)
	})
}

// Adapter is the pgx-backed SqlAdapter. timeoutMs applies the native
// statement deadline per acquired connection (MCP adapters only).
type Adapter struct {
	pool      *pgxpool.Pool
	timeoutMs int64
}

func New(cp engines.ConnProfile) (*Adapter, error) { return newAdapter(cp, 0) }

// NewNotifyConn opens a dedicated pgx.Conn for the schema watcher's
// LISTEN loop — like the sidecar's pg.Client, it lives outside the pool.
func NewNotifyConn(ctx context.Context, cp engines.ConnProfile) (*pgx.Conn, error) {
	cfg, err := pgx.ParseConfig("")
	if err != nil {
		return nil, err
	}
	host := cp.Host
	if host == "" {
		host = defaultHost
	}
	port := cp.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindPostgres])
	}
	cfg.Host = host
	cfg.Port = uint16(port)
	cfg.Database = cp.Database
	cfg.User = cp.Username
	cfg.Password = cp.Password
	cfg.ConnectTimeout = connectTimeout
	if cp.SSL {
		cfg.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}
	return pgx.ConnectConfig(ctx, cfg)
}

// NewWithTimeout is the MCP constructor: every statement gets a native
// statement_timeout applied on the connection it runs on.
func NewWithTimeout(cp engines.ConnProfile, timeoutMs int64) (*Adapter, error) {
	return newAdapter(cp, timeoutMs)
}

func newAdapter(cp engines.ConnProfile, timeoutMs int64) (*Adapter, error) {
	if cp.Database == "" {
		return nil, errors.New("Database name is required")
	}
	if cp.Username == "" {
		return nil, errors.New("Username is required")
	}
	if !cp.HasPassword {
		return nil, errors.New("Password is required")
	}
	host := cp.Host
	if host == "" {
		host = defaultHost
	}
	port := cp.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindPostgres])
	}
	cfg, err := pgxpool.ParseConfig("")
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.Host = host
	cfg.ConnConfig.Port = uint16(port)
	cfg.ConnConfig.Database = cp.Database
	cfg.ConnConfig.User = cp.Username
	cfg.ConnConfig.Password = cp.Password
	cfg.ConnConfig.ConnectTimeout = connectTimeout
	if cp.SSL {
		cfg.ConnConfig.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}
	cfg.MaxConns = maxConns
	cfg.MaxConnIdleTime = idleTimeout
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, err
	}
	return &Adapter{pool: pool, timeoutMs: timeoutMs}, nil
}

// collected is a fully-materialized result: field descriptions plus rows in
// array form (duplicates preserved; map rows are derived per caller).
type collected struct {
	fields []pgconn.FieldDescription
	rows   [][]any
}

// collect acquires a connection (applying the MCP timeout when set), reads
// up to maxRows (0 = all), and releases — a cursor-bounded read like
// pg-cursor's read(count) + close.
func (a *Adapter) collect(ctx context.Context, sql string, args []any, maxRows int64) (*collected, error) {
	var rows pgx.Rows
	var conn *pgxpool.Conn
	var err error
	if a.timeoutMs > 0 {
		conn, err = a.pool.Acquire(ctx)
		if err != nil {
			return nil, err
		}
		if _, err = conn.Exec(ctx, fmt.Sprintf("SET statement_timeout = %d", a.timeoutMs)); err != nil {
			conn.Release()
			return nil, ErrTimeoutUnavailable
		}
		rows, err = conn.Query(ctx, sql, args...)
	} else {
		rows, err = a.pool.Query(ctx, sql, args...)
	}
	if err != nil {
		if conn != nil {
			conn.Release()
		}
		return nil, err
	}
	defer func() {
		rows.Close()
		if conn != nil {
			conn.Release()
		}
	}()

	fields := rows.FieldDescriptions()
	out := &collected{fields: fields}
	for rows.Next() {
		if maxRows > 0 && int64(len(out.rows)) >= maxRows {
			break
		}
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		for i, v := range vals {
			if i < len(fields) {
				vals[i] = normalizeValue(&fields[i], v)
			}
		}
		out.rows = append(out.rows, vals)
	}
	return out, rows.Err()
}

// normalizeValue maps pgx-decoded values to the JSON shapes node-pg produced:
// numeric → string, timestamps → RFC3339, uuid → canonical text, json → parsed.
func normalizeValue(f *pgconn.FieldDescription, v any) any {
	if v == nil {
		return nil
	}
	if f != nil && (f.DataTypeOID == 114 || f.DataTypeOID == 3802) {
		var b []byte
		switch j := v.(type) {
		case []byte:
			b = j
		case string:
			b = []byte(j)
		}
		if b != nil {
			var parsed any
			if json.Unmarshal(b, &parsed) == nil {
				return parsed
			}
		}
	}
	switch t := v.(type) {
	case time.Time:
		return t.Format(time.RFC3339Nano)
	case pgtype.Numeric:
		if dv, err := t.Value(); err == nil {
			return dv
		}
	case pgtype.UUID:
		if t.Valid {
			return uuidString(t.Bytes)
		}
		return nil
	case [16]byte:
		return uuidString(t)
	}
	return v
}

func uuidString(b [16]byte) string {
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func queryColumns(fields []pgconn.FieldDescription) []engines.QueryColumn {
	cols := make([]engines.QueryColumn, len(fields))
	for i, f := range fields {
		cols[i] = engines.QueryColumn{Name: f.Name, Type: pgTypeName(f.DataTypeOID)}
	}
	return cols
}

// rowsToMaps collapses duplicate column names to the last value, matching
// node-pg's default object row mode.
func rowsToMaps(c *collected) []map[string]any {
	out := make([]map[string]any, len(c.rows))
	for i, r := range c.rows {
		m := make(map[string]any, len(r))
		for j, v := range r {
			if j < len(c.fields) {
				m[c.fields[j].Name] = v
			}
		}
		out[i] = m
	}
	return out
}

func (a *Adapter) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	res, err := a.collect(ctx, "SELECT version()", nil, 0)
	if err != nil {
		return nil, err
	}
	out := &engines.TestConnectionResult{Success: true}
	if len(res.rows) > 0 && len(res.rows[0]) > 0 {
		if s, ok := res.rows[0][0].(string); ok {
			out.ServerVersion = s
		}
	}
	return out, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	res, err := a.collect(ctx,
		"SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY name", nil, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.DatabaseInfo, len(res.rows))
	for i, r := range res.rows {
		out[i].Name = str(r, 0)
	}
	return out, nil
}

func (a *Adapter) ListSchemas(ctx context.Context, database *string) ([]engines.SchemaInfo, error) {
	res, err := a.collect(ctx,
		"SELECT schema_name as name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema') ORDER BY name",
		nil, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.SchemaInfo, len(res.rows))
	for i, r := range res.rows {
		out[i].Name = str(r, 0)
	}
	return out, nil
}

func (a *Adapter) ListTables(ctx context.Context, schema *string) ([]engines.TableInfo, error) {
	s := "public"
	if schema != nil && *schema != "" {
		s = *schema
	}
	const sql = `SELECT
		t.table_schema || '.' || t.table_name as id,
		t.table_name as name,
		t.table_schema as schema,
		t.table_type
	FROM information_schema.tables t
	WHERE t.table_schema = COALESCE($1, 'public') AND t.table_type IN ('BASE TABLE', 'VIEW')
	ORDER BY t.table_name`
	res, err := a.collect(ctx, sql, []any{s}, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.TableInfo, len(res.rows))
	for i, r := range res.rows {
		out[i] = engines.TableInfo{
			ID:     str(r, 0),
			Name:   str(r, 1),
			Schema: str(r, 2),
		}
		if str(r, 3) == "VIEW" {
			out[i].Type = "view"
		} else {
			out[i].Type = "table"
		}
	}
	return out, nil
}

func (a *Adapter) SearchSchema(ctx context.Context, input engines.SchemaSearchInput) ([]engines.SchemaSearchMatch, error) {
	schema := "public"
	if input.Schema != "" {
		schema = input.Schema
	}
	term := "%" + input.Query + "%"
	limit := int64(50)
	if input.Limit != nil {
		limit = int64(*input.Limit)
	}
	const sql = `SELECT
		t.table_schema,
		t.table_name,
		NULL AS column_name,
		NULL AS column_type,
		'table' AS match_type
	FROM information_schema.tables t
	WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE' AND t.table_name ILIKE $2
	UNION ALL
	SELECT
		c.table_schema,
		c.table_name,
		c.column_name,
		c.data_type,
		'column'
	FROM information_schema.columns c
	WHERE c.table_schema = $1 AND c.column_name ILIKE $2
	ORDER BY match_type, table_name, column_name
	LIMIT $3`
	res, err := a.collect(ctx, sql, []any{schema, term, limit}, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.SchemaSearchMatch, len(res.rows))
	for i, r := range res.rows {
		out[i] = engines.SchemaSearchMatch{
			Schema:     str(r, 0),
			Table:      str(r, 1),
			Column:     str(r, 2),
			ColumnType: str(r, 3),
			MatchType:  str(r, 4),
		}
	}
	return out, nil
}

func (a *Adapter) GetTableColumns(ctx context.Context, tableID string) ([]engines.ColumnInfo, error) {
	schema, table := splitTableID(tableID)
	const sql = `SELECT
		c.column_name as name,
		CASE
			WHEN pt.typname = 'vector' THEN pg_catalog.format_type(pa.atttypid, pa.atttypmod)
			ELSE c.data_type
		END as type,
		c.is_nullable = 'YES' as nullable,
		c.column_default as default,
		CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as primary_key,
		fk.ref_table, fk.ref_column, fk.ref_table_schema,
		pt.typname = 'vector' as is_vector,
		CASE WHEN pt.typname = 'vector'
			THEN COALESCE(
				NULLIF(
					REGEXP_REPLACE(pg_catalog.format_type(pa.atttypid, pa.atttypmod), '^vector\(([0-9]+)\)$', '\1'),
					'vector'
				)::int,
				pa.atttypmod
			)
			ELSE NULL
		END as vector_dimensions
	FROM information_schema.columns c
	JOIN pg_catalog.pg_namespace pn
		ON pn.nspname = c.table_schema
	JOIN pg_catalog.pg_class pc
		ON pc.relnamespace = pn.oid
		AND pc.relname = c.table_name
	JOIN pg_catalog.pg_attribute pa
		ON pa.attrelid = pc.oid
		AND pa.attname = c.column_name
		AND pa.attnum > 0
		AND NOT pa.attisdropped
	JOIN pg_catalog.pg_type pt
		ON pt.oid = pa.atttypid
	LEFT JOIN (
		SELECT ku.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage ku
			ON tc.constraint_catalog = ku.constraint_catalog
			AND tc.constraint_schema = ku.constraint_schema
			AND tc.constraint_name = ku.constraint_name
			AND tc.table_schema = ku.table_schema
			AND tc.table_name = ku.table_name
		WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
	) pk ON c.column_name = pk.column_name
	LEFT JOIN (
		SELECT ku.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column, ccu.table_schema as ref_table_schema
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage ku
			ON tc.constraint_catalog = ku.constraint_catalog
			AND tc.constraint_schema = ku.constraint_schema
			AND tc.constraint_name = ku.constraint_name
			AND tc.table_schema = ku.table_schema
			AND tc.table_name = ku.table_name
		JOIN information_schema.constraint_column_usage ccu
			ON tc.constraint_catalog = ccu.constraint_catalog
			AND tc.constraint_schema = ccu.constraint_schema
			AND tc.constraint_name = ccu.constraint_name
		WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
	) fk ON c.column_name = fk.column_name
	WHERE c.table_schema = $1 AND c.table_name = $2
	ORDER BY c.ordinal_position`
	res, err := a.collect(ctx, sql, []any{schema, table}, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.ColumnInfo, len(res.rows))
	for i, r := range res.rows {
		out[i] = engines.ColumnInfo{
			Name:       str(r, 0),
			Type:       str(r, 1),
			Nullable:   boolv(r, 2),
			Default:    strP(r, 3),
			PrimaryKey: boolv(r, 4),
			ForeignKey: fkRef(r, 5, 6, 7),
			IsVector:   boolv(r, 8),
		}
		if d := int64P(r, 9); d != nil {
			out[i].VectorDimensions = d
		}
	}
	return out, nil
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	s := "public"
	if schema != nil && *schema != "" {
		s = *schema
	}
	const sql = `WITH pk_cols AS (
		SELECT ku.table_schema, ku.table_name, ku.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage ku
			ON tc.constraint_catalog = ku.constraint_catalog
			AND tc.constraint_schema = ku.constraint_schema
			AND tc.constraint_name = ku.constraint_name
			AND tc.table_schema = ku.table_schema
			AND tc.table_name = ku.table_name
		WHERE tc.constraint_type = 'PRIMARY KEY'
			AND tc.table_schema = $1
	), fk_cols AS (
		SELECT ku.table_schema, ku.table_name, ku.column_name,
			ccu.table_name AS ref_table, ccu.column_name AS ref_column, ccu.table_schema AS ref_table_schema
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage ku
			ON tc.constraint_catalog = ku.constraint_catalog
			AND tc.constraint_schema = ku.constraint_schema
			AND tc.constraint_name = ku.constraint_name
			AND tc.table_schema = ku.table_schema
		JOIN information_schema.constraint_column_usage ccu
			ON tc.constraint_catalog = ccu.constraint_catalog
			AND tc.constraint_schema = ccu.constraint_schema
			AND tc.constraint_name = ccu.constraint_name
		WHERE tc.constraint_type = 'FOREIGN KEY'
			AND tc.table_schema = $1
	)
	SELECT
		c.table_name,
		c.table_schema,
		c.column_name,
		c.data_type,
		c.is_nullable,
		c.column_default,
		CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS primary_key,
		fk.ref_table,
		fk.ref_column,
		fk.ref_table_schema
	FROM information_schema.columns c
	LEFT JOIN pk_cols pk
		ON c.table_schema = pk.table_schema
		AND c.table_name = pk.table_name
		AND c.column_name = pk.column_name
	LEFT JOIN fk_cols fk
		ON c.table_schema = fk.table_schema
		AND c.table_name = fk.table_name
		AND c.column_name = fk.column_name
	WHERE c.table_schema = $1
		AND c.table_name IN (
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = $1 AND table_type = 'BASE TABLE'
		)
	ORDER BY c.table_name, c.ordinal_position`
	res, err := a.collect(ctx, sql, []any{s}, 0)
	if err != nil {
		return nil, err
	}
	tableIdx := map[string]int{}
	var out []engines.TableCompletions
	for _, r := range res.rows {
		name := str(r, 0)
		idx, ok := tableIdx[name]
		if !ok {
			idx = len(out)
			tableIdx[name] = idx
			out = append(out, engines.TableCompletions{Name: name, Schema: str(r, 1)})
		}
		out[idx].Columns = append(out[idx].Columns, engines.ColumnInfo{
			Name:       str(r, 2),
			Type:       str(r, 3),
			Nullable:   str(r, 4) == "YES",
			Default:    strP(r, 5),
			PrimaryKey: boolv(r, 6),
			ForeignKey: fkRef(r, 7, 8, 9),
		})
	}
	return out, nil
}

func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	schema, table := splitTableID(tableID)
	const sql = `SELECT
		i.relname as name,
		a.attname as column_name,
		ix.indisunique as unique,
		ix.indisprimary as primary,
		am.amname as method
	FROM pg_index ix
	JOIN pg_class i ON i.oid = ix.indexrelid
	JOIN pg_class t ON t.oid = ix.indrelid
	JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
	JOIN pg_namespace n ON n.oid = t.relnamespace
	JOIN pg_am am ON am.oid = i.relam
	WHERE n.nspname = $1 AND t.relname = $2
	ORDER BY i.relname, a.attnum`
	res, err := a.collect(ctx, sql, []any{schema, table}, 0)
	if err != nil {
		return nil, err
	}
	idxMap := map[string]int{}
	var out []engines.IndexInfo
	for _, r := range res.rows {
		name := str(r, 0)
		idx, ok := idxMap[name]
		if !ok {
			idx = len(out)
			idxMap[name] = idx
			out = append(out, engines.IndexInfo{
				Name:    name,
				Unique:  boolv(r, 2),
				Primary: boolv(r, 3),
				Method:  str(r, 4),
			})
		}
		out[idx].Columns = append(out[idx].Columns, str(r, 1))
	}
	return out, nil
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
	q := `"` + strings.ReplaceAll(schema, `"`, `""`) + `"."` + strings.ReplaceAll(table, `"`, `""`) + `"`
	sql := `SELECT * FROM ` + q
	var params []any

	if input.Search != "" {
		// Only search text-like columns — casting ints/dates/bools to text
		// forces seq-scans (same filter list as the sidecar).
		colRes, err := a.collect(ctx,
			`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND (data_type IN ('text', 'character varying', 'character', 'varchar', 'char', 'name', 'uuid') OR udt_name = 'citext') ORDER BY ordinal_position`,
			[]any{schema, table}, 0)
		if err != nil {
			return nil, err
		}
		if len(colRes.rows) > 0 {
			clauses := make([]string, len(colRes.rows))
			for i, r := range colRes.rows {
				col := str(r, 0)
				clauses[i] = engines.QuoteIdentifier(engines.KindPostgres, col) + `::text ILIKE $` + fmt.Sprint(i+1)
				params = append(params, "%"+input.Search+"%")
			}
			sql += ` WHERE ` + strings.Join(clauses, ` OR `)
		}
	}

	if input.SortColumn != "" {
		dir := "ASC"
		if input.SortDirection == "desc" {
			dir = "DESC"
		}
		sql += ` ORDER BY ` + engines.QuoteIdentifier(engines.KindPostgres, input.SortColumn) + ` ` + dir
	}

	params = append(params, limit, offset)
	sql += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(params)-1, len(params))

	start := time.Now()
	res, err := a.collect(ctx, sql, params, 0)
	if err != nil {
		return nil, err
	}
	durationMs := float64(time.Since(start).Microseconds()) / 1000

	cols := queryColumns(res.fields)
	tru := true
	for i := range cols {
		cols[i].Nullable = &tru
	}
	return &engines.QueryResult{
		Columns:    cols,
		Rows:       rowsToMaps(res),
		RowCount:   int64(len(res.rows)),
		DurationMs: durationMs,
		Truncated:  int64(len(res.rows)) >= limit,
	}, nil
}

func (a *Adapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	start := time.Now()
	res, err := a.collect(ctx, input.Query, input.Params, 0)
	if err != nil {
		return nil, err
	}
	return &engines.QueryResult{
		Columns:    queryColumns(res.fields),
		Rows:       rowsToMaps(res),
		RowCount:   int64(len(res.rows)),
		DurationMs: float64(time.Since(start).Microseconds()) / 1000,
		Truncated:  false,
	}, nil
}

// RunQueryBounded is the MCP-only read: fetch at most maxRows+1 rows, then
// close, so a large result never materializes in memory.
func (a *Adapter) RunQueryBounded(ctx context.Context, input engines.BoundedQueryInput) (*engines.BoundedQueryResult, error) {
	start := time.Now()
	rowLimit := input.MaxRows
	if rowLimit < 1 {
		rowLimit = 1
	}
	res, err := a.collect(ctx, input.Query, nil, rowLimit+1)
	if err != nil {
		return nil, err
	}
	truncated := int64(len(res.rows)) > rowLimit
	rows := res.rows
	if truncated {
		rows = rows[:rowLimit]
	}
	return &engines.BoundedQueryResult{
		Columns:    queryColumns(res.fields),
		Rows:       rows,
		DurationMs: float64(time.Since(start).Microseconds()) / 1000,
		Truncated:  truncated,
	}, nil
}

func (a *Adapter) Close() error {
	a.pool.Close()
	return nil
}

// TestPostgresConnection uses a fresh connection (not the pool) so health
// checks reflect current server state, like the sidecar's pg.Client probe.
func TestPostgresConnection(ctx context.Context, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	cfg, err := pgx.ParseConfig("")
	if err != nil {
		return nil, err
	}
	cfg.Host = cp.Host
	if cfg.Host == "" {
		cfg.Host = defaultHost
	}
	cfg.Port = uint16(cp.Port)
	if cfg.Port == 0 {
		cfg.Port = uint16(engines.DefaultPorts[engines.KindPostgres])
	}
	cfg.Database = cp.Database
	cfg.User = cp.Username
	cfg.Password = cp.Password
	cfg.ConnectTimeout = testConnectTimeout
	if cp.SSL {
		cfg.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, classifyConnectError(err, cp)
	}
	defer conn.Close(context.Background())
	var version string
	if err := conn.QueryRow(ctx, "SELECT version()").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func classifyConnectError(err error, cp engines.ConnProfile) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "28P01":
			return errors.New("Authentication failed. Check username and password.")
		case "3D000":
			return fmt.Errorf("Database %q does not exist.", cp.Database)
		}
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return fmt.Errorf("Connection refused. Check if PostgreSQL is running on %s:%d", cp.Host, cp.Port)
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) && dnsErr.IsNotFound {
		return fmt.Errorf("Host not found: %s. Check the hostname.", cp.Host)
	}
	return err
}

// row accessors — the query column order is fixed per statement.
func str(r []any, i int) string {
	if i >= len(r) {
		return ""
	}
	switch v := r[i].(type) {
	case string:
		return v
	case []byte:
		return string(v)
	case nil:
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func strP(r []any, i int) *string {
	if i >= len(r) || r[i] == nil {
		return nil
	}
	s := str(r, i)
	return &s
}

func boolv(r []any, i int) bool {
	if i >= len(r) {
		return false
	}
	b, _ := r[i].(bool)
	return b
}

func int64P(r []any, i int) *int64 {
	if i >= len(r) || r[i] == nil {
		return nil
	}
	v := toInt64(r[i])
	return &v
}

func toInt64(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int32:
		return int64(n)
	case int:
		return int64(n)
	case float64:
		return int64(n)
	case string:
		var out int64
		fmt.Sscan(n, &out)
		return out
	}
	return 0
}

func floatv(r []any, i int) float64 {
	if i >= len(r) || r[i] == nil {
		return 0
	}
	switch n := r[i].(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	case string:
		var out float64
		fmt.Sscan(n, &out)
		return out
	}
	return 0
}

func fkRef(r []any, tableIdx, colIdx, schemaIdx int) *engines.ColumnForeignKey {
	if str(r, tableIdx) == "" {
		return nil
	}
	return &engines.ColumnForeignKey{
		Table:  str(r, tableIdx),
		Column: str(r, colIdx),
		Schema: str(r, schemaIdx),
	}
}

// PgVectorColumn is one discovered vector column.
type PgVectorColumn struct {
	TableSchema string `json:"tableSchema"`
	TableName   string `json:"tableName"`
	ColumnName  string `json:"columnName"`
	Dimensions  int    `json:"dimensions"`
}

// PgVectorIndex is one ivfflat/hnsw index over a vector column.
type PgVectorIndex struct {
	Name        string `json:"name"`
	TableSchema string `json:"tableSchema"`
	TableName   string `json:"tableName"`
	ColumnName  string `json:"columnName"`
	Method      string `json:"method"`
	Operator    string `json:"operator"`
}

// PgVectorCapability mirrors PostgresVectorCapability in shared.
type PgVectorCapability struct {
	Available bool             `json:"available"`
	Version   *string          `json:"version"`
	Columns   []PgVectorColumn `json:"columns"`
	Indexes   []PgVectorIndex  `json:"indexes"`
}

// DetectPgVectorCapability ports detectPgVectorCapability: a fresh conn (not
// the pool) probes pg_extension, vector columns, and ivfflat/hnsw indexes.
func DetectPgVectorCapability(ctx context.Context, cp engines.ConnProfile) (*PgVectorCapability, error) {
	conn, err := NewNotifyConn(ctx, cp)
	if err != nil {
		return nil, err
	}
	defer conn.Close(context.Background())

	cap := &PgVectorCapability{Columns: []PgVectorColumn{}, Indexes: []PgVectorIndex{}}
	var version string
	err = conn.QueryRow(ctx, `SELECT extversion FROM pg_extension WHERE extname = 'vector'`).Scan(&version)
	if err != nil {
		return cap, nil // extension absent → unavailable, same as rows.length === 0
	}
	cap.Available = true
	cap.Version = &version

	colRows, err := conn.Query(ctx,
		`SELECT
		  n.nspname AS table_schema,
		  c.relname AS table_name,
		  a.attname AS column_name,
		  COALESCE(
		    NULLIF(REGEXP_REPLACE(pg_catalog.format_type(a.atttypid, a.atttypmod), '^vector\(([0-9]+)\)$', '\1'), 'vector')::int,
		    a.atttypmod
		  ) AS dimensions
		FROM pg_attribute a
		JOIN pg_class c ON a.attrelid = c.oid
		JOIN pg_namespace n ON c.relnamespace = n.oid
		JOIN pg_type t ON a.atttypid = t.oid
		WHERE t.typname = 'vector'
		  AND a.attnum > 0
		  AND NOT a.attisdropped
		  AND c.relkind = 'r'
		  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
		ORDER BY n.nspname, c.relname, a.attnum`)
	if err != nil {
		return nil, err
	}
	defer colRows.Close()
	for colRows.Next() {
		var c PgVectorColumn
		if err := colRows.Scan(&c.TableSchema, &c.TableName, &c.ColumnName, &c.Dimensions); err != nil {
			return nil, err
		}
		cap.Columns = append(cap.Columns, c)
	}
	if err := colRows.Err(); err != nil {
		return nil, err
	}
	colRows.Close()

	idxRows, err := conn.Query(ctx,
		`SELECT
		  i.relname AS name,
		  n.nspname AS table_schema,
		  c.relname AS table_name,
		  a.attname AS column_name,
		  am.amname AS method,
		  COALESCE(opr.operator_name, 'cosine') AS operator_name
		FROM pg_index ix
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_class c ON c.oid = ix.indrelid
		JOIN pg_namespace n ON c.relnamespace = n.oid
		JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
		JOIN pg_am am ON am.oid = i.relam
		JOIN pg_type t ON a.atttypid = t.oid
		LEFT JOIN LATERAL (
		  SELECT CASE
		    WHEN o.opcname LIKE '%l2%' OR o.opcname LIKE '%vector_l2%' THEN 'l2'
		    WHEN o.opcname LIKE '%cosine%' OR o.opcname LIKE '%vector_cosine%' THEN 'cosine'
		    WHEN o.opcname LIKE '%ip%' OR o.opcname LIKE '%vector_ip%' THEN 'inner_product'
		    ELSE 'cosine'
		  END AS operator_name
		  FROM pg_opclass o
		  WHERE o.oid = (ix.indclass::int[])[1]
		  LIMIT 1
		) opr ON true
		WHERE t.typname = 'vector'
		  AND am.amname IN ('ivfflat', 'hnsw')
		  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
		ORDER BY n.nspname, c.relname, i.relname`)
	if err != nil {
		return nil, err
	}
	defer idxRows.Close()
	for idxRows.Next() {
		var ix PgVectorIndex
		if err := idxRows.Scan(&ix.Name, &ix.TableSchema, &ix.TableName, &ix.ColumnName, &ix.Method, &ix.Operator); err != nil {
			return nil, err
		}
		cap.Indexes = append(cap.Indexes, ix)
	}
	return cap, idxRows.Err()
}
