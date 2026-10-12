// Package oracle ports apps/sidecar/src/adapters/oracle.ts on
// sijms/go-ora/v2 (pure Go, no Instant Client). Metadata queries run
// against all_* views with uppercased identifiers like the TS adapter.
package oracle

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	_ "github.com/sijms/go-ora/v2"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	defaultHost     = "localhost"
	defaultService  = "XE"
	testConnTimeout = 5 * time.Second
)

func dsn(cp engines.ConnProfile) string {
	host := cp.Host
	if host == "" {
		host = defaultHost
	}
	port := cp.Port
	if port == 0 {
		port = int64(engines.DefaultPorts[engines.KindOracle])
	}
	service := cp.Database
	if service == "" {
		service = defaultService
	}
	u := &url.URL{
		Scheme: "oracle",
		User:   url.UserPassword(cp.Username, cp.Password),
		Host:   fmt.Sprintf("%s:%d", host, port),
		Path:   "/" + service,
	}
	return u.String()
}

// Adapter keeps the profile because metadata queries default the owner to
// the connecting username, like the TS closure over `connection`.
type Adapter struct {
	db       *sql.DB
	username string
}

func New(cp engines.ConnProfile) (*Adapter, error) {
	db, err := sql.Open("oracle", dsn(cp))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	return &Adapter{db: db, username: cp.Username}, nil
}

func init() {
	engines.RegisterFactory(engines.KindOracle, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
		return New(cp)
	})
}

func esc(id string) string { return engines.QuoteIdentifier(engines.KindOracle, id) }

func (a *Adapter) ownerFor(schema *string) string {
	if schema != nil && *schema != "" {
		return strings.ToUpper(*schema)
	}
	return strings.ToUpper(a.username)
}

func splitTableID(fallbackOwner, tableID string) (owner, table string) {
	parts := strings.Split(tableID, ".")
	if len(parts) > 1 {
		return strings.ToUpper(parts[0]), strings.ToUpper(parts[1])
	}
	return strings.ToUpper(fallbackOwner), strings.ToUpper(tableID)
}

// normalizeValue mirrors serializeRows: LOBs serialize as a placeholder,
// dates as ISO, everything else passes through.
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
	var banner string
	err := a.db.QueryRowContext(ctx,
		"SELECT banner FROM v$version WHERE banner LIKE 'Oracle%' AND ROWNUM = 1").Scan(&banner)
	if err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: banner}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT name FROM v$database")
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
	rows, err := a.db.QueryContext(ctx, "SELECT username AS name FROM all_users ORDER BY username")
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
	owner := a.ownerFor(schema)
	rows, err := a.db.QueryContext(ctx,
		`SELECT table_name AS name, owner AS schema_name FROM all_tables WHERE owner = :owner ORDER BY table_name`,
		sql.Named("owner", owner))
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
	owner, table := splitTableID(a.username, tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT column_name AS name, data_type AS type, nullable, data_default AS default_val
		 FROM all_tab_cols WHERE owner = :owner AND table_name = :tbl ORDER BY column_id`,
		sql.Named("owner", owner), sql.Named("tbl", table))
	if err != nil {
		return nil, err
	}
	var out []engines.ColumnInfo
	for rows.Next() {
		var c engines.ColumnInfo
		var nullable string
		var def sql.NullString
		if err := rows.Scan(&c.Name, &c.Type, &nullable, &def); err != nil {
			rows.Close()
			return nil, err
		}
		c.Nullable = nullable == "Y"
		if def.Valid {
			s := def.String
			c.Default = &s
		}
		out = append(out, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	pkRows, err := a.db.QueryContext(ctx,
		`SELECT cc.column_name FROM all_cons_columns cc
		 JOIN all_constraints c ON cc.constraint_name = c.constraint_name AND cc.owner = c.owner
		 WHERE cc.owner = :owner AND cc.table_name = :tbl AND c.constraint_type = 'P'`,
		sql.Named("owner", owner), sql.Named("tbl", table))
	if err != nil {
		return nil, err
	}
	pks := map[string]bool{}
	for pkRows.Next() {
		var name string
		if err := pkRows.Scan(&name); err != nil {
			pkRows.Close()
			return nil, err
		}
		pks[name] = true
	}
	pkRows.Close()
	if err := pkRows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		out[i].PrimaryKey = pks[out[i].Name]
	}
	return out, nil
}

func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	owner, table := splitTableID(a.username, tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT
		  i.index_name, i.column_name, i.descend,
		  ix.uniqueness,
		  ac.constraint_type
		FROM all_ind_columns i
		JOIN all_indexes ix ON i.index_name = ix.index_name AND i.table_owner = ix.owner
		LEFT JOIN all_constraints ac ON ac.index_name = ix.index_name AND ac.owner = ix.owner AND ac.constraint_type = 'P'
		WHERE i.table_owner = :owner AND i.table_name = :tbl
		ORDER BY i.index_name, i.column_position`,
		sql.Named("owner", owner), sql.Named("tbl", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []engines.IndexInfo{}
	byName := map[string]*engines.IndexInfo{}
	for rows.Next() {
		var name, col, descend, uniqueness string
		var constraintType sql.NullString
		if err := rows.Scan(&name, &col, &descend, &uniqueness, &constraintType); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			out = append(out, engines.IndexInfo{
				Name:    name,
				Unique:  uniqueness == "UNIQUE",
				Primary: constraintType.Valid && constraintType.String == "P",
			})
			idx = &out[len(out)-1]
			byName[name] = idx
		}
		idx.Columns = append(idx.Columns, col)
	}
	return out, rows.Err()
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	owner := a.ownerFor(schema)
	rows, err := a.db.QueryContext(ctx,
		`SELECT
		  c.table_name, c.column_name, c.data_type AS type, c.nullable, c.data_default AS default_val
		FROM all_tab_cols c
		WHERE c.owner = :owner
		ORDER BY c.table_name, c.column_id`,
		sql.Named("owner", owner))
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
		col := engines.ColumnInfo{Name: colName, Type: typ, Nullable: nullable == "Y"}
		if def.Valid {
			d := def.String
			col.Default = &d
		}
		t, ok := byName[tableName]
		if !ok {
			out = append(out, engines.TableCompletions{Name: tableName, Schema: owner})
			t = &out[len(out)-1]
			byName[tableName] = t
		}
		t.Columns = append(t.Columns, col)
	}
	return out, rows.Err()
}

