package database

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore"
	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	appengines "github.com/asta-nguyen/kamehadb/internal/engines"
)

type testLoader struct{}

func (testLoader) ProfileForConnect(string) (dbcore.Config, error) {
	return dbcore.Config{Kind: "pg"}, nil
}

type countingTestLoader struct {
	cfg   dbcore.Config
	calls atomic.Int32
}

func (l *countingTestLoader) ProfileForConnect(string) (dbcore.Config, error) {
	l.calls.Add(1)
	return l.cfg, nil
}

type fakeProvider struct{}

func (fakeProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}
func (fakeProvider) Close() error { return nil }

// File maintenance must not overlap a managed provider open for the same
// connection: WithMaintenance holds the per-connection lock while fn runs,
// so a concurrent lookup blocks until the file op finishes and the stale
// entry has been invalidated again.
func TestWithMaintenanceSerializesProviderOpens(t *testing.T) {
	release := make(chan struct{})
	var calls atomic.Int32
	reg := dbcore.NewRegistry()
	_ = reg.Register("pg", func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		calls.Add(1)
		return fakeProvider{}, nil
	})
	d := &DB{Manager: dbcore.NewManager(testLoader{}, reg), Loader: testLoader{}, maint: map[string]*sync.RWMutex{}}

	if _, err := d.Manager.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	inMaint := make(chan struct{})
	maintDone := make(chan error, 1)
	go func() {
		maintDone <- d.WithMaintenance("c1", func(_ dbcore.Config) error {
			close(inMaint)
			<-release
			return nil
		}, nil)
	}()
	<-inMaint // maintenance holds the per-connection lock
	got := make(chan error, 1)
	go func() {
		_, err := d.get(context.Background(), "c1", nil)
		got <- err
	}()
	select {
	case err := <-got:
		t.Fatalf("lookup opened a provider during maintenance: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-maintDone; err != nil {
		t.Fatal(err)
	}
	if err := <-got; !errors.Is(err, dbcore.ErrProviderRetired) {
		t.Fatalf("queued lookup after maintenance: %v", err)
	}
	if _, err := d.get(context.Background(), "c1", nil); err != nil {
		t.Fatalf("lookup after maintenance completed: %v", err)
	}
	if n := calls.Load(); n != 2 { // original provider + post-maintenance reopen
		t.Fatalf("factory calls = %d, want 2", n)
	}
}

// A failed file op still invalidates: the next lookup must construct a
// fresh provider rather than reuse a stale handle.
func TestWithMaintenanceInvalidatesOnError(t *testing.T) {
	var calls atomic.Int32
	reg := dbcore.NewRegistry()
	_ = reg.Register("pg", func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		calls.Add(1)
		return fakeProvider{}, nil
	})
	d := &DB{Manager: dbcore.NewManager(testLoader{}, reg), Loader: testLoader{}, maint: map[string]*sync.RWMutex{}}

	if _, err := d.Manager.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	want := errFake
	if err := d.WithMaintenance("c1", func(_ dbcore.Config) error { return want }, nil); err == nil {
		t.Fatal("maintenance error swallowed")
	}
	if _, err := d.get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("factory calls = %d, want 2", n)
	}
}

// The file op must not run when the pre-close fails — the provider may
// still hold the file open.
func TestWithMaintenanceSkipsFileOpWhenCloseFails(t *testing.T) {
	reg := dbcore.NewRegistry()
	_ = reg.Register("pg", func(context.Context, dbcore.Config) (dbcore.Provider, error) {
		return closeFailProvider{err: errFakeClose}, nil
	})
	d := &DB{Manager: dbcore.NewManager(testLoader{}, reg), Loader: testLoader{}, maint: map[string]*sync.RWMutex{}}

	if _, err := d.Manager.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	ran := false
	err := d.WithMaintenance("c1", func(_ dbcore.Config) error {
		ran = true
		return nil
	}, nil)
	if ran || err == nil {
		t.Fatalf("file op ran despite failed provider close: ran=%v err=%v", ran, err)
	}
}

