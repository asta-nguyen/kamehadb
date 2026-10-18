package api

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/schema"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

func TestTTLCacheExpiry(t *testing.T) {
	c := newTTLCache()
	c.set("k", 42)
	if got := c.get("k", schemaCacheTime); got == nil || got.(int) != 42 {
		t.Fatal("expected cache hit")
	}
	if got := c.get("k", time.Nanosecond); got != nil {
		t.Fatal("expected expiry at zero-ish ttl")
	}
	if got := c.get("missing", schemaCacheTime); got != nil {
		t.Fatal("expected miss")
	}
}

func TestTTLCacheLRUEviction(t *testing.T) {
	c := newTTLCache()
	for i := 0; i < cacheMaxEntries+10; i++ {
		c.set(string(rune('a'+i%26))+string(rune('0'+i/26)), i)
	}
	if len(c.items) != cacheMaxEntries {
		t.Fatalf("expected %d entries, got %d", cacheMaxEntries, len(c.items))
	}
}

func TestClearConnectionCache(t *testing.T) {
	c := newTTLCache()
	c.set("sql:conn-1:tables", 1)
	c.set("sql:conn-12:tables", 2)
	c.set("other:conn-1", 3)
	c.clearConnection("conn-1")
	if c.get("sql:conn-1:tables", schemaCacheTime) != nil {
		t.Fatal("conn-1 key should be cleared")
	}
	if c.get("other:conn-1", schemaCacheTime) != nil {
		t.Fatal("conn-1 suffix key should be cleared")
	}
	if got := c.get("sql:conn-12:tables", schemaCacheTime); got == nil {
		t.Fatal("conn-12 must survive conn-1 clear")
	}
}

func TestRunQueryUnsafe(t *testing.T) {
	s := NewSqlService(nil, newTTLCache())
	if _, err := s.RunQuery("conn-1", engines.RunQueryInput{Query: "DROP TABLE x"}); err == nil {
		t.Fatal("unsafe query should be rejected before adapter lookup")
	}
}

// TestSchemaCaptureEndToEnd captures a real snapshot through the sqlite
// adapter, then diffs two snapshots like the route layer does.
func TestSchemaCaptureEndToEnd(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/meta.db"
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	dataPath := dir + "/data.sqlite"
	raw, err := sql.Open("sqlite", dataPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"); err != nil {
		t.Fatal(err)
	}
	raw.Close()

	name, kind, fp := "test", engines.KindSQLite, dataPath
	prof, err := st.CreateProfile(store.ProfileInput{Name: &name, Kind: &kind, FilePath: &fp})
	if err != nil {
		t.Fatal(err)
	}
	id := prof.ID

	registry := engines.NewRegistry(st)
	watcher := schema.NewWatcherManager(st)
	svc := NewSchemaService(st, registry, watcher)

	res, err := svc.CaptureSchemaSnapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	if res.TableCount != 1 {
		t.Fatalf("expected 1 table, got %+v", res)
	}

	snaps, err := svc.GetSchemaSnapshots(id)
	if err != nil {
		t.Fatal(err)
	}
	list := snaps["snapshots"].([]schema.SnapshotSummary)
	if len(list) != 1 || list[0].ID != res.ID {
		t.Fatalf("%+v", snaps)
	}

	// Mutate the schema, recapture, diff.
	raw2, _ := sql.Open("sqlite", dataPath)
	_, _ = raw2.Exec("ALTER TABLE users ADD COLUMN email TEXT")
	_, _ = raw2.Exec("CREATE TABLE orders (id INTEGER)")
	raw2.Close()

	res2, err := svc.CaptureSchemaSnapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	diff, err := svc.GetSchemaDiff(id, schema.DiffInput{FromSnapshotID: res.ID, ToSnapshotID: res2.ID})
	if err != nil {
		t.Fatal(err)
	}
	if diff.Stats.TableAdds != 1 || diff.Stats.ColumnAdds != 1 {
		t.Fatalf("expected 1 table add + 1 col add: %+v", diff.Stats)
	}

	cl, err := svc.GetSchemaChangelog(id)
	if err != nil || len(cl.Entries) != 2 {
		t.Fatalf("%+v %v", cl, err)
	}
	if len(cl.Entries[1].Changes) != 2 {
		t.Fatalf("expected 2 changelog changes: %+v", cl.Entries[1].Changes)
	}

	mig, err := svc.GenerateMigration(id, schema.DiffInput{FromSnapshotID: res.ID, ToSnapshotID: res2.ID})
	if err != nil {
		t.Fatal(err)
	}
	if mig.Dialect != schema.DialectSQLite {
		t.Fatalf("dialect: %s", mig.Dialect)
	}

	// Cross-connection snapshot reads must not leak.
	other, err := svc.loadSnapshot("other-conn", res.ID)
	if err != nil || other != nil {
		t.Fatalf("cross-conn snapshot leaked: %+v", other)
	}
}

