package api

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/dbcore/sqlsafety"
	appengines "github.com/asta-nguyen/kamehadb/internal/engines"
)

// CompletionsResult wraps the tables list the autocomplete endpoint returns.
type CompletionsResult struct {
	Tables []engines.TableCompletions `json:"tables"`
}

// SqlService replaces routes/sql.ts: schema browsing, query execution, and
// stats. The metadata cache + per-connection query cancel map mirror the
// sidecar behavior.
type SqlService struct {
	lookup   appengines.SQLLookup
	readOnly func(string) (bool, error)
	cache    *ttlCache

	queriesMu sync.Mutex
	queries   map[string]string
	requests  *requestJobs

	exportsMu        sync.Mutex
	exportsWG        sync.WaitGroup
	exports          map[string]context.CancelFunc
	cancelledExports map[string]time.Time
	exportRoot       context.Context
	exportCancel     context.CancelFunc
	exportsClosed    bool
}

func NewSqlService(lookup appengines.SQLLookup, cache *ttlCache, readOnly func(string) (bool, error)) *SqlService {
	root, cancel := context.WithCancel(context.Background())
	return &SqlService{
		lookup: lookup, readOnly: readOnly, cache: cache, queries: map[string]string{}, requests: newRequestJobs(),
		exports: map[string]context.CancelFunc{}, cancelledExports: map[string]time.Time{},
		exportRoot: root, exportCancel: cancel,
	}
}

// connectionReadOnly resolves the persisted GUI write policy. A nil lookup
// (fixtures that only exercise read paths) fails closed to read-only. (Why)
func (s *SqlService) connectionReadOnly(connectionID string) (bool, error) {
	if s.readOnly == nil {
		return true, nil
	}
	return s.readOnly(connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	return s.getTableColumns(context.Background(), connectionID, tableID)
}

// Reuse the metadata cache while keeping a preview's cancellation alive
// during an uncached column read; hits do not introduce another native job.
func (s *SqlService) getTableColumns(ctx context.Context, connectionID, tableID string) ([]engines.ColumnInfo, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	key := "sql:" + connectionID + ":columns:" + tableID
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.ColumnInfo), nil
	}
	adapter, err := s.lookup.Get(ctx, connectionID)
	if err != nil {
		return nil, err
	}
	cols, err := adapter.GetTableColumns(ctx, tableID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	adapter, err := s.lookup.Get(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	planner, plansWithMetadata := adapter.(engines.MetadataPreviewer)
	var columns []engines.ColumnInfo
	if input.SortColumn != "" || plansWithMetadata {
		// Both sort validation and seek planning use the existing TTL cache,
		// avoiding duplicate information_schema reads for each page.
		columns, err = s.getTableColumns(job.ctx, connectionID, input.TableID)
		if err != nil {
			return nil, err
		}
	}
	if input.SortColumn != "" {
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
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	if plansWithMetadata {
		return planner.PreviewRowsWithColumns(job.ctx, input, columns)
	}
	return adapter.PreviewRows(job.ctx, input)
}

// Each query owns an ID before lookup. The connection slot is legacy-only;
// its completion guard cannot erase a newer request's cancellation target.
func (s *SqlService) RunQuery(connectionID string, input engines.RunQueryInput) (*engines.QueryResult, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	readOnly, err := s.connectionReadOnly(connectionID)
	if err != nil {
		return nil, err
	}
	if readOnly {
		if safe, reason := sqlsafety.Check(input.Query); !safe {
			return nil, errors.New(reason)
		}
	} else if safe, reason := sqlsafety.CheckSingleStatement(input.Query); !safe {
		return nil, errors.New(reason)
	}
	adapter, err := s.lookup.Get(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	s.queriesMu.Lock()
	s.queries[connectionID] = job.id
	s.queriesMu.Unlock()
	defer func() {
		s.queriesMu.Lock()
		if s.queries[connectionID] == job.id {
			delete(s.queries, connectionID)
		}
		s.queriesMu.Unlock()
	}()
	return adapter.RunQuery(job.ctx, input)
}

// CancelQuery aborts the running query for a connection, if any.
func (s *SqlService) CancelQuery(connectionID string) {
	s.queriesMu.Lock()
	defer s.queriesMu.Unlock()
	if id, ok := s.queries[connectionID]; ok {
		_, _ = s.requests.cancel(id)
	}
}

// All managed GUI services share this owner; exports use CancelExport.
func (s *SqlService) CancelRequest(id string) (bool, error) {
	return s.requests.cancel(id)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
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
	adapter, err := s.lookup.Get(context.Background(), connectionID)
	if err != nil {
		return nil, err
	}
	lister, ok := adapter.(engines.SessionLister)
	if !ok {
		return []engines.ConnectionInfo{}, nil
	}
	return lister.GetActiveConnections(context.Background())
}
