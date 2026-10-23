package api

import (
	"context"
	"errors"
	"runtime"
	"sync/atomic"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

const requestFixtureKind = "test-request-owner"

type requestSQLLoader struct{ calls atomic.Int32 }

func (loader *requestSQLLoader) ProfileForConnect(string) (engines.ConnProfile, error) {
	loader.calls.Add(1)
	return engines.ConnProfile{Kind: requestFixtureKind}, nil
}

type requestSQLAdapter struct {
	engines.UnsupportedAdapter
	started   chan string
	firstDone chan struct{}
}

// Expose native context lifetime rather than only counting Cancel invocations.
func (adapter *requestSQLAdapter) RunQuery(ctx context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	adapter.started <- *input.RequestID
	if input.Query == "SELECT first" {
		select {
		case <-adapter.firstDone:
			return &engines.QueryResult{}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestGUIRequestOlderSQLCompletionAndIndependentExport(t *testing.T) {
	for _, legacyCancel := range []bool{false, true} {
		adapter := &requestSQLAdapter{started: make(chan string, 2), firstDone: make(chan struct{})}
		registry := testDB(t, &requestSQLLoader{})
		testRegister(t, registry, requestFixtureKind, func(engines.ConnProfile) (engines.SQLAdapter, error) { return adapter, nil })
		service := NewSqlService(registry, newTTLCache(), nil)
		exportCtx, exportCancel, err := service.registerExport("independent-export")
		if err != nil {
			t.Fatal(err)
		}
		firstID, secondID := "first", "second"
		firstResult, secondResult := make(chan error, 1), make(chan error, 1)
		go func() {
			_, err := service.RunQuery("same", engines.RunQueryInput{Query: "SELECT first", RequestID: &firstID})
			firstResult <- err
		}()
		if <-adapter.started != firstID {
			t.Fatal("wrong first request")
		}
		go func() {
			_, err := service.RunQuery("same", engines.RunQueryInput{Query: "SELECT second", RequestID: &secondID})
			secondResult <- err
		}()
		if <-adapter.started != secondID {
			t.Fatal("wrong second request")
		}
		close(adapter.firstDone)
		if err := <-firstResult; err != nil {
			t.Fatal(err)
		}
		if legacyCancel {
			service.CancelQuery("same")
		} else if ok, err := service.CancelRequest(secondID); !ok || err != nil {
			t.Fatal(ok, err)
		}
		select {
		case err := <-secondResult:
			if !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
		case <-time.After(requestTestTimeout):
			t.Fatal("old completion lost new cancellation")
		}
		if exportCtx.Err() != nil {
			t.Fatal("GUI cancellation interrupted export")
		}
		exportCancel()
		service.finishExport("independent-export")
		service.requests.close()
		service.closeExports()
		registry.Close()
	}
}

func TestGUIRequestRejectsBeforeAdapterLookup(t *testing.T) {
	loader := &requestSQLLoader{}
	service := NewSqlService(testDB(t, loader), newTTLCache(), nil)
	id := "cancel-before-registration"
	if _, err := service.CancelRequest(id); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RunQuery("connection", engines.RunQueryInput{Query: "SELECT 1", RequestID: &id}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if loader.calls.Load() != 0 {
		t.Fatal("cancelled request reached profile lookup")
	}
	active := make([]*requestJob, 0, maxGUIRequests)
	for range maxGUIRequests {
		job, _ := service.requests.begin("connection", nil)
		active = append(active, job)
	}
	if _, err := service.PreviewRows("connection", engines.PreviewRowsInput{TableID: "table"}); err == nil {
		t.Fatal("busy preview admitted")
	}
	if loader.calls.Load() != 0 {
		t.Fatal("busy request reached profile lookup")
	}
	for _, job := range active {
		service.requests.finish(job)
	}
	service.requests.close()
}

// Hold one connection entry in its constructor; cancelling a second lookup
// queued on the same entry must return without releasing the constructor.
func TestGUIRequestCancellationDuringAdapterLookup(t *testing.T) {
	constructing, release := make(chan struct{}), make(chan struct{})
	adapter := &requestSQLAdapter{started: make(chan string, 1), firstDone: make(chan struct{})}
	close(adapter.firstDone)
	registry := testDB(t, &requestSQLLoader{})
	testRegister(t, registry, requestFixtureKind, func(engines.ConnProfile) (engines.SQLAdapter, error) {
		close(constructing)
		<-release
		return adapter, nil
	})
	service := NewSqlService(registry, newTTLCache(), nil)
	firstID, secondID := "constructor", "queued"
	first, second := make(chan error, 1), make(chan error, 1)
	go func() {
		_, err := service.RunQuery("one", engines.RunQueryInput{Query: "SELECT first", RequestID: &firstID})
		first <- err
	}()
	<-constructing
	go func() {
		_, err := service.RunQuery("one", engines.RunQueryInput{Query: "SELECT first", RequestID: &secondID})
		second <- err
	}()
	deadline := time.After(requestTestTimeout)
	for {
		service.requests.mu.Lock()
		registered := service.requests.active[secondID] != nil
		service.requests.mu.Unlock()
		if registered {
			break
		}
		select {
		case <-deadline:
			t.Fatal("second request never registered")
		default:
			runtime.Gosched()
		}
	}
	if _, err := service.CancelRequest(secondID); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-second:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(requestTestTimeout):
		t.Fatal("cancelled lookup remained queued")
	}
	close(release)
	if err := <-first; err != nil {
		t.Fatal(err)
	}
	service.requests.close()
	registry.Close()
}

type readOnlyPolicyAdapter struct {
	engines.UnsupportedAdapter
	calls int32
	query string
}

func (a *readOnlyPolicyAdapter) RunQuery(_ context.Context, input engines.RunQueryInput) (*engines.QueryResult, error) {
	atomic.AddInt32(&a.calls, 1)
	a.query = input.Query
	return &engines.QueryResult{}, nil
}

func readOnlyPolicyService(t *testing.T, policy func(string) (bool, error)) (*SqlService, *readOnlyPolicyAdapter) {
	t.Helper()
	adapter := &readOnlyPolicyAdapter{}
	registry := testDB(t, &requestSQLLoader{})
	testRegister(t, registry, requestFixtureKind, func(engines.ConnProfile) (engines.SQLAdapter, error) { return adapter, nil })
	service := NewSqlService(registry, newTTLCache(), policy)
	t.Cleanup(func() {
		service.requests.close()
		registry.Close()
	})
	return service, adapter
}

// The store policy decides whether RunQuery screens for writes or only for
// statement chains; callers cannot influence it through the input. (Why)
func TestRunQueryUsesProfileReadOnly(t *testing.T) {
	t.Run("read-only rejects before adapter", func(t *testing.T) {
		service, adapter := readOnlyPolicyService(t, func(string) (bool, error) { return true, nil })
		if _, err := service.RunQuery("connection", engines.RunQueryInput{Query: "UPDATE t SET x = 1"}); err == nil {
			t.Fatal("read-only profile accepted an update")
		}
		if atomic.LoadInt32(&adapter.calls) != 0 {
			t.Fatal("rejected query reached the adapter")
		}
	})

	t.Run("writable runs one statement", func(t *testing.T) {
		service, adapter := readOnlyPolicyService(t, func(string) (bool, error) { return false, nil })
		if _, err := service.RunQuery("connection", engines.RunQueryInput{Query: "UPDATE t SET x = 1"}); err != nil {
			t.Fatal(err)
		}
		if atomic.LoadInt32(&adapter.calls) != 1 || adapter.query != "UPDATE t SET x = 1" {
			t.Fatalf("adapter calls = %d, query = %q", adapter.calls, adapter.query)
		}
	})
}

func TestRunQueryRejectsChainsInBothModes(t *testing.T) {
	for _, readOnly := range []bool{true, false} {
		t.Run(map[bool]string{true: "read-only", false: "writable"}[readOnly], func(t *testing.T) {
			service, adapter := readOnlyPolicyService(t, func(string) (bool, error) { return readOnly, nil })
			if _, err := service.RunQuery("connection", engines.RunQueryInput{Query: "UPDATE t SET x = 1; DROP TABLE t"}); err == nil {
				t.Fatal("chained query accepted")
			}
			if atomic.LoadInt32(&adapter.calls) != 0 {
				t.Fatal("chained query reached the adapter")
			}
		})
	}
}

// A policy-store failure must not fall back to writable or read-only behavior
// by accident; it rejects before any adapter work.
func TestRunQueryFailsClosedOnPolicyLookupError(t *testing.T) {
	service, adapter := readOnlyPolicyService(t, func(string) (bool, error) {
		return false, errors.New("metadata unavailable")
	})
	if _, err := service.RunQuery("connection", engines.RunQueryInput{Query: "SELECT 1"}); err == nil || err.Error() != "metadata unavailable" {
		t.Fatalf("error = %v", err)
	}
	if atomic.LoadInt32(&adapter.calls) != 0 {
		t.Fatal("policy failure reached the adapter")
	}
}
