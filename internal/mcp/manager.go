package mcp

import (
	"context"
	"sync"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	mongoadapter "github.com/asta-nguyen/kamehadb/dbcore/providers/mongo"
	mysqladapter "github.com/asta-nguyen/kamehadb/dbcore/providers/mysql"
	pgadapter "github.com/asta-nguyen/kamehadb/dbcore/providers/postgres"
	sqliteadapter "github.com/asta-nguyen/kamehadb/dbcore/providers/sqlite"
	mssqladapter "github.com/asta-nguyen/kamehadb/dbcore/providers/sqlserver"
	appengines "github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// Constants from sidecar lib/constants.ts.
const (
	QueryTimeoutMs               int64 = 30_000
	DefaultRowLimit              int64 = 100
	MaxRowLimit                  int64 = 1_000
	MaxMetadataItems                   = 1_000
	MaxMongoSkip                 int64 = 100_000
	MaxConcurrentCallsPerProfile       = 4
)

// SqlRead is the narrow read-only SQL surface exposed to MCP tools.
type SqlRead interface {
	ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error)
	ListSchemas(ctx context.Context, database *string) ([]engines.SchemaInfo, error)
	ListTables(ctx context.Context, database, schema *string) ([]engines.TableInfo, error)
	GetTableColumns(ctx context.Context, table string, database, schema *string) ([]engines.ColumnInfo, error)
	RunQueryBounded(ctx context.Context, in engines.BoundedQueryInput) (*engines.BoundedQueryResult, error)
	Close() error
}

// MongoRead is the read-only Mongo surface — writing methods are never
// forwarded.
type MongoRead interface {
	ListDatabases(ctx context.Context) ([]mongoadapter.DatabaseInfo, error)
	ListCollections(ctx context.Context, database string) ([]mongoadapter.CollectionInfo, error)
	FindBounded(ctx context.Context, in mongoadapter.BoundedFindInput) (*mongoadapter.BoundedResult, error)
	AggregateBounded(ctx context.Context, in mongoadapter.BoundedAggregateInput) (*mongoadapter.BoundedResult, error)
	Close(ctx context.Context) error
}

// Connection wraps a scoped adapter plus the profile it serves.
type Connection struct {
	Kind    string // "sql" | "mongo"
	SQL     SqlRead
	Mongo   MongoRead
	Profile *store.Profile
}

type entry struct {
	kind     string
	inflight int // guarded by AdapterManager.mu

	// createMu serializes adapter creation so concurrent first calls share one
	// adapter. Invalidate never takes it, so closing an entry never waits on a
	// slow connect. mu guards sql, mongo and closed and is only held briefly.
	createMu sync.Mutex
	mu       sync.Mutex
	sql      SqlRead
	mongo    MongoRead
	closed   bool
}

// current returns the cached adapters, or closed when the entry was retired.
func (e *entry) current() (sqlAdapter SqlRead, mongoAdapter MongoRead, closed bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.sql, e.mongo, e.closed
}

// errConnectionUpdated is returned to a call that raced with Invalidate; a retry
// builds a fresh adapter from the current profile and credential.
func errConnectionUpdated() error {
	return newToolError(ErrBusy, "This connection was updated during the call; retry shortly")
}

// connection returns the entry's adapter, creating it on first use. If the entry
// is retired (Invalidate, CloseAll) while the adapter is being created, the new
// adapter is closed here instead of being stored on an entry nobody will close.
func (e *entry) connection(profile *store.Profile, credential *store.MCPCredentialBundle) (*Connection, error) {
	e.createMu.Lock()
	defer e.createMu.Unlock()

	sqlAdapter, mongoAdapter, closed := e.current()
	if closed {
		return nil, errConnectionUpdated()
	}
	if e.kind == "mongo" {
		if mongoAdapter == nil {
			adapter, err := createMongoAdapter(profile, credential)
			if err != nil {
				return nil, err
			}
			if adapter == nil {
				return nil, newToolError(ErrProfileNotEnabled, "MongoDB connection is not configured")
			}
			e.mu.Lock()
			if e.closed {
				e.mu.Unlock()
				closeMongoAdapter(adapter)
				return nil, errConnectionUpdated()
			}
			e.mongo = adapter
			e.mu.Unlock()
			mongoAdapter = adapter
		}
		return &Connection{Kind: "mongo", Mongo: mongoAdapter, Profile: profile}, nil
	}
	if sqlAdapter == nil {
		adapter, err := newSQLAdapter(profile, credential)
		if err != nil {
			return nil, err
		}
		if adapter == nil {
			return nil, newToolError(ErrProfileNotEnabled, "This engine is not supported for MCP")
		}
		e.mu.Lock()
		if e.closed {
			e.mu.Unlock()
			closeSQLAdapter(adapter)
			return nil, errConnectionUpdated()
		}
		e.sql = adapter
		e.mu.Unlock()
		sqlAdapter = adapter
	}
	return &Connection{Kind: "sql", SQL: sqlAdapter, Profile: profile}, nil
}

