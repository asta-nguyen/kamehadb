package api

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/mongo"
	"github.com/asta-nguyen/kamehadb/internal/store"
	"github.com/asta-nguyen/kamehadb/internal/terminal"
)

// MongoService ports routes/mongo.ts: collection browsing, find/aggregate,
// document update/delete, stats, command, autocomplete, and the mongosh
// PTY shell (via the shared terminal manager + Wails events).
type MongoService struct {
	st      *store.Store
	term    *terminal.Manager
	dataDir string

	mu       sync.Mutex
	adapters map[string]*mongo.Adapter
	cache    *ttlCache
	requests *requestJobs
}

func NewMongoService(st *store.Store, term *terminal.Manager, cache *ttlCache) *MongoService {
	dataDir, _ := store.DataDir()
	return &MongoService{
		st:       st,
		term:     term,
		dataDir:  dataDir,
		adapters: map[string]*mongo.Adapter{},
		cache:    cache,
		requests: newRequestJobs(),
	}
}

// getAdapter mirrors getNonSqlAdapter(MONGODB): cached adapter built from
// the profile's connection string; wrong-kind profiles are rejected.
func (s *MongoService) getAdapter(connectionID string) (*mongo.Adapter, error) {
	return s.getAdapterContext(context.Background(), connectionID)
}

// An invalidated request must not publish a newly constructed stale-profile
// client. Check again under the cache lock before transferring ownership.
func (s *MongoService) getAdapterContext(ctx context.Context, connectionID string) (*mongo.Adapter, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	if a, ok := s.adapters[connectionID]; ok {
		s.mu.Unlock()
		return a, nil
	}
	s.mu.Unlock()

	p, err := s.st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errConnectionNotFound
	}
	if p.Kind != engines.KindMongoDB {
		return nil, fmt.Errorf("Connection %s is not a mongodb connection", connectionID)
	}
	connStr := ""
	if p.ConnectionString != nil {
		connStr = *p.ConnectionString
	}
	database := ""
	if p.Database != nil {
		database = *p.Database
	}
	a, err := mongo.New(mongo.Config{ConnectionString: connStr, Database: database})
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	if err := ctx.Err(); err != nil {
		s.mu.Unlock()
		_ = a.Close(context.Background())
		return nil, err
	}
	if cached := s.adapters[connectionID]; cached != nil {
		s.mu.Unlock()
		_ = a.Close(context.Background())
		return cached, nil
	}
	s.adapters[connectionID] = a
	s.mu.Unlock()
	return a, nil
}

// Invalidate drops the cached adapter + cache entries for a profile change.
func (s *MongoService) Invalidate(connectionID string) {
	s.mu.Lock()
	if a, ok := s.adapters[connectionID]; ok {
		delete(s.adapters, connectionID)
		a.Close(context.Background())
	}
	s.mu.Unlock()
	s.cache.clearConnection(connectionID)
}

// CloseAll drops every cached adapter — shutdown path.
func (s *MongoService) CloseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, a := range s.adapters {
		a.Close(context.Background())
		delete(s.adapters, id)
	}
}

// Shutdown kills cached adapters plus every shell on the shared terminal
// manager (killAllMongoShells). Other services sharing the manager stop too.
func (s *MongoService) Shutdown() {
	s.CloseAll()
	s.term.Shutdown()
}

// ListMongoDatabases — GET /mongo/:id/databases (TTL-cached).
func (s *MongoService) ListMongoDatabases(connectionID string) ([]engines.DatabaseInfo, error) {
	key := fmt.Sprintf("mongo:%s:databases", connectionID)
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]engines.DatabaseInfo), nil
	}
	a, err := s.getAdapter(connectionID)
	if err != nil {
		return nil, err
	}
	out, err := a.ListDatabases(context.Background())
	if err != nil {
		return nil, err
	}
	s.cache.set(key, out)
	return out, nil
}

