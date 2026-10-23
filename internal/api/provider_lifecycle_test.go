package api

import (
	"context"
	"errors"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	dbmongo "github.com/asta-nguyen/kamehadb/dbcore/mongo"
	dbredis "github.com/asta-nguyen/kamehadb/dbcore/redis"
	"github.com/asta-nguyen/kamehadb/internal/database"
	appengines "github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
	keyringpkg "github.com/zalando/go-keyring"
)

// testDBEmpty builds the facade over a bare registry so fixtures count
// factory/close calls without touching real drivers.
func testDBEmpty(t *testing.T, loader dbcore.ProfileLoader) *database.DB {
	t.Helper()
	reg := dbcore.NewRegistry()
	db := &database.DB{Registry: reg, Manager: dbcore.NewManager(loader, reg), Loader: loader}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// mapLoader resolves per-id configs without a metadata store.
type mapLoader map[string]engines.ConnProfile

func (l mapLoader) ProfileForConnect(id string) (engines.ConnProfile, error) {
	cp, ok := l[id]
	if !ok {
		return engines.ConnProfile{}, errConnectionNotFound
	}
	return cp, nil
}

// lifecycleProvider exposes whichever family capabilities the fixture sets.
type lifecycleProvider struct {
	onClose func() error
	sql     engines.SQLAdapter
	mongo   dbmongo.Operations
	redis   dbredis.Operations
}

func (p *lifecycleProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}

func (p *lifecycleProvider) Close() error {
	if p.onClose != nil {
		return p.onClose()
	}
	return nil
}
func (p *lifecycleProvider) SQL() engines.SQLAdapter   { return p.sql }
func (p *lifecycleProvider) Mongo() dbmongo.Operations { return p.mongo }
func (p *lifecycleProvider) Redis() dbredis.Operations { return p.redis }

// fakeMongoOps satisfies dbmongo.Operations without a driver.
type fakeMongoOps struct{}

func (fakeMongoOps) TestConnection(context.Context) (*dbmongo.TestConnectionResult, error) {
	return &dbmongo.TestConnectionResult{Success: true}, nil
}

func (fakeMongoOps) ListDatabases(context.Context) ([]dbmongo.DatabaseInfo, error) {
	return []dbmongo.DatabaseInfo{}, nil
}

func (fakeMongoOps) ListCollections(context.Context, string) ([]dbmongo.CollectionInfo, error) {
	return []dbmongo.CollectionInfo{}, nil
}

func (fakeMongoOps) FindDocuments(context.Context, dbmongo.FindDocumentsInput) (*dbmongo.DocumentResult, error) {
	return &dbmongo.DocumentResult{}, nil
}

func (fakeMongoOps) CountDocuments(context.Context, dbmongo.CountDocumentsInput) (*dbmongo.CountResult, error) {
	return &dbmongo.CountResult{}, nil
}

func (fakeMongoOps) Aggregate(context.Context, dbmongo.AggregateInput) (*dbmongo.DocumentResult, error) {
	return &dbmongo.DocumentResult{}, nil
}

func (fakeMongoOps) RunCommand(context.Context, string, any) (any, error) {
	return nil, errors.New("not implemented")
}

func (fakeMongoOps) UpdateDocument(context.Context, string, string, map[string]any, map[string]any) (map[string]int64, error) {
	return nil, errors.New("not implemented")
}

func (fakeMongoOps) DeleteDocument(context.Context, string, string, map[string]any) (map[string]int64, error) {
	return nil, errors.New("not implemented")
}

func (fakeMongoOps) FindBounded(context.Context, dbmongo.BoundedFindInput) (*dbmongo.BoundedResult, error) {
	return &dbmongo.BoundedResult{}, nil
}

func (fakeMongoOps) AggregateBounded(context.Context, dbmongo.BoundedAggregateInput) (*dbmongo.BoundedResult, error) {
	return &dbmongo.BoundedResult{}, nil
}

func (fakeMongoOps) GetCollectionStats(context.Context, string, string) (*dbmongo.CollectionStats, error) {
	return &dbmongo.CollectionStats{}, nil
}

// fakeRedisOps satisfies dbredis.Operations without a driver.
type fakeRedisOps struct{}

func (fakeRedisOps) TestConnection(context.Context) (*dbredis.TestConnectionResult, error) {
	return &dbredis.TestConnectionResult{Success: true}, nil
}

func (fakeRedisOps) GetStats(context.Context) (*dbredis.RedisStats, error) {
	return &dbredis.RedisStats{}, nil
}
func (fakeRedisOps) GetTTL(context.Context, string) (int64, error) { return -1, nil }
func (fakeRedisOps) ForRequest(context.Context) (dbredis.RequestOperations, func()) {
	return fakeRedisRequest{}, func() {}
}

type fakeRedisRequest struct{}

func (fakeRedisRequest) ScanKeys(context.Context, dbredis.ScanKeysInput) (*dbredis.KeyPage, error) {
	return &dbredis.KeyPage{}, nil
}

func (fakeRedisRequest) GetKey(context.Context, string) (*dbredis.RedisValue, error) {
	return &dbredis.RedisValue{}, nil
}

func (fakeRedisRequest) GetKeyPage(context.Context, dbredis.RedisValuePageInput) (*dbredis.RedisValuePage, error) {
	return &dbredis.RedisValuePage{}, nil
}
func (fakeRedisRequest) GetTTL(context.Context, string) (int64, error) { return -1, nil }
func (fakeRedisRequest) RunCommand(context.Context, string) (*dbredis.CommandResult, error) {
	return &dbredis.CommandResult{}, nil
}
func (fakeRedisRequest) ReleaseCursor(string) bool { return true }

// lifecycleAdapter backs schema capture and AI context paths.
type lifecycleAdapter struct {
	engines.UnsupportedAdapter
	closed *atomic.Int32
}

func (a *lifecycleAdapter) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}