// assertDatabaseScope keeps tool arguments inside the database authorized for
// the managed account.
func assertDatabaseScope(configured, requested *string) error {
	configuredValue := ""
	if configured != nil {
		configuredValue = *configured
	}
	if configuredValue == "" || (requested != nil && *requested != "" && *requested != configuredValue) {
		return newToolError(ErrInvalidArguments, "MCP access is limited to the configured database")
	}
	return nil
}

func assertSqliteTarget(database, schema *string) error {
	dbOK := database == nil || *database == "" || *database == "main"
	schemaOK := schema == nil || *schema == "" || *schema == "main"
	if !dbOK || !schemaOK {
		return newToolError(ErrInvalidArguments, "SQLite MCP metadata is limited to the main database")
	}
	return nil
}

// mysqlTargetDatabase merges database/schema — MySQL treats them as synonyms.
func mysqlTargetDatabase(database, schema *string) (*string, error) {
	if database != nil && schema != nil && *database != "" && *schema != "" && *database != *schema {
		return nil, newToolError(ErrInvalidArguments, "MySQL and MariaDB use the same name for database and schema")
	}
	if database != nil && *database != "" {
		return database, nil
	}
	return schema, nil
}

// sqlScoped wraps a concrete adapter with the per-kind scoping rules from
// adapters/factory.ts.
type sqlScoped struct {
	profile *store.Profile
	kind    string
	adapter engines.SQLAdapter
	bounded engines.BoundedReader
}

func (s *sqlScoped) ListDatabases(ctx context.Context) ([]engines.DatabaseInfo, error) {
	if s.kind == engines.KindSQLite {
		return s.adapter.ListDatabases(ctx)
	}
	database, err := requireDatabase(s.profile)
	if err != nil {
		return nil, err
	}
	return []engines.DatabaseInfo{{Name: database}}, nil
}

func (s *sqlScoped) ListSchemas(ctx context.Context, database *string) ([]engines.SchemaInfo, error) {
	if s.kind == engines.KindSQLite {
		if err := assertSqliteTarget(database, nil); err != nil {
			return nil, err
		}
		return s.adapter.ListSchemas(ctx, nil)
	}
	if err := assertDatabaseScope(s.profile.Database, database); err != nil {
		return nil, err
	}
	schemas, err := s.adapter.ListSchemas(ctx, nil)
	if err != nil {
		return nil, err
	}
	if s.kind == engines.KindMySQL || s.kind == engines.KindMariaDB {
		configured := ""
		if s.profile.Database != nil {
			configured = *s.profile.Database
		}
		out := schemas[:0]
		for _, sch := range schemas {
			if sch.Name == configured {
				out = append(out, sch)
			}
		}
		return out, nil
	}
	return schemas, nil
}

func (s *sqlScoped) ListTables(ctx context.Context, database, schema *string) ([]engines.TableInfo, error) {
	switch s.kind {
	case engines.KindSQLite:
		if err := assertSqliteTarget(database, schema); err != nil {
			return nil, err
		}
	case engines.KindMySQL, engines.KindMariaDB:
		target, err := mysqlTargetDatabase(database, schema)
		if err != nil {
			return nil, err
		}
		if err := assertDatabaseScope(s.profile.Database, target); err != nil {
			return nil, err
		}
		return s.adapter.ListTables(ctx, nil)
	default:
		if err := assertDatabaseScope(s.profile.Database, database); err != nil {
			return nil, err
		}
	}
	return s.adapter.ListTables(ctx, schema)
}

func (s *sqlScoped) GetTableColumns(ctx context.Context, table string, database, schema *string) ([]engines.ColumnInfo, error) {
	switch s.kind {
	case engines.KindSQLite:
		if err := assertSqliteTarget(database, schema); err != nil {
			return nil, err
		}
		return s.adapter.GetTableColumns(ctx, table)
	case engines.KindMySQL, engines.KindMariaDB:
		target, err := mysqlTargetDatabase(database, schema)
		if err != nil {
			return nil, err
		}
		if err := assertDatabaseScope(s.profile.Database, target); err != nil {
			return nil, err
		}
		return s.adapter.GetTableColumns(ctx, table)
	default:
		if err := assertDatabaseScope(s.profile.Database, database); err != nil {
			return nil, err
		}
		if schema != nil && *schema != "" {
			return s.adapter.GetTableColumns(ctx, *schema+"."+table)
		}
		return s.adapter.GetTableColumns(ctx, table)
	}
}

func (s *sqlScoped) RunQueryBounded(ctx context.Context, in engines.BoundedQueryInput) (*engines.BoundedQueryResult, error) {
	return s.bounded.RunQueryBounded(ctx, in)
}

