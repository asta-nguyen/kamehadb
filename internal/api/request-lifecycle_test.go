package api

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

type requestLifecycleAdapter struct {
	engines.UnsupportedAdapter
	started            chan context.Context
	ctx                context.Context
	closedBeforeCancel bool
}

func (adapter *requestLifecycleAdapter) RunQuery(ctx context.Context, _ engines.RunQueryInput) (*engines.QueryResult, error) {
	adapter.ctx = ctx
	adapter.started <- ctx
	<-ctx.Done()
	return nil, ctx.Err()
}
func (adapter *requestLifecycleAdapter) Close() error {
	adapter.closedBeforeCancel = adapter.ctx != nil && adapter.ctx.Err() == nil
	return nil
}

// Exercise actual service-container wiring, not just a standalone owner.
// Profile invalidation and shutdown must cancel before adapter teardown.
func TestGUIRequestsSharedOwnerAndLifecycle(t *testing.T) {
	root := t.TempDir()
	t.Setenv("KAMEHADB_DATA_DIR", filepath.Join(root, "private-data"))
	metadata, err := store.Open(filepath.Join(root, "metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer metadata.Close()
	adapter := &requestLifecycleAdapter{started: make(chan context.Context, 1)}
	engines.RegisterFactory(requestFixtureKind, func(engines.ConnProfile) (engines.SQLAdapter, error) { return adapter, nil })
	registry := engines.NewRegistry(&requestSQLLoader{})
	defer registry.Close()
	services := NewServices(metadata, registry, nil, nil)
	if services.SQL.requests != services.Mongo.requests || services.SQL.requests != services.Redis.requests {
		t.Fatal("GUI services have independent registries")
	}
	services.StartRequests(context.Background())
	id := "profile-change"
	finished := make(chan error, 1)
	go func() {
		_, err := services.SQL.RunQuery("same", engines.RunQueryInput{Query: "SELECT 1", RequestID: &id})
		finished <- err
	}()
	ctx := <-adapter.started
	services.Connections.invalidateConnection("same")
	if ctx.Err() != context.Canceled || adapter.closedBeforeCancel {
		t.Fatal("adapter closed before profile requests were cancelled")
	}
	if err := <-finished; err == nil {
		t.Fatal("profile invalidation did not interrupt native work")
	}
	id = "shutdown"
	go func() {
		_, err := services.SQL.RunQuery("same", engines.RunQueryInput{Query: "SELECT 1", RequestID: &id})
		finished <- err
	}()
	ctx = <-adapter.started
	services.CloseRequests()
	if ctx.Err() != context.Canceled {
		t.Fatal("shutdown request was not cancelled")
	}
	if err := <-finished; err == nil {
		t.Fatal("shutdown admitted completed work")
	}
	services.SQL.requests.mu.Lock()
	remaining := len(services.SQL.requests.active)
	services.SQL.requests.mu.Unlock()
	if remaining != 0 {
		t.Fatal("shutdown retained request ownership", remaining)
	}
}