func (a *lifecycleAdapter) RunQuery(context.Context, engines.RunQueryInput) (*engines.QueryResult, error) {
	return &engines.QueryResult{}, nil
}

func (a *lifecycleAdapter) ListSchemas(context.Context, *string) ([]engines.SchemaInfo, error) {
	return []engines.SchemaInfo{{Name: "public"}}, nil
}

func (a *lifecycleAdapter) ListTables(context.Context, *string) ([]engines.TableInfo, error) {
	return []engines.TableInfo{{ID: "public.t", Name: "t", Schema: "public"}}, nil
}

func (a *lifecycleAdapter) GetTableColumns(context.Context, string) ([]engines.ColumnInfo, error) {
	return []engines.ColumnInfo{{Name: "id", Type: "int"}}, nil
}

func (a *lifecycleAdapter) Close() error {
	if a.closed != nil {
		a.closed.Add(1)
	}
	return nil
}

// registerLifecycle wires counted fake factories for the three families.
type lifecycleFakes struct {
	sqlCalls, mongoCalls, redisCalls *atomic.Int32
	sqlClose, mongoClose, redisClose *atomic.Int32
	adapter                          *lifecycleAdapter
}

func newLifecycleFakes(t *testing.T, db *database.DB) *lifecycleFakes {
	t.Helper()
	f := &lifecycleFakes{
		sqlCalls: new(atomic.Int32), mongoCalls: new(atomic.Int32), redisCalls: new(atomic.Int32),
		sqlClose: new(atomic.Int32), mongoClose: new(atomic.Int32), redisClose: new(atomic.Int32),
	}
	f.adapter = &lifecycleAdapter{closed: f.sqlClose}
	must := func(kind string, factory dbcore.Factory) {
		t.Helper()
		if err := db.Registry.Register(kind, factory); err != nil {
			t.Fatal(err)
		}
	}
	must(engines.KindPostgres, func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		f.sqlCalls.Add(1)
		return &lifecycleProvider{sql: f.adapter, onClose: f.adapter.Close}, nil
	})
	must(engines.KindSQLite, func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		f.sqlCalls.Add(1)
		return &lifecycleProvider{sql: f.adapter, onClose: f.adapter.Close}, nil
	})
	must(engines.KindMongoDB, func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		f.mongoCalls.Add(1)
		closes := f.mongoClose
		return &lifecycleProvider{mongo: fakeMongoOps{}, onClose: func() error { closes.Add(1); return nil }}, nil
	})
	must(engines.KindRedis, func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		f.redisCalls.Add(1)
		closes := f.redisClose
		return &lifecycleProvider{redis: fakeRedisOps{}, onClose: func() error { closes.Add(1); return nil }}, nil
	})
	return f
}