func (s *sqlScoped) Close() error { return s.adapter.Close() }

// mongoScoped scopes all calls to the profile's configured database.
type mongoScoped struct {
	profile *store.Profile
	adapter *mongoadapter.Adapter
}

func (m *mongoScoped) ListDatabases(ctx context.Context) ([]mongoadapter.DatabaseInfo, error) {
	database, err := requireDatabase(m.profile)
	if err != nil {
		return nil, err
	}
	return []mongoadapter.DatabaseInfo{{Name: database}}, nil
}

func (m *mongoScoped) ListCollections(ctx context.Context, database string) ([]mongoadapter.CollectionInfo, error) {
	if err := assertDatabaseScope(m.profile.Database, &database); err != nil {
		return nil, err
	}
	return m.adapter.ListCollections(ctx, database)
}

func (m *mongoScoped) FindBounded(ctx context.Context, in mongoadapter.BoundedFindInput) (*mongoadapter.BoundedResult, error) {
	if err := assertDatabaseScope(m.profile.Database, &in.Database); err != nil {
		return nil, err
	}
	return m.adapter.FindBounded(ctx, in)
}

func (m *mongoScoped) AggregateBounded(ctx context.Context, in mongoadapter.BoundedAggregateInput) (*mongoadapter.BoundedResult, error) {
	if err := assertDatabaseScope(m.profile.Database, &in.Database); err != nil {
		return nil, err
	}
	return m.adapter.AggregateBounded(ctx, in)
}

func (m *mongoScoped) Close(ctx context.Context) error { return m.adapter.Close(ctx) }

// newSQLAdapter is a variable only so tests can slow or observe adapter creation.
var newSQLAdapter = createSqlAdapter

