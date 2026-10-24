package ai

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// indexProbeAdapter reports one users table and can fail or block inside
// ListSchemas so tests can hold an indexing job in flight and count scans.
// (Why)
type indexProbeAdapter struct {
	engines.UnsupportedAdapter
	mu      sync.Mutex
	scans   int
	err     error
	entered chan struct{} // closed on the first ListSchemas call
	release chan struct{} // ListSchemas blocks until closed when non-nil
}

func (a *indexProbeAdapter) ListSchemas(_ context.Context, _ *string) ([]engines.SchemaInfo, error) {
	a.mu.Lock()
	a.scans++
	if a.scans == 1 && a.entered != nil {
		close(a.entered)
	}
	err := a.err
	release := a.release
	a.mu.Unlock()
	if release != nil {
		<-release
	}
	if err != nil {
		return nil, err
	}
	return []engines.SchemaInfo{{Name: "public"}}, nil
}

func (a *indexProbeAdapter) ListTables(_ context.Context, _ *string) ([]engines.TableInfo, error) {
	return []engines.TableInfo{{ID: "public.users", Schema: "public", Name: "users", Type: "table"}}, nil
}

func (a *indexProbeAdapter) GetTableColumns(_ context.Context, _ string) ([]engines.ColumnInfo, error) {
	return []engines.ColumnInfo{{Name: "id", Type: "integer", PrimaryKey: true}}, nil
}

func newIndexTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "kamehadb.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

// setIndexerProvider persists explicit settings — a save also clears the
// package-level aiSettingsCache, so tests never read a previous test's
// cached provider state. The unreachable loopback port makes CreateEmbedding
// fall back to the deterministic local embedding, keeping tests offline. (Why)
func setIndexerProvider(t *testing.T, st *store.Store, enabled bool) {
	t.Helper()
	if err := st.SaveAISettings(store.AISettings{
		ActiveProvider: "ollama-local",
		Providers: map[string]store.AIProviderConfig{
			"ollama-local": {Enabled: enabled, Model: "test", BaseURL: "http://127.0.0.1:9/v1"},
		},
	}); err != nil {
		t.Fatal(err)
	}
}

func TestEnsureConnectionSchemaIndexed_FirstUse(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, true)
	idx := NewSchemaIndexer(st)
	adapter := &indexProbeAdapter{}

	if err := idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter); err != nil {
		t.Fatal(err)
	}
	if adapter.scans != 1 {
		t.Fatalf("adapter scanned %d times, want 1", adapter.scans)
	}
	refs, err := st.ListEmbeddingRefs("c1")
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 {
		t.Fatalf("%d embedding refs stored, want 1", len(refs))
	}
}

func TestEnsureConnectionSchemaIndexed_SubsequentUse(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, true)
	idx := NewSchemaIndexer(st)
	adapter := &indexProbeAdapter{}

	for i := 0; i < 3; i++ {
		if err := idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter); err != nil {
			t.Fatal(err)
		}
	}
	if adapter.scans != 1 {
		t.Fatalf("adapter scanned %d times, want 1 for repeated calls", adapter.scans)
	}
}

func TestEnsureConnectionSchemaIndexed_ConcurrentSameConnection(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, true)
	idx := NewSchemaIndexer(st)
	adapter := &indexProbeAdapter{entered: make(chan struct{}), release: make(chan struct{})}

	firstErr := make(chan error, 1)
	go func() { firstErr <- idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter) }()
	<-adapter.entered

	secondErr := make(chan error, 1)
	go func() { secondErr <- idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter) }()

	// The second caller must wait on the shared in-flight job — returning
	// early here means it skipped the wait or ran a second job. (Why)
	select {
	case err := <-secondErr:
		t.Fatalf("second caller returned %v while the shared job was still running", err)
	case <-time.After(100 * time.Millisecond):
	}
	close(adapter.release)

	if err := <-firstErr; err != nil {
		t.Fatal(err)
	}
	if err := <-secondErr; err != nil {
		t.Fatal(err)
	}
	if adapter.scans != 1 {
		t.Fatalf("adapter scanned %d times, want 1 shared job", adapter.scans)
	}
}

