package mcp

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/asta-nguyen/kamehadb/internal/store"
)

// stubSQL stands in for an MCP adapter: it only records how often it is closed.
type stubSQL struct {
	SqlRead
	closes atomic.Int32
}

func (s *stubSQL) Close() error { s.closes.Add(1); return nil }

// useStubAdapters swaps adapter creation for the duration of one test.
func useStubAdapters(t *testing.T, create func(*store.Profile, *store.MCPCredentialBundle) (SqlRead, error)) {
	t.Helper()
	original := newSQLAdapter
	newSQLAdapter = create
	t.Cleanup(func() { newSQLAdapter = original })
}

// managerCallWindow is how long a stub adapter takes to "connect", long enough
// that every concurrent caller reaches creation before the first one finishes.
const managerCallWindow = 50 * time.Millisecond

// Concurrent first calls used to read e.sql outside any lock, so each saw nil and
// built its own adapter; all but one were overwritten and their pools leaked.
func TestManagerConcurrentFirstCallsShareOneAdapter(t *testing.T) {
	st := openTestStore(t)
	m := NewAdapterManager(st)
	t.Cleanup(m.CloseAll)
	profile := createSQLiteProfile(t, st, sqliteDBFile(t), true)

	var created atomic.Int32
	useStubAdapters(t, func(*store.Profile, *store.MCPCredentialBundle) (SqlRead, error) {
		created.Add(1)
		time.Sleep(managerCallWindow)
		return &stubSQL{}, nil
	})

	var wg sync.WaitGroup
	adapters := make([]SqlRead, MaxConcurrentCallsPerProfile)
	for i := range adapters {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := m.WithConnection(context.Background(), profile.ID, func(c *Connection) (any, error) {
				adapters[i] = c.SQL
				return nil, nil
			})
			if err != nil {
				t.Errorf("call %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()

	if got := created.Load(); got != 1 {
		t.Fatalf("created %d adapters for one profile, want 1", got)
	}
	for i := 1; i < len(adapters); i++ {
		if adapters[i] != adapters[0] {
			t.Fatalf("call %d got a different adapter", i)
		}
	}
}

// Invalidate (credential rotated, profile edited or deleted) closes the cached
// adapter. A call still creating one used to store it on the now-orphaned entry,
// leaving a pool open with the credentials that had just been revoked.
func TestManagerInvalidateDuringCreationDoesNotLeakAdapter(t *testing.T) {
	st := openTestStore(t)
	m := NewAdapterManager(st)
	t.Cleanup(m.CloseAll)
	profile := createSQLiteProfile(t, st, sqliteDBFile(t), true)

	stub := &stubSQL{}
	creating, release := make(chan struct{}), make(chan struct{})
	useStubAdapters(t, func(*store.Profile, *store.MCPCredentialBundle) (SqlRead, error) {
		close(creating)
		<-release
		return stub, nil
	})

	result := make(chan error, 1)
	go func() {
		_, err := m.WithConnection(context.Background(), profile.ID, func(*Connection) (any, error) { return nil, nil })
		result <- err
	}()
	<-creating
	m.Invalidate(profile.ID)
	close(release)

	select {
	case err := <-result:
		var toolErr *ToolError
		if !errors.As(err, &toolErr) || toolErr.Code != ErrBusy {
			t.Fatalf("call raced with Invalidate must be refused with BUSY, got %v", err)
		}
	case <-time.After(managerCallWindow * 100):
		t.Fatal("call never returned")
	}
	if got := stub.closes.Load(); got != 1 {
		t.Fatalf("adapter created during Invalidate closed %d times, want 1", got)
	}
}
