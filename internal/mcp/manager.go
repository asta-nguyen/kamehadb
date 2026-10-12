package mcp

import (
	"context"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	mysqladapter "github.com/asta-nguyen/kamehadb/internal/engines/mysql"
	pgadapter "github.com/asta-nguyen/kamehadb/internal/engines/postgres"
	sqliteadapter "github.com/asta-nguyen/kamehadb/internal/engines/sqlite"
	mssqladapter "github.com/asta-nguyen/kamehadb/internal/engines/sqlserver"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	mongoadapter "github.com/asta-nguyen/kamehadb/internal/mongo"
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
	sql      SqlRead
	mongo    MongoRead
	inflight int
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
	switch {
	case s.kind == engines.KindSQLite:
		if err := assertSqliteTarget(database, schema); err != nil {
			return nil, err
		}
	case s.kind == engines.KindMySQL || s.kind == engines.KindMariaDB:
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
	switch {
	case s.kind == engines.KindSQLite:
		if err := assertSqliteTarget(database, schema); err != nil {
			return nil, err
		}
		return s.adapter.GetTableColumns(ctx, table)
	case s.kind == engines.KindMySQL || s.kind == engines.KindMariaDB:
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
	cp := engines.ConnProfile{
		Kind: profile.Kind, Database: database,
		Username: credential.Username, Password: credential.Password, HasPassword: true,
	}
	if profile.Host != nil {
		cp.Host = *profile.Host
	}
	if profile.Port != nil {
		cp.Port = *profile.Port
	}
	if profile.SSL {
		cp.SSL = true
	}
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
	if !profile.MCPEnabled || !engines.IsMCPSupportedKind(profile.Kind) {
		return false
	}
	if !engines.IsMCPServerKind(profile.Kind) {
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
	if !profile.MCPEnabled || !engines.IsMCPSupportedKind(profile.Kind) {
		return nil, newToolError(ErrProfileNotEnabled, "This connection is not enabled for MCP")
	}

	serverKind := engines.IsMCPServerKind(profile.Kind)
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

	if e.kind == "mongo" {
		if e.mongo == nil {
			adapter, err := createMongoAdapter(profile, credential)
			if err != nil {
				return nil, err
			}
			if adapter == nil {
				return nil, newToolError(ErrProfileNotEnabled, "MongoDB connection is not configured")
			}
			e.mongo = adapter
		}
		return fn(&Connection{Kind: "mongo", Mongo: e.mongo, Profile: profile})
	}

	if e.sql == nil {
		adapter, err := createSqlAdapter(profile, credential)
		if err != nil {
			return nil, err
		}
		if adapter == nil {
			return nil, newToolError(ErrProfileNotEnabled, "This engine is not supported for MCP")
		}
		e.sql = adapter
	}
	return fn(&Connection{Kind: "sql", SQL: e.sql, Profile: profile})
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

func closeEntry(e *entry) {
	ctx := context.Background()
	if e.sql != nil {
		if err := e.sql.Close(); err != nil {
			logs.Debug("mcp", "adapter close failed: "+err.Error())
		}
	}
	if e.mongo != nil {
		if err := e.mongo.Close(ctx); err != nil {
			logs.Debug("mcp", "adapter close failed: "+err.Error())
		}
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