// Two profiles pointing at the same file share the maintenance lock: a
// restore through one profile must retire the other's provider and queue
// its lookups, or the surviving handle keeps writing to a replaced file.
func TestWithMaintenanceSerializesSameFileAcrossProfiles(t *testing.T) {
	fp := filepath.Join(t.TempDir(), "shared.db")
	loader := mapLoader{
		"c1": {Kind: engines.KindSQLite, FilePath: fp},
		"c2": {Kind: engines.KindSQLite, FilePath: fp},
	}
	var calls atomic.Int32
	var closedC2 atomic.Bool
	reg := dbcore.NewRegistry()
	_ = reg.Register(engines.KindSQLite, func(_ context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		calls.Add(1)
		return closeTrackProvider{closed: &closedC2}, nil
	})
	d := &DB{Manager: dbcore.NewManager(loader, reg), Loader: loader, maint: map[string]*sync.RWMutex{}}

	// c2 holds a provider on the shared file.
	if _, err := d.Manager.Get(context.Background(), "c2", nil); err != nil {
		t.Fatal(err)
	}
	inMaint := make(chan struct{})
	release := make(chan struct{})
	maintDone := make(chan error, 1)
	go func() {
		maintDone <- d.WithMaintenance("c1", func(_ dbcore.Config) error {
			if !closedC2.Load() {
				t.Error("file op ran while the same-file provider was still open")
			}
			close(inMaint)
			<-release
			return nil
		}, nil)
	}()
	<-inMaint // maintenance owns the file
	got := make(chan error, 1)
	go func() {
		_, err := d.get(context.Background(), "c2", nil)
		got <- err
	}()
	select {
	case err := <-got:
		t.Fatalf("same-file lookup opened a provider during maintenance: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-maintDone; err != nil {
		t.Fatal(err)
	}
	if err := <-got; !errors.Is(err, dbcore.ErrProviderRetired) {
		t.Fatalf("same-file lookup after maintenance: %v", err)
	}
	if _, err := d.get(context.Background(), "c2", nil); err != nil {
		t.Fatalf("same-file lookup after maintenance completed: %v", err)
	}
}

// The lookup's single profile load must feed both the maintenance lock and
// provider construction — a profile update landing between two reads would
// otherwise open the new path while holding the old path's read lock.
func TestGetConstructsFromTheLockCheckedConfig(t *testing.T) {
	f1 := filepath.Join(t.TempDir(), "a.db")
	f2 := filepath.Join(t.TempDir(), "b.db")
	loader := &flipLoader{
		first: dbcore.Config{Kind: engines.KindSQLite, FilePath: f1},
		next:  dbcore.Config{Kind: engines.KindSQLite, FilePath: f2},
	}
	var gotPath string
	reg := dbcore.NewRegistry()
	_ = reg.Register(engines.KindSQLite, func(_ context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		gotPath = cfg.FilePath
		return fakeProvider{}, nil
	})
	d := &DB{Manager: dbcore.NewManager(loader, reg), Loader: loader, maint: map[string]*sync.RWMutex{}}
	if _, err := d.get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	if gotPath != f1 {
		t.Fatalf("provider built on %q while the read lock covered %q", gotPath, f1)
	}
	if loader.calls.Load() != 1 {
		t.Fatalf("loader ran %d times; the lock-checked load must be the only one", loader.calls.Load())
	}
}

// A profile update lands between lookups: the cached entry still holds the
// old file. The next get must retire that entry and rebuild under the
// freshly loaded config — under the NEW file's read lock, not the old one.
func TestGetReplacesEntryBuiltFromStaleConfig(t *testing.T) {
	f1 := filepath.Join(t.TempDir(), "a.db")
	f2 := filepath.Join(t.TempDir(), "b.db")
	loader := &flipLoader{
		first: dbcore.Config{Kind: engines.KindSQLite, FilePath: f1},
		next:  dbcore.Config{Kind: engines.KindSQLite, FilePath: f2},
	}
	var paths []string
	var mu sync.Mutex
	var closedOld atomic.Bool
	reg := dbcore.NewRegistry()
	_ = reg.Register(engines.KindSQLite, func(_ context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		mu.Lock()
		paths = append(paths, cfg.FilePath)
		mu.Unlock()
		return closeTrackProvider{closed: &closedOld}, nil
	})
	d := &DB{Manager: dbcore.NewManager(loader, reg), Loader: loader, maint: map[string]*sync.RWMutex{}}
	if _, err := d.get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	// Profile updates invalidate the manager entry before the next lookup, so
	// the new config is loaded once and supplies both the lock and factory.
	d.Invalidate("c1")
	if _, err := d.get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	if !closedOld.Load() {
		t.Fatal("stale-config entry was not retired")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(paths) != 2 || paths[1] != f2 {
		t.Fatalf("providers built on %v, want second on %q", paths, f2)
	}
}

// The after hook runs while the write lock still holds: same-file lookups
// queued during maintenance must not proceed until caller cleanup finished.
func TestWithMaintenanceRunsAfterHookBeforeReleasingReaders(t *testing.T) {
	fp := filepath.Join(t.TempDir(), "shared.db")
	loader := mapLoader{
		"c1": {Kind: engines.KindSQLite, FilePath: fp},
		"c2": {Kind: engines.KindSQLite, FilePath: fp},
	}
	reg := dbcore.NewRegistry()
	_ = reg.Register(engines.KindSQLite, func(_ context.Context, cfg dbcore.Config) (dbcore.Provider, error) {
		return fakeProvider{}, nil
	})
	d := &DB{Manager: dbcore.NewManager(loader, reg), Loader: loader, maint: map[string]*sync.RWMutex{}}

	var afterRan atomic.Bool
	release := make(chan struct{})
	maintDone := make(chan error, 1)
	go func() {
		maintDone <- d.WithMaintenance("c1", func(_ dbcore.Config) error {
			<-release
			return nil
		}, func(_ dbcore.Config) { afterRan.Store(true) })
	}()
	// Queue a same-file lookup while maintenance holds the write lock.
	time.Sleep(20 * time.Millisecond)
	got := make(chan error, 1)
	go func() {
		_, err := d.get(context.Background(), "c2", nil)
		got <- err
	}()
	close(release)
	if err := <-maintDone; err != nil {
		t.Fatal(err)
	}
	if err := <-got; err != nil {
		t.Fatal(err)
	}
	if !afterRan.Load() {
		t.Fatal("lookup proceeded before the after hook ran")
	}
}

func TestManagedLookupsLoadEachFamilyConfigOnlyOnce(t *testing.T) {
	for _, kind := range []string{engines.KindPostgres, engines.KindMongoDB, engines.KindRedis} {
		t.Run(kind, func(t *testing.T) {
			loader := &countingTestLoader{cfg: dbcore.Config{Kind: kind}}
			reg := dbcore.NewRegistry()
			_ = reg.Register(kind, func(context.Context, dbcore.Config) (dbcore.Provider, error) {
				return fakeProvider{}, nil
			})
			d := &DB{Manager: dbcore.NewManager(loader, reg), Loader: loader}
			defer func() { _ = d.Close() }()
			for i := 0; i < 3; i++ {
				if _, err := d.get(context.Background(), "c1", nil); err != nil {
					t.Fatalf("lookup %d: %v", i, err)
				}
			}
			if calls := loader.calls.Load(); calls != 1 {
				t.Fatalf("profile loads = %d, want one load for the managed entry", calls)
			}
		})
	}
}

func TestMaintenanceLockRetainsQueuedWriterAndPrunesAfterRelease(t *testing.T) {
	d := &DB{}
	const key = "file:shared"
	releaseReader := d.acquireMaintenanceLock(key, false)
	d.maintMu.Lock()
	shared := d.maint[key]
	d.maintMu.Unlock()

	writer := make(chan func(), 1)
	go func() { writer <- d.acquireMaintenanceLock(key, true) }()
	deadline := time.Now().Add(5 * time.Second)
	for {
		d.maintMu.Lock()
		refs, sameLock := d.maintRefs[key], d.maint[key] == shared
		d.maintMu.Unlock()
		if refs == 2 {
			if !sameLock {
				t.Fatal("queued writer acquired a different keyed lock")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("queued writer did not retain the keyed lock")
		}
		time.Sleep(time.Millisecond)
	}
	releaseReader()
	releaseWriter := <-writer
	d.maintMu.Lock()
	refs := d.maintRefs[key]
	d.maintMu.Unlock()
	if refs != 1 {
		t.Fatalf("writer holder refs = %d, want 1 after reader release", refs)
	}
	releaseWriter()
	d.maintMu.Lock()
	_, lockRetained := d.maint[key]
	_, refsRetained := d.maintRefs[key]
	d.maintMu.Unlock()
	if lockRetained || refsRetained {
		t.Fatal("keyed lock was retained after its final holder released it")
	}
}

func TestLegacyQdrantUsesUnsupportedSQLAdapter(t *testing.T) {
	d, err := New(mapLoader{"c1": {Kind: appengines.KindQdrant}})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = d.Close() }()
	a, err := d.Get(context.Background(), "c1")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	databases, err := a.ListDatabases(ctx)
	if err != nil || len(databases) != 0 {
		t.Fatalf("Qdrant databases = %v, %v; want empty metadata", databases, err)
	}
	schemas, err := a.ListSchemas(ctx, nil)
	if err != nil || len(schemas) != 0 {
		t.Fatalf("Qdrant schemas = %v, %v; want empty metadata", schemas, err)
	}
	tables, err := a.ListTables(ctx, nil)
	if err != nil || len(tables) != 0 {
		t.Fatalf("Qdrant tables = %v, %v; want empty metadata", tables, err)
	}
	if _, err := a.PreviewRows(ctx, engines.PreviewRowsInput{}); !errors.Is(err, engines.ErrNotSupported) {
		t.Fatalf("Qdrant preview error = %v, want unsupported", err)
	}
	if _, err := a.RunQuery(ctx, engines.RunQueryInput{}); !errors.Is(err, engines.ErrNotSupported) {
		t.Fatalf("Qdrant query error = %v, want unsupported", err)
	}
}

type flipLoader struct {
	first dbcore.Config
	next  dbcore.Config
	calls atomic.Int32
}

func (l *flipLoader) ProfileForConnect(string) (dbcore.Config, error) {
	if l.calls.Add(1) == 1 {
		return l.first, nil
	}
	return l.next, nil
}

type mapLoader map[string]dbcore.Config

func (m mapLoader) ProfileForConnect(id string) (dbcore.Config, error) {
	return m[id], nil
}

type closeTrackProvider struct{ closed *atomic.Bool }

func (closeTrackProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}

func (p closeTrackProvider) Close() error {
	p.closed.Store(true)
	return nil
}

type closeFailProvider struct{ err error }

func (closeFailProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}
func (p closeFailProvider) Close() error { return p.err }

type fakeErr string

func (e fakeErr) Error() string { return string(e) }

const (
	errFake      = fakeErr("file op failed")
	errFakeClose = fakeErr("close failed")
)