// createSqlAdapter builds a dedicated MCP-owned adapter with managed
// credentials — never the shared UI adapter cache (adapters/factory.ts).
func createSqlAdapter(profile *store.Profile, credential *store.MCPCredentialBundle) (SqlRead, error) {
	if profile.Kind == engines.KindSQLite {
		if profile.FilePath == nil || *profile.FilePath == "" {
			return nil, nil
		}
		adapter, err := sqliteadapter.NewMCP(*profile.FilePath)
		if err != nil {
			return nil, err
		}
		return &sqlScoped{profile: profile, kind: profile.Kind, adapter: adapter, bounded: adapter}, nil
	}
	database, err := requireDatabase(profile)
	if err != nil {
		return nil, err
	}
	if credential == nil || credential.Kind != profile.Kind {
		return nil, nil
	}
	cp := sqlProfileFor(profile, database, credential.Username, credential.Password)
	var adapter engines.SQLAdapter
	switch profile.Kind {
	case engines.KindPostgres:
		adapter, err = pgadapter.NewWithTimeout(cp, QueryTimeoutMs)
	case engines.KindMySQL, engines.KindMariaDB:
		adapter, err = mysqladapter.NewWithTimeout(cp, QueryTimeoutMs)
	case engines.KindSQLServer:
		adapter, err = mssqladapter.NewWithTimeout(cp, QueryTimeoutMs)
	default:
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	bounded, ok := adapter.(engines.BoundedReader)
	if !ok {
		adapter.Close()
		return nil, nil
	}
	return &sqlScoped{profile: profile, kind: profile.Kind, adapter: adapter, bounded: bounded}, nil
}

// createMongoAdapter builds the read-only Mongo surface.
func createMongoAdapter(profile *store.Profile, credential *store.MCPCredentialBundle) (MongoRead, error) {
	if profile.Kind != engines.KindMongoDB || profile.Database == nil ||
		credential == nil || credential.Kind != engines.KindMongoDB {
		return nil, nil
	}
	adapter, err := mongoadapter.New(mongoadapter.Config{
		ConnectionString: credential.ConnectionString,
		Database:         *profile.Database,
	})
	if err != nil {
		return nil, err
	}
	return &mongoScoped{profile: profile, adapter: adapter}, nil
}

// AdapterManager owns MCP-only adapter instances keyed by profile id —
// re-checks the allowlist on every call, caps per-profile concurrency at 4,
// and closes adapters when a profile is toggled off, edited, or deleted.
type AdapterManager struct {
	st          *store.Store
	mu          sync.Mutex
	entries     map[string]*entry
	credentials map[string]*store.MCPCredentialBundle
}

func NewAdapterManager(st *store.Store) *AdapterManager {
	return &AdapterManager{st: st, entries: map[string]*entry{}, credentials: map[string]*store.MCPCredentialBundle{}}
}

// SetCredential keeps secrets only in process memory and discards adapters
// created with an older credential.
func (m *AdapterManager) SetCredential(profileID string, credential *store.MCPCredentialBundle) {
	m.mu.Lock()
	m.credentials[profileID] = credential
	m.mu.Unlock()
	m.Invalidate(profileID)
}

func (m *AdapterManager) ClearCredential(profileID string) {
	m.mu.Lock()
	delete(m.credentials, profileID)
	m.mu.Unlock()
	m.Invalidate(profileID)
}

func (m *AdapterManager) HasCredential(profileID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.credentials[profileID]
	return ok
}

func (m *AdapterManager) GetCredential(profileID string) *store.MCPCredentialBundle {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.credentials[profileID]
}

// CanServe mirrors manager.canServe — sqlite needs no managed account.
func (m *AdapterManager) CanServe(profile *store.Profile) bool {
	if !profile.MCPEnabled || !appengines.IsMCPSupportedKind(profile.Kind) {
		return false
	}
	if !appengines.IsMCPServerKind(profile.Kind) {
		return profile.Kind == engines.KindSQLite
	}
	account, err := m.st.GetMCPManagedAccount(profile.ID)
	if err != nil || account == nil || account.State != store.MCPStateReady {
		return false
	}
	return m.HasCredential(profile.ID)
}

func (m *AdapterManager) entryFor(profile *store.Profile) *entry {
	e := m.entries[profile.ID]
	if e == nil {
		kind := "sql"
		if profile.Kind == engines.KindMongoDB {
			kind = "mongo"
		}
		e = &entry{kind: kind}
		m.entries[profile.ID] = e
	}
	return e
}

// WithConnection runs fn under the allowlist + concurrency guards.
func (m *AdapterManager) WithConnection(ctx context.Context, connectionID string, fn func(*Connection) (any, error)) (any, error) {
	profile, err := m.st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, newToolError(ErrProfileNotFound, "Unknown connection: "+connectionID)
	}
	if !profile.MCPEnabled || !appengines.IsMCPSupportedKind(profile.Kind) {
		return nil, newToolError(ErrProfileNotEnabled, "This connection is not enabled for MCP")
	}

	serverKind := appengines.IsMCPServerKind(profile.Kind)
	if serverKind {
		account, err := m.st.GetMCPManagedAccount(profile.ID)
		if err != nil {
			return nil, err
		}
		if account == nil || account.State != store.MCPStateReady {
			return nil, newToolError(ErrManagedAccountNotReady, "Create a managed read-only account first")
		}
	}
	credential := m.GetCredential(profile.ID)
	if serverKind && credential == nil {
		return nil, newToolError(ErrManagedCredentialUnavailable, "The managed account credential is unavailable from local storage")
	}

	m.mu.Lock()
	e := m.entryFor(profile)
	if e.inflight >= MaxConcurrentCallsPerProfile {
		m.mu.Unlock()
		return nil, newToolError(ErrBusy, "Too many concurrent MCP calls for this connection; retry shortly")
	}
	e.inflight++
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		e.inflight--
		m.mu.Unlock()
	}()

	conn, err := e.connection(profile, credential)
	if err != nil {
		return nil, err
	}
	return fn(conn)
}

// Invalidate drops and closes the cached adapter so a disabled/edited/deleted
// profile cannot serve calls through a stale connection.
func (m *AdapterManager) Invalidate(connectionID string) {
	m.mu.Lock()
	e := m.entries[connectionID]
	delete(m.entries, connectionID)
	m.mu.Unlock()
	if e == nil {
		return
	}
	closeEntry(e)
}

// closeEntry retires the entry for good: after it returns no call can create or
// reuse an adapter on it. It only takes the brief state lock, so it never waits
// on an adapter that is still connecting; that creator closes its own adapter.
func closeEntry(e *entry) {
	e.mu.Lock()
	e.closed = true
	sqlAdapter, mongoAdapter := e.sql, e.mongo
	e.sql, e.mongo = nil, nil
	e.mu.Unlock()

	if sqlAdapter != nil {
		closeSQLAdapter(sqlAdapter)
	}
	if mongoAdapter != nil {
		closeMongoAdapter(mongoAdapter)
	}
}

func closeSQLAdapter(adapter SqlRead) {
	if err := adapter.Close(); err != nil {
		logs.Debug("mcp", "adapter close failed: "+err.Error())
	}
}

func closeMongoAdapter(adapter MongoRead) {
	if err := adapter.Close(context.Background()); err != nil {
		logs.Debug("mcp", "adapter close failed: "+err.Error())
	}
}

// CloseAll drops every adapter and credential.
func (m *AdapterManager) CloseAll() {
	m.mu.Lock()
	entries := m.entries
	m.entries = map[string]*entry{}
	m.credentials = map[string]*store.MCPCredentialBundle{}
	m.mu.Unlock()
	for _, e := range entries {
		closeEntry(e)
	}
}