func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	owner, table := splitTableID(a.username, input.TableID)
	offset := int64(0)
	if input.Offset != nil {
		offset = *input.Offset
	}
	limit := int64(100)
	if input.Limit != nil {
		limit = *input.Limit
	}
	var sb strings.Builder
	sb.WriteString("SELECT * FROM ")
	sb.WriteString(esc(owner))
	sb.WriteString(".")
	sb.WriteString(esc(table))

	if input.Search != "" {
		colRows, err := a.db.QueryContext(ctx,
			`SELECT column_name FROM all_tab_cols WHERE owner = :owner AND table_name = :tbl ORDER BY column_id`,
			sql.Named("owner", owner), sql.Named("tbl", table))
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
			searchCols = append(searchCols, c)
		}
		colRows.Close()
		if len(searchCols) > 0 {
			clauses := make([]string, len(searchCols))
			for i, col := range searchCols {
				clauses[i] = "LOWER(" + esc(col) + ") LIKE LOWER(:search)"
			}
			sb.WriteString(" WHERE ")
			sb.WriteString(strings.Join(clauses, " OR "))
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

	// Oracle pagination via ROWNUM wrapper.
	q := fmt.Sprintf("SELECT * FROM (SELECT a.*, ROWNUM rnum FROM (%s) a WHERE ROWNUM <= %d) WHERE rnum > %d",
		sb.String(), offset+limit, offset)

	start := time.Now()
	var rows *sql.Rows
	var err error
	if input.Search != "" {
		rows, err = a.db.QueryContext(ctx, q, sql.Named("search", "%"+input.Search+"%"))
	} else {
		rows, err = a.db.QueryContext(ctx, q)
	}
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
	rows, err := a.db.QueryContext(ctx, input.Query, input.Params...)
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

func (a *Adapter) GetTableStats(ctx context.Context, tableID string) (*engines.TableStats, error) {
	owner, table := splitTableID(a.username, tableID)
	var numRows, tableBytes, indexBytes sql.NullInt64
	err := a.db.QueryRowContext(ctx,
		`SELECT
		  (SELECT num_rows FROM all_tables WHERE owner = :owner AND table_name = :tbl) AS num_rows,
		  (SELECT NVL(SUM(bytes), 0) FROM user_segments WHERE segment_name = :tbl AND segment_type = 'TABLE') AS table_bytes,
		  (SELECT NVL(SUM(s.bytes), 0) FROM user_segments s
		   JOIN user_indexes ix ON s.segment_name = ix.index_name
		   WHERE ix.table_name = :tbl) AS index_bytes
		FROM dual`,
		sql.Named("owner", owner), sql.Named("tbl", table)).Scan(&numRows, &tableBytes, &indexBytes)
	if err != nil {
		return nil, err
	}
	return &engines.TableStats{
		TableID: tableID, Name: table, Schema: owner,
		RowEstimate:  numRows.Int64,
		TotalBytes:   tableBytes.Int64,
		IndexesBytes: indexBytes.Int64,
		NLiveTup:     numRows.Int64,
	}, nil
}

func (a *Adapter) Close() error {
	return a.db.Close()
}

// TestOracleConnection mirrors testOracleConnection — connect, read banner
// from v$version, close.
func TestOracleConnection(ctx context.Context, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	db, err := sql.Open("oracle", dsn(cp))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	ctx2, cancel := context.WithTimeout(ctx, testConnTimeout)
	defer cancel()
	var banner string
	err = db.QueryRowContext(ctx2,
		"SELECT banner FROM v$version WHERE banner LIKE 'Oracle%' AND ROWNUM = 1").Scan(&banner)
	if err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: banner}, nil
}
