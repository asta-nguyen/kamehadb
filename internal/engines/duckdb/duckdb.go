// Package duckdb ports apps/sidecar/src/adapters/duckdb.ts on
// go-duckdb (database/sql over the embedded engine). The TS adapter
// interpolates escaped literals via escapeDuckDbVal; standard ” escaping.
package duckdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/marcboeker/go-duckdb/v2"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const testConnectTimeout = 5 * time.Second

func esc(id string) string {
	return `"` + strings.ReplaceAll(id, `"`, `""`) + `"`
}

func escVal(val string) string {
	return "'" + strings.ReplaceAll(val, "'", "''") + "'"
}

type Adapter struct {
	db *sql.DB
}

func New(filePath string) (*Adapter, error) {
	if filePath == "" {
		return nil, fmt.Errorf("duckdb file path is required")
	}
	db, err := sql.Open("duckdb", filePath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return &Adapter{db: db}, nil
}

func init() {
	engines.RegisterFactory(engines.KindDuckDB, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
		return New(cp.FilePath)
	})
}

func splitTableID(tableID string) (string, string) {
	parts := strings.Split(tableID, ".")
	if len(parts) > 1 {
		return parts[0], parts[1]
	}
	return "main", tableID
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
func (a *Adapter) queryMaps(ctx context.Context, query string, maxRows int64) ([]engines.QueryColumn, []map[string]any, bool, error) {
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
	if err := a.db.QueryRowContext(ctx, "SELECT version() AS version").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	var name string
	if err := a.db.QueryRowContext(ctx, "SELECT current_database() AS name").Scan(&name); err != nil {
		return nil, err
	}
	return []engines.DatabaseInfo{{Name: name}}, nil
}

func (a *Adapter) ListSchemas(ctx context.Context, _ *string) ([]engines.SchemaInfo, error) {
	rows, err := a.db.QueryContext(ctx,
		"SELECT DISTINCT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema' ORDER BY schema_name")
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
	s := "main"
	if schema != nil && *schema != "" {
		s = *schema
	}
	rows, err := a.db.QueryContext(ctx,
		`SELECT table_name AS name, table_schema AS schema_name FROM information_schema.tables WHERE table_schema = `+escVal(s)+
			` AND table_type = 'BASE TABLE' ORDER BY table_name`)
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
	rows, err := a.db.QueryContext(ctx,
		`SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS default,
		  (SELECT true FROM information_schema.table_constraints tc
		   JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
		   WHERE tc.table_schema = `+escVal(schema)+` AND tc.table_name = `+escVal(table)+`
		     AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
		   LIMIT 1) AS primary_key
		 FROM information_schema.columns c
		 WHERE table_schema = `+escVal(schema)+` AND table_name = `+escVal(table)+`
		 ORDER BY ordinal_position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.ColumnInfo{}
	for rows.Next() {
		var c engines.ColumnInfo
		var nullable string
		var def sql.NullString
		var pk sql.NullBool
		if err := rows.Scan(&c.Name, &c.Type, &nullable, &def, &pk); err != nil {
			return nil, err
		}
		c.Nullable = nullable == "YES"
		if def.Valid {
			s := def.String
			c.Default = &s
		}
		c.PrimaryKey = pk.Valid && pk.Bool
		out = append(out, c)
	}
	return out, rows.Err()
}

func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	schema, table := splitTableID(tableID)
	rows, err := a.db.QueryContext(ctx,
		`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
		 FROM information_schema.table_constraints tc
		 JOIN information_schema.key_column_usage kcu
		   ON tc.constraint_catalog = kcu.constraint_catalog
		  AND tc.constraint_schema = kcu.constraint_schema
		  AND tc.constraint_name = kcu.constraint_name
		 WHERE tc.table_schema = `+escVal(schema)+` AND tc.table_name = `+escVal(table)+`
		   AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
		 ORDER BY tc.constraint_name, kcu.ordinal_position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.IndexInfo{}
	byName := map[string]*engines.IndexInfo{}
	for rows.Next() {
		var name, ctype, col string
		if err := rows.Scan(&name, &ctype, &col); err != nil {
			return nil, err
		}
		idx, ok := byName[name]
		if !ok {
			out = append(out, engines.IndexInfo{
				Name:    name,
				Unique:  ctype == "UNIQUE",
				Primary: ctype == "PRIMARY KEY",
			})
			idx = &out[len(out)-1]
			byName[name] = idx
		}
		idx.Columns = append(idx.Columns, col)
	}
	return out, rows.Err()
}

func (a *Adapter) GetCompletions(ctx context.Context, schema *string) ([]engines.TableCompletions, error) {
	s := "main"
	if schema != nil && *schema != "" {
		s = *schema
	}
	rows, err := a.db.QueryContext(ctx,
		`SELECT c.table_name, c.column_name, c.data_type AS type, c.is_nullable AS nullable, c.column_default AS default
		 FROM information_schema.columns c
		 WHERE c.table_schema = `+escVal(s)+`
		 ORDER BY c.table_name, c.ordinal_position`)
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
		if err := rows.Scan(&tableName, &col.Name, &col.Type, &nullable, &def); err != nil {
			return nil, err
		}
		col.Nullable = nullable == "YES"
		if def.Valid {
			sv := def.String
			col.Default = &sv
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
	sb.WriteString("SELECT * FROM ")
	sb.WriteString(esc(schema))
	sb.WriteString(".")
	sb.WriteString(esc(table))

	if input.Search != "" {
		colRows, err := a.db.QueryContext(ctx,
			`SELECT column_name FROM information_schema.columns WHERE table_schema = `+escVal(schema)+
				` AND table_name = `+escVal(table)+` ORDER BY ordinal_position`)
		if err != nil {
			return nil, err
		}
		var cols []string
		for colRows.Next() {
			var c string
			if err := colRows.Scan(&c); err != nil {
				colRows.Close()
				return nil, err
			}
			cols = append(cols, c)
		}
		colRows.Close()
		if len(cols) > 0 {
			clauses := make([]string, len(cols))
			for i, col := range cols {
				clauses[i] = "CAST(" + esc(col) + " AS VARCHAR) ILIKE " + escVal("%"+input.Search+"%")
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
	fmt.Fprintf(&sb, " LIMIT %d OFFSET %d", limit, offset)

	start := time.Now()
	qcols, mapRows, _, err := a.queryMaps(ctx, sb.String(), 0)
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
	qcols, mapRows, truncated, err := a.queryMaps(ctx, input.Query, engines.MaxGuiRows)
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
	schema, table := splitTableID(tableID)
	var cnt int64
	if err := a.db.QueryRowContext(ctx,
		"SELECT COUNT(*) AS cnt FROM "+esc(schema)+"."+esc(table)).Scan(&cnt); err != nil {
		return nil, err
	}
	return &engines.TableStats{
		TableID: tableID, Name: table, Schema: schema,
		RowEstimate: cnt, NLiveTup: cnt,
	}, nil
}

func (a *Adapter) Close() error {
	return a.db.Close()
}

// TestDuckDBConnection mirrors testDuckDBConnection.
func TestDuckDBConnection(ctx context.Context, filePath string) (*engines.TestConnectionResult, error) {
	db, err := sql.Open("duckdb", filePath)
	if err != nil {
		return &engines.TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	ctx2, cancel := context.WithTimeout(ctx, testConnectTimeout)
	defer cancel()
	var version string
	if err := db.QueryRowContext(ctx2, "SELECT version() AS version").Scan(&version); err != nil {
		return &engines.TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}