// ListMongoCollections — GET /mongo/:id/collections?database=.
func (s *MongoService) ListMongoCollections(connectionID, database string) ([]mongo.CollectionInfo, error) {
	key := fmt.Sprintf("mongo:%s:collections:%s", connectionID, database)
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.([]mongo.CollectionInfo), nil
	}
	a, err := s.getAdapter(connectionID)
	if err != nil {
		return nil, err
	}
	out, err := a.ListCollections(context.Background(), database)
	if err != nil {
		return nil, err
	}
	s.cache.set(key, out)
	return out, nil
}

// FindMongoDocuments — POST /mongo/:id/find.
func (s *MongoService) FindMongoDocuments(connectionID string, input mongo.FindDocumentsInput) (*mongo.DocumentResult, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	a, err := s.getAdapterContext(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	return a.FindDocuments(job.ctx, input)
}

// AggregateMongoDocuments — POST /mongo/:id/aggregate.
func (s *MongoService) AggregateMongoDocuments(connectionID string, input mongo.AggregateInput) (*mongo.DocumentResult, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	a, err := s.getAdapterContext(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	return a.Aggregate(job.ctx, input)
}

// MongoDeleteInput mirrors the delete route body.
type MongoDeleteInput struct {
	Collection string         `json:"collection"`
	Database   string         `json:"database,omitempty"`
	Filter     map[string]any `json:"filter"`
}

// DeleteMongoDocument — POST /mongo/:id/delete. Filter must be non-empty.
func (s *MongoService) DeleteMongoDocument(connectionID string, input MongoDeleteInput) (map[string]int64, error) {
	if len(input.Filter) == 0 {
		return nil, errors.New("filter must not be empty")
	}
	p, err := s.st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errConnectionNotFound
	}
	a, err := s.getAdapter(connectionID)
	if err != nil {
		return nil, err
	}
	return a.DeleteDocument(context.Background(), input.Database, input.Collection, input.Filter)
}

// MongoUpdateInput mirrors the update route body.
type MongoUpdateInput struct {
	Collection string         `json:"collection"`
	Database   string         `json:"database,omitempty"`
	Filter     map[string]any `json:"filter"`
	Update     map[string]any `json:"update"`
}

// UpdateMongoDocument — POST /mongo/:id/update.
func (s *MongoService) UpdateMongoDocument(connectionID string, input MongoUpdateInput) (map[string]int64, error) {
	if len(input.Filter) == 0 {
		return nil, errors.New("filter must not be empty")
	}
	p, err := s.st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errConnectionNotFound
	}
	a, err := s.getAdapter(connectionID)
	if err != nil {
		return nil, err
	}
	return a.UpdateDocument(context.Background(), input.Database, input.Collection, input.Filter, input.Update)
}

// GetMongoCollectionStats — GET /mongo/:id/stats.
func (s *MongoService) GetMongoCollectionStats(connectionID, database, collection string) (*mongo.CollectionStats, error) {
	if database == "" || collection == "" {
		return nil, errors.New("database and collection are required")
	}
	a, err := s.getAdapter(connectionID)
	if err != nil {
		return nil, err
	}
	return a.GetCollectionStats(context.Background(), database, collection)
}

// RunMongoCommand — POST /mongo/:id/command.
func (s *MongoService) RunMongoCommand(connectionID, database string, command map[string]any) (any, error) {
	return s.RunMongoCommandWithRequest(connectionID, mongo.MongoCommandRequest{Database: database, Command: command})
}

