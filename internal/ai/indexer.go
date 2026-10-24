package ai

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/logs"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// indexJob is one shared indexing run: callers wait on done and read err after
// it closes — the channel close provides the happens-before edge. (What)
type indexJob struct {
	done chan struct{}
	err  error
}

// SchemaIndexer coordinates on-demand AI schema indexing for SQL connections.
// Indexing runs at most once per process lifetime per connection, concurrent
// callers for the same connection share the in-flight job, and jobs across
// connections are serialized so only one database is scanned at a time. The
// startup scan was removed (issue #107): the first uncached general AI chat
// for a connection triggers its index instead. (What / Why)
type SchemaIndexer struct {
	st *store.Store

	// globalMu serializes BuildSchemaIndex runs across connections.
	globalMu sync.Mutex

	stateMu   sync.Mutex
	completed map[string]bool
	inFlight  map[string]*indexJob
}

func NewSchemaIndexer(st *store.Store) *SchemaIndexer {
	return &SchemaIndexer{
		st:        st,
		completed: map[string]bool{},
		inFlight:  map[string]*indexJob{},
	}
}

// EnsureConnectionSchemaIndexed returns once the connection has been indexed
// in this process lifetime (or indexing was skipped because no provider is
// enabled). Callers share the in-flight job for the same connection; a caller
// whose ctx is cancelled while waiting gets ctx.Err() and the job keeps
// running for later chats. A failed job is not marked completed, so the next
// call retries. (What / Why)
func (idx *SchemaIndexer) EnsureConnectionSchemaIndexed(ctx context.Context, connectionID string, adapter engines.SQLAdapter) error {
	idx.stateMu.Lock()
	if idx.completed[connectionID] {
		idx.stateMu.Unlock()
		return nil
	}
	job, ok := idx.inFlight[connectionID]
	if !ok {
		job = &indexJob{done: make(chan struct{})}
		idx.inFlight[connectionID] = job
		go idx.run(connectionID, adapter, job)
	}
	idx.stateMu.Unlock()

	select {
	case <-job.done:
		return job.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// run executes one indexing job on an independent context so client
// disconnects cannot abort work other chats are already waiting on. (Why)
func (idx *SchemaIndexer) run(connectionID string, adapter engines.SQLAdapter, job *indexJob) {
	indexed, err := idx.index(context.Background(), connectionID, adapter)

	idx.stateMu.Lock()
	if indexed {
		idx.completed[connectionID] = true
	}
	delete(idx.inFlight, connectionID)
	idx.stateMu.Unlock()

	job.err = err
	close(job.done)
}

// index resolves the active provider, then scans under globalMu so no two
// connections are indexed concurrently. It reports indexed=false when the run
// was skipped (no enabled provider) or failed — both leave the connection
// uncompleted so a later chat retries. (What / Why)
func (idx *SchemaIndexer) index(ctx context.Context, connectionID string, adapter engines.SQLAdapter) (bool, error) {
	settings, err := idx.st.GetAISettings()
	if err != nil {
		logs.Error("ai-indexer", fmt.Sprintf("settings unavailable: %v", err))
		return false, err
	}
	activeConfig, ok := settings.Providers[settings.ActiveProvider]
	if !ok || !activeConfig.Enabled {
		logs.Info("ai-indexer", connectionID+": no active provider configured, skipping schema indexing")
		return false, nil
	}

	idx.globalMu.Lock()
	defer idx.globalMu.Unlock()

	count, err := BuildSchemaIndex(ctx, idx.st, adapter, connectionID, settings.ActiveProvider,
		ProviderConfig(activeConfig), false)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "ECONNREFUSED") || strings.Contains(msg, "ENOTFOUND") || strings.Contains(msg, "connection refused") {
			logs.Warn("ai-indexer", fmt.Sprintf("%s: skipping — provider unavailable: %s", connectionID, msg))
		} else {
			logs.Error("ai-indexer", fmt.Sprintf("%s: failed to index: %v", connectionID, err))
		}
		return false, err
	}
	if count > 0 {
		logs.Info("ai-indexer", fmt.Sprintf("%s: indexed %d tables", connectionID, count))
	} else {
		logs.Debug("ai-indexer", fmt.Sprintf("%s: schema unchanged", connectionID))
	}
	return true, nil
}
