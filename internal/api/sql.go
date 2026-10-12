package api

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/sqlsafety"
)

// CompletionsResult wraps the tables list the autocomplete endpoint returns.
type CompletionsResult struct {
	Tables []engines.TableCompletions `json:"tables"`
}

// SqlService replaces routes/sql.ts: schema browsing, query execution, and
// stats. The metadata cache + per-connection query cancel map mirror the
// sidecar behavior.
type SqlService struct {
	registry *engines.Registry
	cache    *ttlCache

	queriesMu sync.Mutex
	queries   map[string]context.CancelFunc
}

func NewSqlService(reg *engines.Registry, cache *ttlCache) *SqlService {
	return &SqlService{registry: reg, cache: cache, queries: map[string]context.CancelFunc{}}
}

// clearConnectionCache is the clearConnectionCache hook called by
// ConnectionsService on profile create/update/delete.
func (s *SqlService) clearConnectionCache(connectionID string) {
	s.cache.clearConnection(connectionID)
}

func schemaArg(schema string) *string {
	if schema == "" {
		return nil
	}
	return &schema
}

func (s *SqlService) ListDatabases(connectionID string) ([]engines.DatabaseInfo, error) {
	key := "sql:" + connectionID + ":databases"
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.DatabaseInfo), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	dbs, err := adapter.ListDatabases(context.Background())
	if err != nil {
		return nil, err
	}
	s.cache.set(key, dbs)
	return dbs, nil
}

func (s *SqlService) ListSchemas(connectionID string) ([]engines.SchemaInfo, error) {
	key := "sql:" + connectionID + ":schemas"
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.SchemaInfo), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	schemas, err := adapter.ListSchemas(context.Background(), nil)
	if err != nil {
		return nil, err
	}
	s.cache.set(key, schemas)
	return schemas, nil
}

func (s *SqlService) ListTables(connectionID, schema string) ([]engines.TableInfo, error) {
	key := "sql:" + connectionID + ":tables:" + schema
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.TableInfo), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	tables, err := adapter.ListTables(context.Background(), schemaArg(schema))
	if err != nil {
		return nil, err
	}
	s.cache.set(key, tables)
	return tables, nil
}

func (s *SqlService) GetTableColumns(connectionID, tableID string) ([]engines.ColumnInfo, error) {
	key := "sql:" + connectionID + ":columns:" + tableID
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.ColumnInfo), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	cols, err := adapter.GetTableColumns(context.Background(), tableID)
	if err != nil {
		return nil, err
	}
	s.cache.set(key, cols)
	return cols, nil
}

func (s *SqlService) GetTableIndexes(connectionID, tableID string) ([]engines.IndexInfo, error) {
	key := "sql:" + connectionID + ":indexes:" + tableID
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.IndexInfo), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	idx, err := adapter.GetTableIndexes(context.Background(), tableID)
	if err != nil {
		return nil, err
	}
	s.cache.set(key, idx)
	return idx, nil
}

func (s *SqlService) GetCompletions(connectionID, schema string) (*CompletionsResult, error) {
	key := "sql:" + connectionID + ":completions:" + schema
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.(*CompletionsResult), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	tables, err := adapter.GetCompletions(context.Background(), schemaArg(schema))
	if err != nil {
		return nil, err
	}
	result := &CompletionsResult{Tables: tables}
	s.cache.set(key, result)
	return result, nil
}

