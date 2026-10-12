// Package sqlite ports apps/sidecar/src/adapters/sqlite.ts on
// modernc.org/sqlite. better-sqlite3 runs serialized, so a single
// connection mirrors its semantics.
package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/asta-nguyen/kamehadb/internal/engines"
)

type Adapter struct {
	db *sql.DB
}

func New(cp engines.ConnProfile) (*Adapter, error) {
	if cp.FilePath == "" {
		return nil, errors.New("SQLite file path is required")
	}
	db, err := sql.Open("sqlite", cp.FilePath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	// Tune SQLite connection with high-performance PRAGMAs: (How / Why / What)
	// - mmap_size: Memory-map up to 256MB to bypass read() syscalls during scans.
	// - cache_size: Increase page cache to 64MB (default is 2MB) to prevent thrashing.
	// - temp_store: Keep temporary sort and join b-trees in RAM instead of disk.
	_, _ = db.Exec("PRAGMA mmap_size = 268435456")
	_, _ = db.Exec("PRAGMA cache_size = -64000")
	_, _ = db.Exec("PRAGMA temp_store = MEMORY")

	return &Adapter{db: db}, nil
}

func init() {
	engines.RegisterFactory(engines.KindSQLite, func(cp engines.ConnProfile) (engines.SQLAdapter, error) {
		return New(cp)
	})
}

// NewMCP opens the file read-only for the MCP listener — the TS worker ran
// better-sqlite3 with readonly+fileMustExist in a child process; a goroutine
// world just needs the same read-only guarantee plus a ctx deadline.
func NewMCP(filePath string) (*Adapter, error) {
	if filePath == "" {
		return nil, errors.New("SQLite file path is required")
	}
	db, err := sql.Open("sqlite", "file:"+filePath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	_, _ = db.Exec("PRAGMA mmap_size = 268435456")
	_, _ = db.Exec("PRAGMA cache_size = -64000")
	_, _ = db.Exec("PRAGMA temp_store = MEMORY")

	return &Adapter{db: db}, nil
}

func esc(id string) string { return engines.QuoteIdentifier(engines.KindSQLite, id) }

func normalizeValue(v any) any {
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}

// isSearchableColumn skips binary/blob columns and non-numeric columns when searching strings,
// avoiding expensive per-row string conversions on millions of numeric/blob rows. (How / Why / What)
func isSearchableColumn(colType string, search string) bool {
	t := strings.ToLower(colType)
	// Skip blobs/binary: string LIKE does not match binary without casting
	if strings.Contains(t, "blob") || strings.Contains(t, "binary") || strings.Contains(t, "bytea") {
		return false
	}
	// Textual columns are always searched
	if t == "" || strings.Contains(t, "char") || strings.Contains(t, "text") ||
		strings.Contains(t, "clob") || strings.Contains(t, "string") ||
		strings.Contains(t, "json") || strings.Contains(t, "uuid") {
		return true
	}
	// Numeric columns (int, real, float, numeric) only searched if search term is numeric
	isNumCol := strings.Contains(t, "int") || strings.Contains(t, "real") ||
		strings.Contains(t, "float") || strings.Contains(t, "double") ||
		strings.Contains(t, "numeric") || strings.Contains(t, "decimal")
	if isNumCol {
		return isNumericString(search)
	}
	return true
}

func isNumericString(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	for _, r := range s {
		if (r < '0' || r > '9') && r != '.' && r != '-' && r != '+' {
			return false
		}
	}
	return true
}

// rowsToMaps scans an active sql.Rows cursor into map rows, capping at maxRows (0 for unlimited).
// Pre-allocates and reuses the scan pointer buffer across iterations to prevent millions of
// small heap allocations when reading large result sets. (How / Why / What)
func rowsToMaps(rows *sql.Rows, maxRows int64) ([]engines.QueryColumn, []map[string]any, bool, error) {
	names, err := rows.Columns()
	if err != nil {
		return nil, nil, false, err
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
	// TS derives column types from the first row's JS values; Report the
	// declared SQLite types instead (always available, row-independent).
	types, _ := rows.ColumnTypes()
	qcols := make([]engines.QueryColumn, len(names))
	for i, name := range names {
		typ := ""
		if i < len(types) {
			typ = types[i].DatabaseTypeName()
		}
		qcols[i] = engines.QueryColumn{Name: name, Type: strings.ToLower(typ)}
	}
	return qcols, out, truncated, rows.Err()
}

func (a *Adapter) TestConnection(ctx context.Context) (*engines.TestConnectionResult, error) {
	var version string
	if err := a.db.QueryRowContext(ctx, "SELECT sqlite_version() AS version").Scan(&version); err != nil {
		return nil, err
	}
	return &engines.TestConnectionResult{Success: true, ServerVersion: version}, nil
}

func (a *Adapter) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	return []engines.DatabaseInfo{{Name: "main"}}, nil
}

func (a *Adapter) ListSchemas(ctx context.Context, _ *string) ([]engines.SchemaInfo, error) {
	return []engines.SchemaInfo{{Name: "main"}}, nil
}

// userTables is the shared sqlite_master filter the TS adapter reuses in
// three places (vec0 clauses kept verbatim from the source port).
const userTablesQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' ORDER BY name`

func (a *Adapter) ListTables(ctx context.Context, _ *string) ([]engines.TableInfo, error) {
	rows, err := a.db.QueryContext(ctx, userTablesQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []engines.TableInfo{}
	for rows.Next() {
		var t engines.TableInfo
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		t.ID = t.Name
		out = append(out, t)
	}
	return out, rows.Err()
}

func (a *Adapter) SearchSchema(ctx context.Context, input engines.SchemaSearchInput) ([]engines.SchemaSearchMatch, error) {
	term := "%" + input.Query + "%"
	limit := int64(50)
	if input.Limit != nil {
		limit = int64(*input.Limit)
	}
	out := []engines.SchemaSearchMatch{}

	rows, err := a.db.QueryContext(ctx,
		`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' AND name LIKE ? ORDER BY name LIMIT ?`,
		term, limit)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, engines.SchemaSearchMatch{Schema: "main", Table: name, MatchType: "table"})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if int64(len(out)) < limit {
		allTables, err := a.db.QueryContext(ctx, userTablesQuery)
		if err != nil {
			return nil, err
		}
		var names []string
		for allTables.Next() {
			var name string
			if err := allTables.Scan(&name); err != nil {
				allTables.Close()
				return nil, err
			}
			names = append(names, name)
		}
		allTables.Close()
		if err := allTables.Err(); err != nil {
			return nil, err
		}

		needle := strings.ToLower(input.Query)
		colLimit := limit - int64(len(out))
		var colCount int64
		for _, tbl := range names {
			if colCount >= colLimit {
				break
			}
			cols, err := a.db.QueryContext(ctx, "SELECT name, type FROM pragma_table_info(?)", tbl)
			if err != nil {
				return nil, err
			}
			for cols.Next() {
				var colName, colType string
				if err := cols.Scan(&colName, &colType); err != nil {
					cols.Close()
					return nil, err
				}
				if strings.Contains(strings.ToLower(colName), needle) {
					out = append(out, engines.SchemaSearchMatch{
						Schema: "main", Table: tbl, Column: colName,
						ColumnType: colType, MatchType: "column",
					})
					colCount++
					if colCount >= colLimit {
						break
					}
				}
			}
			cols.Close()
		}
	}
	return out, nil
}

// tableColumns fetches column info then FK info sequentially — with
// MaxOpenConns(1) a nested query while rows are open would deadlock.
func (a *Adapter) tableColumns(ctx context.Context, table string) ([]engines.ColumnInfo, error) {
	rows, err := a.db.QueryContext(ctx,
		"SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info(?)", table)
	if err != nil {
		return nil, err
	}
	var out []engines.ColumnInfo
	for rows.Next() {
		var c engines.ColumnInfo
		var notnull, pk int
		var def sql.NullString
		if err := rows.Scan(&c.Name, &c.Type, &notnull, &def, &pk); err != nil {
			rows.Close()
			return nil, err
		}
		if c.Type == "" {
			c.Type = "text"
		}
		c.Nullable = notnull == 0
		if def.Valid {
			s := def.String
			c.Default = &s
		}
		c.PrimaryKey = pk > 0
		out = append(out, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	fkRows, err := a.db.QueryContext(ctx,
		"SELECT \"table\", \"from\", \"to\" FROM pragma_foreign_key_list(?)", table)
	if err != nil {
		return nil, err
	}
	fks := map[string]engines.ColumnForeignKey{}
	for fkRows.Next() {
		var tbl, from, to string
		if err := fkRows.Scan(&tbl, &from, &to); err != nil {
			fkRows.Close()
			return nil, err
		}
		fks[from] = engines.ColumnForeignKey{Table: tbl, Column: to}
	}
	fkRows.Close()
	if err := fkRows.Err(); err != nil {
		return nil, err
	}

	for i := range out {
		if fk, ok := fks[out[i].Name]; ok {
			fkCopy := fk
			out[i].ForeignKey = &fkCopy
		}
	}
	return out, nil
}

func (a *Adapter) GetTableColumns(ctx context.Context, tableID string) ([]engines.ColumnInfo, error) {
	return a.tableColumns(ctx, tableID)
}

func (a *Adapter) GetCompletions(ctx context.Context, _ *string) ([]engines.TableCompletions, error) {
	tables, err := a.ListTables(ctx, nil)
	if err != nil {
		return nil, err
	}
	out := make([]engines.TableCompletions, 0, len(tables))
	for _, t := range tables {
		cols, err := a.tableColumns(ctx, t.Name)
		if err != nil {
			return nil, err
		}
		out = append(out, engines.TableCompletions{Name: t.Name, Columns: cols})
	}
	return out, nil
}

func (a *Adapter) GetTableIndexes(ctx context.Context, tableID string) ([]engines.IndexInfo, error) {
	rows, err := a.db.QueryContext(ctx,
		"SELECT name, \"unique\", origin FROM pragma_index_list(?)", tableID)
	if err != nil {
		return nil, err
	}
	var out []engines.IndexInfo
	for rows.Next() {
		var idx engines.IndexInfo
		var unique int
		var origin string
		if err := rows.Scan(&idx.Name, &unique, &origin); err != nil {
			rows.Close()
			return nil, err
		}
		idx.Unique = unique != 0
		idx.Primary = origin == "pk"
		out = append(out, idx)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range out {
		colRows, err := a.db.QueryContext(ctx, "SELECT name FROM pragma_index_info(?)", out[i].Name)
		if err != nil {
			return nil, err
		}
		for colRows.Next() {
			var c string
			if err := colRows.Scan(&c); err != nil {
				colRows.Close()
				return nil, err
			}
			out[i].Columns = append(out[i].Columns, c)
		}
		colRows.Close()
		if err := colRows.Err(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (a *Adapter) PreviewRows(ctx context.Context, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
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
	sb.WriteString(esc(input.TableID))

	if input.Search != "" {
		cols, err := a.tableColumns(ctx, input.TableID)
		if err != nil {
			return nil, err
		}
		var targetCols []string
		for _, col := range cols {
			if input.SearchColumn != "" && col.Name != input.SearchColumn {
				continue
			}
			if isSearchableColumn(col.Type, input.Search) {
				targetCols = append(targetCols, col.Name)
			}
		}
		if len(targetCols) > 0 {
			clauses := make([]string, len(targetCols))
			for i, name := range targetCols {
				if input.MatchCase {
					clauses[i] = "instr(" + esc(name) + ", ?) > 0"
					params = append(params, input.Search)
				} else {
					clauses[i] = esc(name) + " LIKE ?"
					params = append(params, "%"+input.Search+"%")
				}
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
	sb.WriteString(" LIMIT ? OFFSET ?")
	params = append(params, limit, offset)

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

// returnsData mirrors better-sqlite3's stmt.returnsData check: statements
// with a result set go through query, writes through exec for changes count.
var returningStmt = regexp.MustCompile(`(?i)^\s*(SELECT|WITH|EXPLAIN|PRAGMA|VALUES)`)

func (a *Adapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	start := time.Now()
	if !returningStmt.MatchString(input.Query) {
		res, err := a.db.ExecContext(ctx, input.Query, input.Params...)
		if err != nil {
			return nil, err
		}
		affected, _ := res.RowsAffected()
		return &engines.QueryResult{
			Columns:    []engines.QueryColumn{},
			Rows:       []map[string]any{},
			RowCount:   affected,
			DurationMs: float64(time.Since(start).Milliseconds()),
		}, nil
	}
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

// RunQueryBounded is the MCP read: ordinal rows (array mode), stops after
// maxRows+1 so a large result never materializes. The ctx deadline mirrors
// the worker-kill budget.
func (a *Adapter) RunQueryBounded(ctx context.Context, input engines.BoundedQueryInput) (*engines.BoundedQueryResult, error) {
	start := time.Now()
	rowLimit := input.MaxRows
	if rowLimit < 1 {
		rowLimit = 1
	}
	rows, err := a.db.QueryContext(ctx, input.Query)
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
			typ = strings.ToLower(types[i].DatabaseTypeName())
		}
		qcols[i] = engines.QueryColumn{Name: name, Type: typ}
	}
	out := [][]any{}
	truncated := false
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		vals := make([]any, len(names))
		ptrs := make([]any, len(names))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		if int64(len(out)) < rowLimit {
			row := make([]any, len(vals))
			for i := range vals {
				row[i] = normalizeValue(vals[i])
			}
			out = append(out, row)
		} else {
			truncated = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &engines.BoundedQueryResult{
		Columns:    qcols,
		Rows:       out,
		DurationMs: float64(time.Since(start).Milliseconds()),
		Truncated:  truncated,
	}, nil
}

func (a *Adapter) GetTableStats(ctx context.Context, tableID string) (*engines.TableStats, error) {
	stats := &engines.TableStats{TableID: tableID, Name: tableID, Schema: "main"}
	if err := a.db.QueryRowContext(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM %s", esc(tableID))).Scan(&stats.RowEstimate); err != nil {
		return nil, err
	}
	if err := a.db.QueryRowContext(ctx,
		"SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()").Scan(&stats.TotalBytes); err != nil {
		return nil, err
	}
	stats.NLiveTup = stats.RowEstimate
	return stats, nil
}

func (a *Adapter) GetIndexStats(ctx context.Context, tableID string) ([]engines.IndexStats, error) {
	indexes, err := a.GetTableIndexes(ctx, tableID)
	if err != nil {
		return nil, err
	}
	out := make([]engines.IndexStats, len(indexes))
	for i, idx := range indexes {
		out[i] = engines.IndexStats{
			Name:    idx.Name,
			Table:   tableID,
			Columns: idx.Columns,
			Unique:  idx.Unique,
			Primary: idx.Primary,
		}
	}
	return out, nil
}

func (a *Adapter) GetDatabaseSizes(ctx context.Context, _ *string) ([]engines.DatabaseSize, error) {
	rows, err := a.db.QueryContext(ctx,
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'dbstat' AND sql NOT LIKE '%vec0%' ORDER BY name")
	if err != nil {
		return nil, err
	}
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return nil, err
		}
		names = append(names, name)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var totalSize int64
	if err := a.db.QueryRowContext(ctx,
		"SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()").Scan(&totalSize); err != nil {
		return nil, err
	}

	out := make([]engines.DatabaseSize, 0, len(names))
	var totalRows int64
	counts := make([]int64, len(names))
	for i, name := range names {
		if err := a.db.QueryRowContext(ctx,
			fmt.Sprintf("SELECT COUNT(*) FROM %s", esc(name))).Scan(&counts[i]); err != nil {
			return nil, err
		}
		totalRows += counts[i]
	}
	for i, name := range names {
		var size int64
		if totalRows > 0 {
			size = counts[i] * totalSize / totalRows
		}
		out = append(out, engines.DatabaseSize{
			Schema: "main", Table: name, SizeBytes: size,
			TotalBytes: size, RowEstimate: counts[i],
		})
	}
	return out, nil
}

func (a *Adapter) GetActiveConnections(ctx context.Context) ([]engines.ConnectionInfo, error) {
	return []engines.ConnectionInfo{{
		PID:             1,
		Usename:         "sqlite",
		ApplicationName: "kamehadb",
		BackendStart:    time.Now().UTC().Format(time.RFC3339),
		State:           "active",
	}}, nil
}

func (a *Adapter) Close() error {
	return a.db.Close()
}

// TestSqliteConnection mirrors testSqliteConnection: open, probe, close.
func TestSqliteConnection(ctx context.Context, cp engines.ConnProfile) (*engines.TestConnectionResult, error) {
	if cp.FilePath == "" {
		return &engines.TestConnectionResult{Success: false, Message: "SQLite file path is required"}, nil
	}
	a, err := New(cp)
	if err != nil {
		return &engines.TestConnectionResult{Success: false, Message: err.Error()}, nil
	}
	defer a.Close()
	return a.TestConnection(ctx)
}