func TestWatcherStatusDefaults(t *testing.T) {
	st, err := store.Open(t.TempDir() + "/m.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	w := schema.NewWatcherManager(st)
	status := w.Status("conn-x")
	if status.CadenceRunning || status.NotifyRunning {
		t.Fatal("nothing should be running")
	}
	if status.IntervalMs != schema.WatcherDefaultIntervalMs {
		t.Fatalf("default interval: %d", status.IntervalMs)
	}

	// StartCadence persists config and flips cadenceRunning.
	w.StartCadence("conn-x", schema.WatcherMinIntervalMs)
	defer w.StopAll()
	if !w.Status("conn-x").CadenceRunning {
		t.Fatal("cadence should be running")
	}
	cfg, _ := st.GetSchemaWatcher("conn-x")
	if cfg == nil || !cfg.CadenceEnabled {
		t.Fatal("watcher config not persisted")
	}
	w.StopCadence("conn-x")
	if w.Status("conn-x").CadenceRunning {
		t.Fatal("cadence should be stopped")
	}
	cfg, _ = st.GetSchemaWatcher("conn-x")
	if cfg.CadenceEnabled {
		t.Fatal("config should be disabled after stop")
	}

	// StartNotify rejects non-postgres kinds.
	if err := w.StartNotify("conn-x"); err == nil {
		t.Fatal("expected pg-only error")
	}
}

func TestConnProfileFromInputPreservesRootCA(t *testing.T) {
	kind, host, pem := engines.KindPostgres, "db.local", "test-root-ca-pem"
	ssl := true
	cp := connProfileFromInput(store.ProfileInput{Kind: &kind, Host: &host, SSL: &ssl, SSLCACert: &pem})
	if cp.Kind != kind || cp.Host != host || !cp.SSL || cp.SSLCACert != pem {
		t.Fatalf("connection profile = %+v, want Root CA input preserved", cp)
	}
}

func TestUpdateConnectionAllowsRootCAChangeWithManagedAccount(t *testing.T) {
	st, err := store.Open(t.TempDir() + "/m.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	name, kind, host, username, password, oldPEM := "postgres", engines.KindPostgres, "db.local", "user", "password", "old-root-ca"
	ssl := true
	profile, err := st.CreateProfile(store.ProfileInput{
		Name: &name, Kind: &kind, Host: &host, Username: &username, Password: &password,
		SSL: &ssl, SSLCACert: &oldPEM,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateMCPManagedAccount(profile.ID, "managed-account"); err != nil {
		t.Fatal(err)
	}

	service := NewConnectionsService(st, engines.NewRegistry(st))
	cacheCleared := false
	service.onCacheClear = func(id string) { cacheCleared = id == profile.ID }
	newPEM := "new-root-ca"
	updated, err := service.UpdateConnection(profile.ID, store.ProfileInput{SSLCACert: &newPEM})
	if err != nil || updated.SSLCACert == nil || *updated.SSLCACert != newPEM || !cacheCleared {
		t.Fatalf("Root CA update = (%+v, %v), cache invalidated = %v", updated, err, cacheCleared)
	}

	ssl = false
	if _, err := service.UpdateConnection(profile.ID, store.ProfileInput{SSL: &ssl}); err == nil {
		t.Fatal("SSL toggle should remain protected while the managed MCP account exists")
	}
}

func TestUpdateConnectionSurvivesUnreadableVaultKey(t *testing.T) {
	st, err := store.Open(t.TempDir() + "/m.db")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	name, kind, uri := "mongo-test", engines.KindMongoDB, "mongodb://localhost:27017"
	profile, err := st.CreateProfile(store.ProfileInput{
		Name: &name, Kind: &kind, ConnectionString: &uri,
	})
	if err != nil {
		t.Fatal(err)
	}

	service := NewConnectionsService(st, engines.NewRegistry(st))
	newName := "mongo-renamed"
	updated, err := service.UpdateConnection(profile.ID, store.ProfileInput{Name: &newName})
	if err != nil {
		t.Fatalf("UpdateConnection failed: %v", err)
	}
	if updated.Name != newName {
		t.Errorf("updated name = %q, want %q", updated.Name, newName)
	}
}
