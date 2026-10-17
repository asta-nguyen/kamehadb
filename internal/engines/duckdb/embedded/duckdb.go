// Package embedded is imported only by the optional DuckDB helper and its
// native tests. Desktop callers use the lightweight stdio proxy instead.
package embedded

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	_ "github.com/marcboeker/go-duckdb/v2"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

const (
	testConnectTimeout = 5 * time.Second
	defaultMemoryBytes = 64 << 20
	defaultThreads     = 2
	previewSourceAlias = "kameha_preview"
)

func esc(id string) string {
	return `"` + strings.ReplaceAll(id, `"`, `""`) + `"`
}

func escVal(val string) string {
	return "'" + strings.ReplaceAll(val, "'", "''") + "'"
}

type Adapter struct {
	db           *sql.DB
	ownedTempDir string
	previewScope string
}

func New(filePath string) (*Adapter, error) {
	return NewWithTempDir(context.Background(), filePath, "")
}

// The parent owns production spill directories; native tests get a private
// temporary directory. These are engine limits, not a helper RSS ceiling.
func NewWithTempDir(ctx context.Context, filePath, tempDir string) (*Adapter, error) {
	if filePath == "" {
		return nil, fmt.Errorf("duckdb file path is required")
	}
	db, err := sql.Open("duckdb", filePath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	a := &Adapter{db: db, previewScope: engines.NewPreviewScope(engines.KindDuckDB)}
	if tempDir == "" {
		tempDir, err = os.MkdirTemp("", "kamehadb-duckdb-spill-*")
		if err != nil {
			db.Close()
			return nil, err
		}
		a.ownedTempDir = tempDir
	}
	for _, setting := range []string{
		fmt.Sprintf("SET memory_limit = '%dB'", defaultMemoryBytes),
		fmt.Sprintf("SET threads = %d", defaultThreads),
		"SET temp_directory = " + escVal(tempDir),
	} {
		if _, err := db.ExecContext(ctx, setting); err != nil {
			a.Close()
			return nil, err
		}
	}
	return a, nil
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
func (a *Adapter) queryMaps(ctx context.Context, query string, maxRows int64, budget *engines.ResultBudget, args ...any) ([]engines.QueryColumn, []map[string]any, bool, error) {
	rows, err := a.db.QueryContext(ctx, query, args...)
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
		  EXISTS(SELECT 1 FROM information_schema.table_constraints tc
		   JOIN information_schema.key_column_usage kcu
		     ON tc.constraint_catalog = kcu.constraint_catalog AND tc.constraint_schema = kcu.constraint_schema
		    AND tc.constraint_name = kcu.constraint_name
		   WHERE tc.table_catalog = c.table_catalog AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name
		     AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY') AS primary_key
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

// Native direct callers read metadata once; the proxy supplies cached columns.
func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	columns, err := a.GetTableColumns(ctx, input.TableID)
	if err != nil {
		return nil, err
	}
	return a.PreviewRowsWithColumns(ctx, input, columns)
}

// Bind exact native integers inside the helper, not through a float64 RPC
// value. Unsupported shapes retain the same server-ordered offset fallback.
func (a *Adapter) PreviewRowsWithColumns(ctx context.Context, input engines.PreviewRowsInput, columns []engines.ColumnInfo) (*engines.QueryResult, error) {
	input = engines.ScopePreview(input, a.previewScope)
	start := time.Now()
	schema, table := splitTableID(input.TableID)
	limit, offset, err := engines.PreviewBounds(input)
	if err != nil {
		return nil, err
	}
	key := engines.PreviewPrimaryKey(engines.KindDuckDB, columns)
	seek, err := engines.UsePreviewCursor(input, key, offset)
	if err != nil {
		return nil, err
	}
	parent := ctx
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	budget := engines.NewResultBudget(parent, cancel, limit, engines.MaxPreviewResultBytes)
	var sb strings.Builder
	var params []any
	// go-duckdb cannot decode UHUGEINT. Decimal text is lossless, unlike a
	// double cast; only projection/parameter is cast, never the indexed column.
	projection := "*"
	for _, col := range columns {
		if strings.EqualFold(col.Type, "UHUGEINT") {
			parts := make([]string, len(columns))
			for i, current := range columns {
				parts[i] = esc(current.Name)
				if strings.EqualFold(current.Type, "UHUGEINT") {
					parts[i] = "CAST(" + parts[i] + " AS VARCHAR) AS " + esc(current.Name)
				}
			}
			projection = strings.Join(parts, ", ")
			break
		}
	}
	sb.WriteString("SELECT " + projection + " FROM " + esc(schema) + "." + esc(table) + " AS " + previewSourceAlias)
	if input.Search != "" {
		var clauses []string
		for _, col := range columns {
			if input.SearchColumn != "" && col.Name != input.SearchColumn {
				continue
			}
			if input.MatchCase {
				clauses = append(clauses, "contains(CAST("+esc(col.Name)+" AS VARCHAR), ?)")
				params = append(params, input.Search)
			} else {
				clauses = append(clauses, "CAST("+esc(col.Name)+" AS VARCHAR) ILIKE ?")
				params = append(params, "%"+input.Search+"%")
			}
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
		sb.WriteString(esc(key.Name))
		if input.SortDirection == "desc" {
			sb.WriteString(" < ")
		} else {
			sb.WriteString(" > ")
		}
		switch nativeType := strings.ToUpper(key.Type); nativeType {
		case "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT":
			// database/sql rejects high-bit uint64, and this driver rejects
			// inferred UHUGEINT parameters. Infer VARCHAR first, then cast
			// the exact decimal string; the indexed column is never cast.
			sb.WriteString("CAST(CAST(? AS VARCHAR) AS " + nativeType + ")")
			params = append(params, fmt.Sprint(value))
		default:
			sb.WriteString("?")
			params = append(params, value)
		}
	}
	order := input.SortColumn
	if order == "" && key != nil {
		order = key.Name
	}
	// Qualify the physical column, not its projected decimal-text alias. The key
	// follows the sort column so OFFSET pages stay exact when values tie.
	quote := func(name string) string { return previewSourceAlias + "." + esc(name) }
	if orderBy := engines.PreviewOrderBy(columns, order, input.SortDirection, quote); orderBy != "" {
		sb.WriteString(" ORDER BY " + orderBy)
	}
	sb.WriteString(" LIMIT ?")
	params = append(params, limit+1)
	if !seek {
		sb.WriteString(" OFFSET ?")
		params = append(params, offset)
	}
	qcols, mapRows, truncated, err := a.queryMaps(ctx, sb.String(), limit, budget, params...)
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
	err := a.db.Close()
	if a.ownedTempDir != "" {
		_ = os.RemoveAll(a.ownedTempDir)
	}
	return err
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
