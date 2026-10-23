package dbcore

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

type fakeLoader struct{ cfg Config }

func (f fakeLoader) ProfileForConnect(string) (Config, error) { return f.cfg, nil }

type fakeProvider struct{ closed *atomic.Bool }

func (p fakeProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}
func (p fakeProvider) Close() error { p.closed.Store(true); return nil }

func cfg() Config { return Config{Kind: "pg", Host: "h"} }

func TestRegistrySelection(t *testing.T) {
	r := NewRegistry()
	f := func(context.Context, Config) (Provider, error) { return fakeProvider{new(atomic.Bool)}, nil }
	if err := r.Register("pg", f); err != nil {
		t.Fatal(err)
	}
	if err := r.Register("pg", f); !errors.Is(err, ErrDuplicateProvider) {
		t.Fatal("duplicate not rejected")
	}
	if _, err := r.Open(context.Background(), "nope", cfg()); !errors.Is(err, ErrProviderNotRegistered) {
		t.Fatal("unregistered kind not rejected")
	}
	p, err := r.Open(context.Background(), "pg", cfg())
	if err != nil || p == nil {
		t.Fatal("open failed")
	}
}

func TestManagerSharedEntryAndClose(t *testing.T) {
	closed := new(atomic.Bool)
	var calls atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		calls.Add(1)
		return fakeProvider{closed}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	p1, err := m.Get(context.Background(), "c1", nil)
	if err != nil {
		t.Fatal(err)
	}
	p2, err := m.Get(context.Background(), "c1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if p1 != p2 || calls.Load() != 1 {
		t.Fatal("same-id Get must share one construction")
	}
	m.Invalidate("c1")
	if !closed.Load() {
		t.Fatal("invalidate did not close provider")
	}
	_ = m.Close()
	if _, err := m.Get(context.Background(), "c1", nil); !errors.Is(err, ErrManagerClosed) {
		t.Fatal("get after close")
	}
}

func TestManagerRejectedCallerInvokesNoFactory(t *testing.T) {
	var calls atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		calls.Add(1)
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	reject := errors.New("rejected")
	if _, err := m.Get(context.Background(), "c1", func(Config) error { return reject }); !errors.Is(err, reject) {
		t.Fatal("expected caller check error")
	}
	if calls.Load() != 0 {
		t.Fatal("rejected-only request invoked the factory")
	}
	// Rejection must not poison the entry for a later accepted caller.
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
}

func TestManagerGetWithGuardReleasesOnSuccessAndGuardError(t *testing.T) {
	rejected := errors.New("guard rejected")
	var releases atomic.Int32
	var factories atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		factories.Add(1)
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	guard := func(Config) (func(), error) {
		return func() { releases.Add(1) }, rejected
	}
	if _, err := m.GetWithGuard(context.Background(), "rejected", nil, guard); !errors.Is(err, rejected) {
		t.Fatalf("guard error: %v", err)
	}
	if got := releases.Load(); got != 1 {
		t.Fatalf("guard release count after rejection = %d, want 1", got)
	}
	if got := factories.Load(); got != 0 {
		t.Fatalf("factory calls after guard rejection = %d, want 0", got)
	}

	if _, err := m.GetWithGuard(context.Background(), "accepted", nil, func(got Config) (func(), error) {
		if got != cfg() {
			t.Errorf("guard config = %+v, want %+v", got, cfg())
		}
		return func() { releases.Add(1) }, nil
	}); err != nil {
		t.Fatal(err)
	}
	if got := releases.Load(); got != 2 {
		t.Fatalf("guard release count after success = %d, want 2", got)
	}
}

func TestManagerGetWithGuardReleasesAfterCancellation(t *testing.T) {
	started, releaseFactory := make(chan struct{}), make(chan struct{})
	var releases atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		close(started)
		<-releaseFactory
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := m.GetWithGuard(ctx, "c1", nil, func(Config) (func(), error) {
			return func() { releases.Add(1) }, nil
		})
		done <- err
	}()
	<-started
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled guarded lookup: %v", err)
	}
	close(releaseFactory)
	if got := releases.Load(); got != 1 {
		t.Fatalf("guard release count after cancellation = %d, want 1", got)
	}
}