// Preserve the legacy arguments while allowing new UI callers to cancel only
// their command. Cancellation is not rollback and no command is replayed.
func (s *MongoService) RunMongoCommandWithRequest(connectionID string, input mongo.MongoCommandRequest) (any, error) {
	job, err := s.requests.begin(connectionID, input.RequestID)
	if err != nil {
		return nil, err
	}
	defer s.requests.finish(job)
	a, err := s.getAdapterContext(job.ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if err := job.ctx.Err(); err != nil {
		return nil, err
	}
	result, err := a.RunCommand(job.ctx, input.Database, input.Command)
	if job.ctx.Err() != nil {
		return nil, fmt.Errorf("Mongo command cancelled; it may already have executed; do not replay automatically: %w", job.ctx.Err())
	}
	return result, err
}

// GetMongoCompletions — GET /mongo/:id/autocomplete. Collection names plus
// fields sampled from one doc (index-key fallback for empty collections),
// bounded to 8 concurrent samples like the TS worker pool.
func (s *MongoService) GetMongoCompletions(connectionID, database string) (map[string]any, error) {
	key := fmt.Sprintf("mongo:%s:completions:%s", connectionID, database)
	if cached := s.cache.get(key, schemaCacheTime); cached != nil {
		return cached.(map[string]any), nil
	}
	a, err := s.getAdapter(connectionID)
	if err != nil {
		return nil, err
	}
	collections, err := a.ListCollections(context.Background(), database)
	if err != nil {
		return nil, err
	}

	type entry struct {
		Name   string   `json:"name"`
		Fields []string `json:"fields"`
	}
	result := make([]entry, len(collections))
	const concurrency = 8
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	for i, coll := range collections {
		wg.Add(1)
		go func(i int, name string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			fields := []string{}
			sample, err := a.FindDocuments(context.Background(), mongo.FindDocumentsInput{
				Collection: name, Database: database, Limit: 1,
			})
			if err == nil && len(sample.Documents) > 0 {
				for k := range sample.Documents[0] {
					fields = append(fields, k)
				}
			} else {
				stats, serr := a.GetCollectionStats(context.Background(), database, name)
				if serr == nil {
					seen := map[string]bool{}
					for _, idx := range stats.Indexes {
						for key := range idx.Key {
							if key != "_id" && !seen[key] {
								seen[key] = true
								fields = append(fields, key)
							}
						}
					}
				}
			}
			result[i] = entry{Name: name, Fields: fields}
		}(i, coll.Name)
	}
	wg.Wait()
	out := map[string]any{"collections": result}
	s.cache.set(key, out)
	return out, nil
}

// --- mongosh shell — PTY sessions via the shared terminal manager ---

// StartMongoShell — POST /mongo/:id/shell.
func (s *MongoService) StartMongoShell(connectionID string, cols, rows int) (map[string]string, error) {
	p, err := s.st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errConnectionNotFound
	}
	connStr := ""
	if p.ConnectionString != nil {
		connStr = *p.ConnectionString
	}
	cmd, err := mongo.ResolveMongosh(s.dataDir)
	if err != nil {
		return nil, err
	}
	args := append(append([]string{}, cmd.ArgsPrefix...), connStr)
	id, err := s.term.Spawn(cmd.Program, args, uint16(cols), uint16(rows), nil)
	if err != nil {
		return nil, fmt.Errorf("mongosh failed to start: %w", err)
	}
	return map[string]string{"sessionId": id}, nil
}

// AttachMongoShell replaces the SSE stream endpoint: returns buffered
// output, then live output flows on the terminal:<id> Wails event.
func (s *MongoService) AttachMongoShell(sessionID string) (string, error) {
	return s.term.Attach(sessionID)
}

// WriteMongoShell — POST /mongo/shell/:sessionId/write.
func (s *MongoService) WriteMongoShell(sessionID, data string) error {
	return s.term.Write(sessionID, data)
}

// PingMongoShell — the frontend's aliveness probe (204/404 equivalent).
func (s *MongoService) PingMongoShell(sessionID string) bool {
	return s.term.Alive(sessionID)
}

// StopMongoShell — DELETE /mongo/shell/:sessionId.
func (s *MongoService) StopMongoShell(sessionID string) error {
	return s.term.Kill(sessionID)
}

// ResizeMongoShell — POST /mongo/shell/:sessionId/resize.
func (s *MongoService) ResizeMongoShell(sessionID string, cols, rows int) error {
	return s.term.Resize(sessionID, uint16(cols), uint16(rows))
}