func TestUnsavedPostgresAndMySQLTestsUseOneShotHelpers(t *testing.T) {
	service := &ConnectionsService{}
	for _, kind := range []string{engines.KindPostgres, engines.KindMySQL} {
		t.Run(kind, func(t *testing.T) {
			_, err := service.testConnectionByKind("", engines.ConnProfile{
				Kind: kind, Host: "invalid.invalid", SSL: true, SSLCACert: "not a certificate",
			})
			if err == nil || err.Error() != "invalid Root CA PEM" {
				t.Fatalf("invalid Root CA error = %v, want helper validation before dialing", err)
			}
		})
	}
}

// One manager serves every consumer: SQL query, schema capture and the AI
// schema-context lookup share one construction for the same connection id.
func TestProviderLifecycleOneOwnerAcrossServices(t *testing.T) {
	root := t.TempDir()
	metadata, err := store.Open(filepath.Join(root, "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()
	loader := mapLoader{"shared": {Kind: engines.KindPostgres, Host: "h", Port: 5432, Database: "d", Username: "u", Password: "p", HasPassword: true}}
	db := testDBEmpty(t, loader)
	f := newLifecycleFakes(t, db)
	services := NewServices(metadata, db, nil, nil)
	// RunQuery resolves the persisted GUI write policy before provider lookup.
	if _, err := metadata.DB().Exec(
		`INSERT INTO connection_profiles (id, name, kind, read_only) VALUES ('shared', 'shared', 'postgres', 1)`); err != nil {
		t.Fatal(err)
	}

	reqID := "q1"
	if _, err := services.SQL.RunQuery("shared", engines.RunQueryInput{Query: "SELECT 1", RequestID: &reqID}); err != nil {
		t.Fatal(err)
	}
	if _, err := services.Schemas.CaptureSchemaSnapshot("shared"); err != nil {
		t.Fatal(err)
	}
	if _, err := services.AI.lookup.Get(context.Background(), "shared"); err != nil {
		t.Fatal(err)
	}
	if f.sqlCalls.Load() != 1 {
		t.Fatalf("three services built %d providers, want 1", f.sqlCalls.Load())
	}
	services.CloseRequests()
}

// Family ConfigChecks reject before factory dispatch with the exact GUI
// messages; accepted callers see a single construction.
func TestProviderLifecycleWrongFamilyZeroConstructors(t *testing.T) {
	loader := mapLoader{
		"pg":    {Kind: engines.KindPostgres, Host: "h", Port: 5432, Database: "d", Username: "u", Password: "p", HasPassword: true},
		"mongo": {Kind: engines.KindMongoDB, ConnectionString: "mongodb://h:27017"},
		"redis": {Kind: engines.KindRedis, Host: "h", Port: 6379},
		"tb":    {Kind: appengines.KindTigerBeetle, Host: "h", Port: 3000},
		"nopw":  {Kind: engines.KindPostgres, Host: "h", Port: 5432, Database: "d", Username: "u"},
	}
	db := testDBEmpty(t, loader)
	f := newLifecycleFakes(t, db)

	if _, err := db.Mongo(context.Background(), "pg"); err == nil || err.Error() != "Connection pg is not a mongodb connection" {
		t.Fatalf("mongo on sql profile: %v", err)
	}
	if _, err := db.Redis(context.Background(), "pg"); err == nil || err.Error() != "This endpoint is for redis connections only" {
		t.Fatalf("redis on sql profile: %v", err)
	}
	// SQL lookup on a redis profile must be rejected by the ConfigCheck before
	// dispatch — a Redis provider must not be constructed for it.
	if _, err := db.Get(context.Background(), "redis"); err == nil || err.Error() != "Use /redis endpoint for Redis connections" {
		t.Fatalf("sql on redis profile: %v", err)
	}
	if _, err := db.Get(context.Background(), "mongo"); err == nil || err.Error() != "Use /mongo endpoint for MongoDB connections" {
		t.Fatalf("sql on mongo profile: %v", err)
	}
	if _, err := db.Get(context.Background(), "tb"); err == nil || err.Error() != "TigerBeetle is not a SQL database" {
		t.Fatalf("sql on tigerbeetle profile: %v", err)
	}
	if _, err := db.Get(context.Background(), "nopw"); err == nil || err.Error() != "Password not saved. Open connection settings and save with password." {
		t.Fatalf("missing password: %v", err)
	}
	if f.sqlCalls.Load()+f.mongoCalls.Load()+f.redisCalls.Load() != 0 {
		t.Fatal("rejected lookups dispatched a factory")
	}
	if _, err := db.Get(context.Background(), "pg"); err != nil {
		t.Fatal(err)
	}
	if f.sqlCalls.Load() != 1 {
		t.Fatal("accepted lookup did not construct")
	}
}

// Saved SQL health reuses the managed provider; saved Mongo/Redis health and
// unsaved dialog input run fresh uncached probes that close after the call.
func TestProviderLifecycleProbeFreshness(t *testing.T) {
	root := t.TempDir()
	metadata, err := store.Open(filepath.Join(root, "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()
	// In-memory keyring: the vault key and saved secrets round-trip without
	// touching the OS keychain.
	keyring := map[string]string{}
	restore := store.SetKeyringHooksForTest(
		func(s, u string) (string, error) {
			v, ok := keyring[s+"/"+u]
			if !ok {
				return "", keyringpkg.ErrNotFound
			}
			return v, nil
		},
		func(s, u, p string) error { keyring[s+"/"+u] = p; return nil },
	)
	defer restore()
	name, kind := "pg-saved", engines.KindPostgres
	user, pw := "u", "p"
	pg, err := metadata.CreateProfile(store.ProfileInput{Name: &name, Kind: &kind, Username: &user, Password: &pw})
	if err != nil {
		t.Fatal(err)
	}
	mgName, mgKind := "mongo-saved", engines.KindMongoDB
	mg, err := metadata.CreateProfile(store.ProfileInput{Name: &mgName, Kind: &mgKind})
	if err != nil {
		t.Fatal(err)
	}
	rdKind := engines.KindRedis

	db := testDBEmpty(t, metadata)
	f := newLifecycleFakes(t, db)
	svc := NewConnectionsService(metadata, db)

	// Saved SQL health goes through Manager.Get: two rounds share one
	// construction and close nothing.
	for i := 0; i < 2; i++ {
		res, err := svc.CheckConnectionHealth(pg.ID)
		if err != nil || res == nil || !res.Success {
			t.Fatalf("sql health %d: %v %+v", i, err, res)
		}
	}
	if f.sqlCalls.Load() != 1 || f.sqlClose.Load() != 0 {
		t.Fatalf("saved sql health: calls=%d closes=%d, want 1/0", f.sqlCalls.Load(), f.sqlClose.Load())
	}

	// Saved mongo health opens and closes a fresh provider each round.
	for i := 0; i < 2; i++ {
		res, err := svc.CheckConnectionHealth(mg.ID)
		if err != nil || res == nil || !res.Success {
			t.Fatalf("mongo health %d: %v %+v", i, err, res)
		}
	}
	if f.mongoCalls.Load() != 2 || f.mongoClose.Load() != 2 {
		t.Fatalf("mongo health probes: calls=%d closes=%d, want 2/2", f.mongoCalls.Load(), f.mongoClose.Load())
	}

	// Unsaved SQLite input probes uncached through the generic registry path.
	host := "h"
	sqliteKind := engines.KindSQLite
	res, err := svc.TestConnection(store.ProfileInput{Kind: &sqliteKind, Host: &host})
	if err != nil || res == nil || !res.Success {
		t.Fatalf("unsaved sql probe: %v %+v", err, res)
	}
	if f.sqlCalls.Load() != 2 || f.sqlClose.Load() != 1 {
		t.Fatalf("unsaved sql probe: calls=%d closes=%d, want 2/1", f.sqlCalls.Load(), f.sqlClose.Load())
	}
	res, err = svc.TestConnection(store.ProfileInput{Kind: &rdKind, Host: &host})
	if err != nil || res == nil || !res.Success {
		t.Fatalf("unsaved redis probe: %v %+v", err, res)
	}
	if f.redisCalls.Load() != 1 || f.redisClose.Load() != 1 {
		t.Fatalf("unsaved redis probe: calls=%d closes=%d, want 1/1", f.redisCalls.Load(), f.redisClose.Load())
	}
}

// A kind change plus invalidation reloads under the new family and closes the
// previous provider exactly once.
func TestProviderLifecycleKindChangeReload(t *testing.T) {
	loader := mapLoader{
		"swap": {Kind: engines.KindPostgres, Host: "h", Port: 5432, Database: "d", Username: "u", Password: "p", HasPassword: true},
	}
	db := testDBEmpty(t, loader)
	f := newLifecycleFakes(t, db)

	if _, err := db.Mongo(context.Background(), "swap"); err == nil {
		t.Fatal("mongo capability resolved on a postgres profile")
	}
	if _, err := db.Get(context.Background(), "swap"); err != nil {
		t.Fatal(err)
	}
	db.Invalidate("swap")
	if f.sqlClose.Load() != 1 {
		t.Fatal("invalidate did not close the previous provider once")
	}
	loader["swap"] = engines.ConnProfile{Kind: engines.KindMongoDB, ConnectionString: "mongodb://h"}
	if _, err := db.Mongo(context.Background(), "swap"); err != nil {
		t.Fatal(err)
	}
	if f.mongoCalls.Load() != 1 || f.sqlCalls.Load() != 1 {
		t.Fatalf("kind reload: sql=%d mongo=%d", f.sqlCalls.Load(), f.mongoCalls.Load())
	}
	if _, err := db.Get(context.Background(), "swap"); err == nil || err.Error() != "Use /mongo endpoint for MongoDB connections" {
		t.Fatalf("sql lookup after kind change: %v", err)
	}
}

// Profile delete invalidates through the container, closing that entry only;
// a sibling profile keeps its provider. Shutdown is idempotent and
// MongoService.Shutdown leaves providers to the manager owner.
func TestProviderLifecycleIsolationAndShutdown(t *testing.T) {
	loader := mapLoader{
		"c1": {Kind: engines.KindPostgres, Host: "h", Port: 5432, Database: "d", Username: "u", Password: "p", HasPassword: true},
		"c2": {Kind: engines.KindPostgres, Host: "h", Port: 5432, Database: "d", Username: "u", Password: "p", HasPassword: true},
	}
	db := testDBEmpty(t, loader)
	f := newLifecycleFakes(t, db)
	if _, err := db.Get(context.Background(), "c1"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Get(context.Background(), "c2"); err != nil {
		t.Fatal(err)
	}
	if f.sqlCalls.Load() != 2 {
		t.Fatalf("calls=%d", f.sqlCalls.Load())
	}
	db.Invalidate("c1")
	if f.sqlClose.Load() != 1 {
		t.Fatalf("invalidating c1 closed %d providers", f.sqlClose.Load())
	}
	if _, err := db.Get(context.Background(), "c2"); err != nil {
		t.Fatal("sibling entry lost its provider")
	}
	if f.sqlCalls.Load() != 2 {
		t.Fatal("sibling lookup reconstructed")
	}

	// Mongo shell teardown is terminal-owned; providers belong to db.Close.
	root := t.TempDir()
	metadata, err := store.Open(filepath.Join(root, "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()
	services := NewServices(metadata, db, nil, nil)
	loader["m1"] = engines.ConnProfile{Kind: engines.KindMongoDB, ConnectionString: "mongodb://h"}
	if _, err := db.Mongo(context.Background(), "m1"); err != nil {
		t.Fatal(err)
	}
	services.Mongo.Shutdown()
	if f.mongoClose.Load() != 0 {
		t.Fatal("mongo shell shutdown closed the provider")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if f.mongoClose.Load() != 1 || f.sqlClose.Load() != 2 {
		t.Fatalf("close counts: sql=%d mongo=%d", f.sqlClose.Load(), f.mongoClose.Load())
	}
	if err := db.Close(); err != nil {
		t.Fatal("second close not idempotent")
	}
}