func (s *SqlService) SearchSchema(connectionID, query, schema string, limit int) ([]engines.SchemaSearchMatch, error) {
	if query == "" {
		return []engines.SchemaSearchMatch{}, nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	searcher, ok := adapter.(engines.SchemaSearcher)
	if !ok {
		return nil, errors.New("Schema search not available for this database type")
	}
	input := engines.SchemaSearchInput{Query: query, Schema: schema}
	// TS validated 0 ≤ limit ≤ 1000 or falls back to adapter default.
	if limit >= 0 && limit <= 1000 {
		input.Limit = &limit
	}
	return searcher.SearchSchema(context.Background(), input)
}

func (s *SqlService) PreviewRows(connectionID string, input engines.PreviewRowsInput) (*engines.QueryResult, error) {
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	// ORDER BY identifiers cannot be parameterized — accept only names the
	// table metadata actually reports (isAllowedSortColumn port).
	if input.SortColumn != "" {
		columns, err := adapter.GetTableColumns(context.Background(), input.TableID)
		if err != nil {
			return nil, err
		}
		allowed := false
		for _, col := range columns {
			if col.Name == input.SortColumn {
				allowed = true
				break
			}
		}
		if !allowed {
			return nil, errors.New("Sort column is not part of the selected table")
		}
	}
	return adapter.PreviewRows(context.Background(), input)
}

// RunQuery registers a cancelable context under the connection so
// CancelQuery can abort an in-flight statement — the fetch-abort it
// replaces.
func (s *SqlService) RunQuery(connectionID string, input engines.RunQueryInput) (*engines.QueryResult, error) {
	if safe, reason := sqlsafety.Check(input.Query); !safe {
		return nil, errors.New(reason)
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	qctx, cancel := context.WithCancel(context.Background())
	s.queriesMu.Lock()
	s.queries[connectionID] = cancel
	s.queriesMu.Unlock()
	defer func() {
		s.queriesMu.Lock()
		delete(s.queries, connectionID)
		s.queriesMu.Unlock()
		cancel()
	}()
	return adapter.RunQuery(qctx, input)
}

// CancelQuery aborts the running query for a connection, if any.
func (s *SqlService) CancelQuery(connectionID string) {
	s.queriesMu.Lock()
	defer s.queriesMu.Unlock()
	if cancel, ok := s.queries[connectionID]; ok {
		cancel()
	}
}

func emptyTableStats(tableID string) *engines.TableStats {
	name := tableID
	schema := ""
	if i := strings.Index(tableID, "."); i >= 0 {
		schema = tableID[:i]
		name = tableID[i+1:]
	}
	return &engines.TableStats{TableID: tableID, Name: name, Schema: schema}
}

func (s *SqlService) GetTableStats(connectionID, tableID string) (*engines.TableStats, error) {
	key := "sql:" + connectionID + ":stats:" + tableID
	if cached := s.cache.get(key, statsCacheTime); cached != nil {
		return cached.(*engines.TableStats), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	statser, ok := adapter.(engines.TableStatser)
	if !ok {
		return emptyTableStats(tableID), nil
	}
	stats, err := statser.GetTableStats(context.Background(), tableID)
	if err != nil {
		return nil, err
	}
	s.cache.set(key, stats)
	return stats, nil
}

func (s *SqlService) GetIndexStats(connectionID, tableID string) ([]engines.IndexStats, error) {
	key := "sql:" + connectionID + ":index-stats:" + tableID
	if cached := s.cache.get(key, statsCacheTime); cached != nil {
		return cached.([]engines.IndexStats), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	statser, ok := adapter.(engines.IndexStatser)
	if !ok {
		return []engines.IndexStats{}, nil
	}
	stats, err := statser.GetIndexStats(context.Background(), tableID)
	if err != nil {
		return nil, err
	}
	s.cache.set(key, stats)
	return stats, nil
}

func (s *SqlService) GetDatabaseSizes(connectionID, schema string) ([]engines.DatabaseSize, error) {
	key := "sql:" + connectionID + ":sizes:" + schema
	if cached := s.cache.get(key, statsCacheTime); cached != nil {
		return cached.([]engines.DatabaseSize), nil
	}
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	sizer, ok := adapter.(engines.DatabaseSizer)
	if !ok {
		return []engines.DatabaseSize{}, nil
	}
	sizes, err := sizer.GetDatabaseSizes(context.Background(), schemaArg(schema))
	if err != nil {
		return nil, err
	}
	s.cache.set(key, sizes)
	return sizes, nil
}

func (s *SqlService) GetActiveConnections(connectionID string) ([]engines.ConnectionInfo, error) {
	adapter, err := s.registry.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	lister, ok := adapter.(engines.SessionLister)
	if !ok {
		return []engines.ConnectionInfo{}, nil
	}
	return lister.GetActiveConnections(context.Background())
}