func TestManagerGetWithGuardRunsOutsideLocksAndReleasesAfterRetirement(t *testing.T) {
	entered, continueGuard := make(chan struct{}), make(chan struct{})
	var releases atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	done := make(chan error, 1)
	go func() {
		_, err := m.GetWithGuard(context.Background(), "c1", nil, func(Config) (func(), error) {
			close(entered)
			<-continueGuard
			return func() { releases.Add(1) }, nil
		})
		done <- err
	}()
	<-entered
	invalidated := make(chan struct{})
	go func() {
		m.Invalidate("c1")
		close(invalidated)
	}()
	select {
	case <-invalidated:
	case <-time.After(time.Second):
		t.Fatal("Invalidate blocked while the config guard was running")
	}
	close(continueGuard)
	if err := <-done; !errors.Is(err, ErrProviderRetired) {
		t.Fatalf("retired guarded lookup: %v", err)
	}
	if got := releases.Load(); got != 1 {
		t.Fatalf("guard release count after retirement = %d, want 1", got)
	}
}

func TestManagerGetWithGuardReleasesAfterConstructorFailure(t *testing.T) {
	constructErr := errors.New("constructor failed")
	var releases atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) { return nil, constructErr })
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	_, err := m.GetWithGuard(context.Background(), "c1", nil, func(Config) (func(), error) {
		return func() { releases.Add(1) }, nil
	})
	if !errors.Is(err, constructErr) {
		t.Fatalf("constructor error: %v", err)
	}
	if got := releases.Load(); got != 1 {
		t.Fatalf("guard release count after constructor failure = %d, want 1", got)
	}
}

func TestManagerLastCancelledWaiterRetires(t *testing.T) {
	gate := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		<-gate
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	defer close(gate)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := m.Get(ctx, "c1", nil)
		done <- err
	}()
	// Wait for the waiter to register, then cancel it.
	for i := 0; i < 200; i++ {
		m.mu.Lock()
		waiting := len(m.entries) == 1
		m.mu.Unlock()
		if waiting {
			break
		}
		time.Sleep(time.Millisecond)
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("waiter: %v", err)
	}
	for i := 0; i < 200; i++ {
		m.mu.Lock()
		gone := len(m.entries) == 0
		m.mu.Unlock()
		if gone {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("cancelled last waiter did not retire the in-flight entry")
}

func TestManagerLastWaiterCancellationRacesNewGets(t *testing.T) {
	for round := 0; round < 5000; round++ {
		started, release := make(chan struct{}), make(chan struct{})
		var calls atomic.Int32
		r := NewRegistry()
		_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
			if calls.Add(1) == 1 {
				close(started)
				<-release
			}
			return fakeProvider{new(atomic.Bool)}, nil
		})
		m := NewManager(fakeLoader{cfg()}, r)
		ctx, cancel := context.WithCancel(context.Background())
		first := make(chan error, 1)
		go func() {
			_, err := m.Get(ctx, "c1", nil)
			first <- err
		}()
		<-started

		const contenders = 4
		start := make(chan struct{})
		results := make(chan error, contenders)
		for i := 0; i < contenders; i++ {
			go func() {
				<-start
				_, err := m.Get(context.Background(), "c1", nil)
				results <- err
			}()
		}
		go func() {
			<-start
			cancel()
		}()
		close(start)
		if err := <-first; !errors.Is(err, context.Canceled) {
			t.Fatalf("round %d first waiter: %v", round, err)
		}
		close(release)
		for i := 0; i < contenders; i++ {
			if err := <-results; err != nil {
				t.Fatalf("round %d new get: %v", round, err)
			}
		}
		if err := m.Close(); err != nil {
			t.Fatalf("round %d close: %v", round, err)
		}
	}
}

type firstLoadGate struct {
	cfg     Config
	calls   atomic.Int32
	started chan struct{}
	release chan struct{}
}

func (l *firstLoadGate) ProfileForConnect(string) (Config, error) {
	if l.calls.Add(1) == 1 {
		close(l.started)
		<-l.release
	}
	return l.cfg, nil
}

func TestManagerInvalidateWhileLoadingReturnsRetiredAndAllowsRetry(t *testing.T) {
	loader := &firstLoadGate{cfg: cfg(), started: make(chan struct{}), release: make(chan struct{})}
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(loader, r)
	defer func() { _ = m.Close() }()
	defer close(loader.release)

	first := make(chan error, 1)
	go func() {
		_, err := m.Get(context.Background(), "c1", nil)
		first <- err
	}()
	<-loader.started
	m.Invalidate("c1")
	if err := <-first; !errors.Is(err, ErrProviderRetired) {
		t.Fatalf("invalidated load waiter: %v", err)
	}
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatalf("get after invalidation on open manager: %v", err)
	}
}