func TestEnsureConnectionSchemaIndexed_SerializeAcrossConnections(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, true)
	idx := NewSchemaIndexer(st)
	adapterA := &indexProbeAdapter{entered: make(chan struct{}), release: make(chan struct{})}
	adapterB := &indexProbeAdapter{entered: make(chan struct{})}

	errA := make(chan error, 1)
	go func() { errA <- idx.EnsureConnectionSchemaIndexed(context.Background(), "conn-a", adapterA) }()
	<-adapterA.entered // conn-a holds the global lock inside its scan

	errB := make(chan error, 1)
	go func() { errB <- idx.EnsureConnectionSchemaIndexed(context.Background(), "conn-b", adapterB) }()
	select {
	case <-adapterB.entered:
		t.Fatal("conn-b started indexing while conn-a still held the global lock")
	case <-time.After(100 * time.Millisecond):
	}
	close(adapterA.release)

	if err := <-errA; err != nil {
		t.Fatal(err)
	}
	if err := <-errB; err != nil {
		t.Fatal(err)
	}
	if adapterB.scans != 1 {
		t.Fatalf("conn-b scanned %d times, want 1", adapterB.scans)
	}
}

func TestEnsureConnectionSchemaIndexed_DisabledProvider(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, false)
	idx := NewSchemaIndexer(st)
	adapter := &indexProbeAdapter{}

	if err := idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter); err != nil {
		t.Fatal(err)
	}
	if adapter.scans != 0 {
		t.Fatalf("adapter scanned %d times, want 0 with no enabled provider", adapter.scans)
	}

	// A skipped connection is not marked completed: enabling the provider and
	// calling again indexes it on the next attempt. (Why)
	setIndexerProvider(t, st, true)
	if err := idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter); err != nil {
		t.Fatal(err)
	}
	if adapter.scans != 1 {
		t.Fatalf("adapter scanned %d times, want 1 after enabling the provider", adapter.scans)
	}
}

func TestEnsureConnectionSchemaIndexed_FailureRetry(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, true)
	idx := NewSchemaIndexer(st)
	errBoom := errors.New("database unreachable")
	adapter := &indexProbeAdapter{err: errBoom}

	if err := idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter); !errors.Is(err, errBoom) {
		t.Fatalf("first call returned %v, want the indexing error", err)
	}
	refs, err := st.ListEmbeddingRefs("c1")
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 0 {
		t.Fatalf("%d embedding refs stored after a failed index, want 0", len(refs))
	}

	adapter.err = nil
	if err := idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter); err != nil {
		t.Fatal(err)
	}
	if adapter.scans != 2 {
		t.Fatalf("adapter scanned %d times, want 2 (failure did not mark completed)", adapter.scans)
	}
}

func TestEnsureConnectionSchemaIndexed_ClientDisconnectKeepsJob(t *testing.T) {
	st := newIndexTestStore(t)
	setIndexerProvider(t, st, true)
	idx := NewSchemaIndexer(st)
	adapter := &indexProbeAdapter{entered: make(chan struct{}), release: make(chan struct{})}

	ctx, cancel := context.WithCancel(context.Background())
	firstErr := make(chan error, 1)
	go func() { firstErr <- idx.EnsureConnectionSchemaIndexed(ctx, "c1", adapter) }()
	<-adapter.entered
	cancel()

	if err := <-firstErr; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled caller returned %v, want context.Canceled", err)
	}

	// The shared job outlives its caller: a fresh caller attaches to the same
	// in-flight run instead of starting a second scan. (Why)
	secondErr := make(chan error, 1)
	go func() { secondErr <- idx.EnsureConnectionSchemaIndexed(context.Background(), "c1", adapter) }()
	close(adapter.release)
	if err := <-secondErr; err != nil {
		t.Fatal(err)
	}
	if adapter.scans != 1 {
		t.Fatalf("adapter scanned %d times, want 1 — the cancelled caller's job completed", adapter.scans)
	}
}