func TestManagerConcurrentSameID(t *testing.T) {
	var calls atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		calls.Add(1)
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := m.Get(context.Background(), "c1", nil); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("concurrent gets: %d constructions", calls.Load())
	}
}

type seqLoader struct{ cfgs []Config }

func (l *seqLoader) ProfileForConnect(string) (Config, error) {
	c := l.cfgs[0]
	l.cfgs = l.cfgs[1:]
	return c, nil
}

func TestManagerConstructorFailureRetries(t *testing.T) {
	var calls atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		if calls.Add(1) == 1 {
			return nil, errors.New("boom")
		}
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	if _, err := m.Get(context.Background(), "c1", nil); err == nil {
		t.Fatal("expected constructor error")
	}
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatalf("retry after failure: %v", err)
	}
	if calls.Load() != 2 {
		t.Fatalf("calls: %d", calls.Load())
	}
}

func TestManagerChangedKindReloadAfterInvalidate(t *testing.T) {
	l := &seqLoader{cfgs: []Config{{Kind: "pg"}, {Kind: "redis"}}}
	var pg, rd atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		pg.Add(1)
		return fakeProvider{new(atomic.Bool)}, nil
	})
	_ = r.Register("redis", func(context.Context, Config) (Provider, error) {
		rd.Add(1)
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(l, r)
	defer func() { _ = m.Close() }()
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	m.Invalidate("c1")
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	if pg.Load() != 1 || rd.Load() != 1 {
		t.Fatalf("pg=%d redis=%d", pg.Load(), rd.Load())
	}
}

func TestManagerFirstCancelSecondSucceeds(t *testing.T) {
	gate := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		<-gate
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	ctx1, cancel1 := context.WithCancel(context.Background())
	err1 := make(chan error, 1)
	go func() {
		_, err := m.Get(ctx1, "c1", nil)
		err1 <- err
	}()
	err2 := make(chan error, 1)
	go func() {
		p, err := m.Get(context.Background(), "c1", nil)
		if err == nil && p == nil {
			err = errors.New("nil provider")
		}
		err2 <- err
	}()
	for i := 0; i < 200; i++ {
		m.mu.Lock()
		two := len(m.entries) == 1 && m.entries["c1"].waiters == 2
		m.mu.Unlock()
		if two {
			break
		}
		time.Sleep(time.Millisecond)
	}
	cancel1()
	if err := <-err1; !errors.Is(err, context.Canceled) {
		t.Fatalf("first waiter: %v", err)
	}
	close(gate)
	if err := <-err2; err != nil {
		t.Fatalf("second waiter: %v", err)
	}
}

func TestManagerCloseReportsTeardownError(t *testing.T) {
	closeErr := errors.New("close failed")
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	if err := m.Close(); !errors.Is(err, closeErr) {
		t.Fatalf("close: %v", err)
	}
}

// A factory that ignores context still produces a provider after Close began:
// Close must wait for that late construction and surface its close error.
func TestManagerCloseWaitsForInflightConstruction(t *testing.T) {
	started := make(chan struct{})
	gate := make(chan struct{})
	closeErr := errors.New("late close failed")
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		close(started)
		<-gate // ctx-ignoring factory, like a driver without context support
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	got := make(chan error, 1)
	go func() {
		_, err := m.Get(context.Background(), "c1", nil)
		got <- err
	}()
	<-started // factory entered its ctx-ignoring body before cancellation
	closed := make(chan error, 1)
	go func() { closed <- m.Close() }()
	select {
	case err := <-closed:
		t.Fatalf("Close returned while construction was still in flight: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(gate)
	if err := <-closed; !errors.Is(err, closeErr) {
		t.Fatalf("late close error not collected: %v", err)
	}
	if err := <-got; !errors.Is(err, ErrProviderRetired) {
		t.Fatalf("waiter: %v", err)
	}
}

// Invalidate removes the entry while construction is still in flight and
// hands its close to an async goroutine; a concurrent Close must still wait
// for that close and surface its error.
func TestCloseCollectsAsyncInvalidateCloseError(t *testing.T) {
	closeErr := errors.New("close failed")
	release := make(chan struct{})
	constructed := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		close(constructed)
		<-release // ctx-ignoring factory, like a driver without context support
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	got := make(chan error, 1)
	go func() {
		_, err := m.Get(context.Background(), "c1", nil)
		got <- err
	}()
	<-constructed
	m.Invalidate("c1") // entry leaves the map while construction still runs
	closed := make(chan error, 1)
	go func() { closed <- m.Close() }()
	select {
	case err := <-closed:
		t.Fatalf("Close returned while an async retire was in flight: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-closed; !errors.Is(err, closeErr) {
		t.Fatalf("async retire close error lost: %v", err)
	}
	if err := <-got; !errors.Is(err, ErrProviderRetired) {
		t.Fatalf("waiter: %v", err)
	}
}

// InvalidateAndWait must keep waiting even when Invalidate already removed
// the entry and an async close is still running — file maintenance must not
// start while a provider handle could still be open.
func TestInvalidateAndWaitWaitsForInFlightClose(t *testing.T) {
	release := make(chan struct{})
	constructed := make(chan struct{})
	closedGate := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		close(constructed)
		<-release // ctx-ignoring factory, like a driver without context support
		return blockingCloseProvider{ch: closedGate}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	go func() {
		_, _ = m.Get(context.Background(), "c1", nil)
	}()
	<-constructed
	m.Invalidate("c1") // entry leaves the map; async close starts once construct returns
	close(release)
	done := make(chan error, 1)
	go func() { done <- m.InvalidateAndWait("c1") }()
	select {
	case err := <-done:
		t.Fatalf("InvalidateAndWait returned before the async close finished: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(closedGate)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// An entry marked retired by a racer that has not yet registered its pending
// close must still be waited on — closeCh exists from the mark on.
func TestInvalidateAndWaitCoversMarkedButUnregisteredEntry(t *testing.T) {
	m := NewManager(fakeLoader{cfg()}, NewRegistry())
	e := &entry{id: "c1", retired: true, started: true, closeCh: make(chan struct{})}
	m.entries["c1"] = e
	done := make(chan error, 1)
	go func() { done <- m.InvalidateAndWait("c1") }()
	select {
	case err := <-done:
		t.Fatalf("InvalidateAndWait returned while the close was still pending: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(e.closeCh)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

type blockingFailCloseProvider struct {
	gate chan struct{}
	err  error
}

func (blockingFailCloseProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}

func (p blockingFailCloseProvider) Close() error {
	<-p.gate
	return p.err
}

type blockingCloseProvider struct{ ch chan struct{} }

func (blockingCloseProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}

func (p blockingCloseProvider) Close() error {
	<-p.ch
	return nil
}

// A close error from a retire that already completed before Close must
// still surface — the error is stashed, not only delivered to the retire
// caller that ignored it.
func TestCloseCollectsCompletedAsyncRetireError(t *testing.T) {
	closeErr := errors.New("close failed")
	release := make(chan struct{})
	constructed := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		close(constructed)
		<-release // ctx-ignoring factory, like a driver without context support
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	go func() {
		_, _ = m.Get(context.Background(), "c1", nil)
	}()
	<-constructed
	m.Invalidate("c1") // async close starts while construction still runs
	close(release)
	waitRetired(t, m)
	if err := m.Close(); !errors.Is(err, closeErr) {
		t.Fatalf("completed retire close error lost: %v", err)
	}
}

// A second Close launched while the first is still tearing down must wait
// and report the same error, not return nil early.
func TestConcurrentCloseReportsSameError(t *testing.T) {
	closeErr := errors.New("close failed")
	release := make(chan struct{})
	constructed := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		close(constructed)
		<-release // ctx-ignoring factory
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	go func() {
		_, _ = m.Get(context.Background(), "c1", nil)
	}()
	<-constructed
	first := make(chan error, 1)
	second := make(chan error, 1)
	go func() { first <- m.Close() }()
	go func() { second <- m.Close() }()
	// Let the first Close win the closeDone race before allowing teardown.
	time.Sleep(20 * time.Millisecond)
	close(release)
	for i, ch := range []chan error{first, second} {
		if err := <-ch; !errors.Is(err, closeErr) {
			t.Fatalf("Close caller %d did not report teardown error: %v", i, err)
		}
	}
}

// A completed close failure from an earlier Invalidate must still reach
// the next InvalidateAndWait — the entry left both the map and pending,
// so the failure would otherwise be invisible to file maintenance.
func TestInvalidateAndWaitSurfacesCompletedCloseError(t *testing.T) {
	closeErr := errors.New("close failed")
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	m.Invalidate("c1") // completed entry: the non-waited retire settles synchronously
	if err := m.InvalidateAndWait("c1"); !errors.Is(err, closeErr) {
		t.Fatalf("completed close failure lost: %v", err)
	}
	// Surfaced once — the record drains rather than sticking forever.
	if err := m.InvalidateAndWait("c1"); err != nil {
		t.Fatalf("drained error must not repeat: %v", err)
	}
}

// The same drain applies to matching configs in InvalidateAndWaitWhere —
// cross-profile file maintenance cannot run after a sibling's close failed.
func TestInvalidateAndWaitWhereSurfacesCompletedCloseError(t *testing.T) {
	closeErr := errors.New("close failed")
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		return closeFailProvider{closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	m.Invalidate("c1")
	match := func(c Config) bool { return c.Kind == "pg" }
	if err := m.InvalidateAndWaitWhere(match); !errors.Is(err, closeErr) {
		t.Fatalf("completed close failure lost to Where: %v", err)
	}
	if err := m.InvalidateAndWaitWhere(match); err != nil {
		t.Fatalf("drained error must not repeat: %v", err)
	}
}

// GetFor constructs a new entry from the supplied config without another
// profile load — callers pick their maintenance lock from that same cfg.
func TestGetForUsesSuppliedConfig(t *testing.T) {
	supplied := Config{Kind: "pg", FilePath: "/from/caller.db"}
	var got Config
	var loads atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(_ context.Context, c Config) (Provider, error) {
		got = c
		return fakeProvider{new(atomic.Bool)}, nil
	})
	m := NewManager(countingLoader{&loads}, r)
	defer func() { _ = m.Close() }()
	if _, err := m.GetFor(context.Background(), "c1", supplied, nil); err != nil {
		t.Fatal(err)
	}
	if got.FilePath != supplied.FilePath {
		t.Fatalf("factory saw cfg %q, want supplied %q", got.FilePath, supplied.FilePath)
	}
	if loads.Load() != 0 {
		t.Fatalf("loader ran %d times for a supplied config", loads.Load())
	}
}

// A pending close that finishes during InvalidateAndWait's own wait lands
// in retireErrs too — the drain must catch it so the failure is reported
// once here and never repeated to the next call.
func TestInvalidateAndWaitDrainsCloseRecordedMidWait(t *testing.T) {
	closeErr := errors.New("close failed")
	gate := make(chan struct{})
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		return blockingFailCloseProvider{gate: gate, err: closeErr}, nil
	})
	m := NewManager(fakeLoader{cfg()}, r)
	defer func() { _ = m.Close() }()
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	// Invalidate registers the pending close, then parks inside the gated
	// provider Close — the record is appended only when the gate opens.
	go m.Invalidate("c1")
	deadline := time.Now().Add(5 * time.Second)
	for {
		m.mu.Lock()
		n := len(m.pending)
		m.mu.Unlock()
		if n == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("pending close never registered")
		}
		time.Sleep(time.Millisecond)
	}
	done := make(chan error, 1)
	go func() { done <- m.InvalidateAndWait("c1") }()
	select {
	case err := <-done:
		t.Fatalf("InvalidateAndWait returned while the close was gated: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(gate) // finish() records the error AND closes closeCh
	if err := <-done; !errors.Is(err, closeErr) {
		t.Fatalf("mid-wait close failure not reported: %v", err)
	}
	// The same failure was both returned to the waiter and recorded — the
	// drain must consume it so it is not reported a second time.
	if err := m.InvalidateAndWait("c1"); err != nil {
		t.Fatalf("drained error must not repeat: %v", err)
	}
}

// GetFor must not serve an entry built from an older config than the
// caller's — the supplied config rebuilds the entry so the caller's
// maintenance lock always covers the file the provider actually opens.
func TestGetForRetiresStaleEntry(t *testing.T) {
	old := Config{Kind: "pg", FilePath: "/old.db"}
	fresh := Config{Kind: "pg", FilePath: "/new.db"}
	closed := new(atomic.Bool)
	var got Config
	var calls atomic.Int32
	r := NewRegistry()
	_ = r.Register("pg", func(_ context.Context, c Config) (Provider, error) {
		calls.Add(1)
		got = c
		return fakeProvider{closed}, nil
	})
	m := NewManager(fakeLoader{old}, r)
	defer func() { _ = m.Close() }()
	if _, err := m.Get(context.Background(), "c1", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := m.GetFor(context.Background(), "c1", fresh, nil); err != nil {
		t.Fatal(err)
	}
	if !closed.Load() {
		t.Fatal("stale-config entry was not retired")
	}
	if got.FilePath != fresh.FilePath {
		t.Fatalf("provider built on %q, want %q", got.FilePath, fresh.FilePath)
	}
	if calls.Load() != 2 {
		t.Fatalf("calls: %d", calls.Load())
	}
}

type countingLoader struct{ calls *atomic.Int32 }

func (l countingLoader) ProfileForConnect(string) (Config, error) {
	l.calls.Add(1)
	return Config{Kind: "pg"}, nil
}

// Register(nil) must fail at the boundary, not panic later inside Open.
func TestRegisterNilFactoryRejected(t *testing.T) {
	r := NewRegistry()
	if err := r.Register("pg", nil); !errors.Is(err, ErrNilFactory) {
		t.Fatalf("nil factory: %v", err)
	}
}

// waitRetired blocks until every tracked provider close settles.
func waitRetired(t *testing.T, m *Manager) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		m.mu.Lock()
		n := len(m.pending)
		m.mu.Unlock()
		if n == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("retire did not settle")
		}
		time.Sleep(time.Millisecond)
	}
}

// A factory must not run for an entry cancelled between dispatch and
// execution — construction would build a provider nobody owns.
func TestConstructSkipsCancelledEntry(t *testing.T) {
	var calls atomic.Int32
	c, cancel := context.WithCancel(context.Background())
	e := &entry{ctx: c, cancel: cancel, loaded: make(chan struct{}), done: make(chan struct{})}
	close(e.loaded)
	cancel()
	e.construct(func(context.Context, Config) (Provider, error) {
		calls.Add(1)
		return fakeProvider{new(atomic.Bool)}, nil
	})
	if calls.Load() != 0 {
		t.Fatal("factory invoked for a cancelled entry")
	}
	if !errors.Is(e.err, context.Canceled) {
		t.Fatalf("err: %v", e.err)
	}
	select {
	case <-e.done:
	default:
		t.Fatal("done not closed")
	}
}

// Uncached Open never reaches the factory on a cancelled context, and a
// provider produced mid-cancellation is closed rather than leaked.
func TestRegistryOpenHonoursContext(t *testing.T) {
	var calls atomic.Int32
	closed := new(atomic.Bool)
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	r := NewRegistry()
	_ = r.Register("pg", func(context.Context, Config) (Provider, error) {
		calls.Add(1)
		return fakeProvider{closed}, nil
	})
	if _, err := r.Open(cancelled, "pg", cfg()); !errors.Is(err, context.Canceled) {
		t.Fatalf("pre-cancelled open: %v", err)
	}
	if calls.Load() != 0 {
		t.Fatal("factory ran on a cancelled context")
	}

	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2()
	if _, err := r.Open(ctx2, "pg", cfg()); err != nil {
		t.Fatal(err)
	}
	// Second registry whose factory cancels the caller mid-construction.
	r2 := NewRegistry()
	_ = r2.Register("pg", func(context.Context, Config) (Provider, error) {
		cancel2()
		return fakeProvider{closed}, nil
	})
	if _, err := r2.Open(ctx2, "pg", cfg()); !errors.Is(err, context.Canceled) {
		t.Fatalf("mid-construction cancel: %v", err)
	}
	if !closed.Load() {
		t.Fatal("cancelled open leaked the constructed provider")
	}
}

type closeFailProvider struct{ err error }

func (p closeFailProvider) TestConnection(context.Context) (*engines.TestConnectionResult, error) {
	return &engines.TestConnectionResult{Success: true}, nil
}
func (p closeFailProvider) Close() error { return p.err }
