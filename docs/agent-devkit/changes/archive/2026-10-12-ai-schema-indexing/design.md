# AI Schema Indexing on Demand

Issue: #107

## Goal

Keep schema-aware AI relevance search while avoiding metadata scans for saved SQL connections at startup. Defer AI schema indexing until a SQL connection is first used in an uncached general AI chat, wait for that connection's indexing to complete, share in-flight indexing across concurrent requests to the same connection, and serialize index jobs across connections.

## Scope

In scope:

- Replace the uncalled all-profiles indexer in `internal/ai/indexer.go` with a process-local `SchemaIndexer` exposing `EnsureConnectionSchemaIndexed(ctx context.Context, connectionID string, adapter engines.SQLAdapter) error`.
- Integrate `SchemaIndexer` into `AiService` in `internal/api/ai.go`, calling it during `StartChat` for uncached general SQL chats before relevance search.
- Share an in-flight indexing job for concurrent requests targeting the same connection.
- Serialize indexing jobs across different connections so no multiple databases are indexed simultaneously.
- Track completed connection IDs in process memory so subsequent chats in the same process lifetime skip re-indexing.
- Run index jobs under an independent context so client disconnects or request cancellations do not abort shared in-flight indexing.
- Retain existing relevance search and full-schema fallback when indexing is skipped (e.g. disabled provider) or fails, allowing failed connections to retry on later chats.
- Add unit tests verifying concurrency sharing, serialization, failure fallback, and retry behavior.
- Document the on-demand lifecycle in `docs/llm/integrations/ai-assistant.md` and add a `[Unreleased]` entry to `CHANGELOG.md`.

Out of scope:

- No changes to driver adapters in `dbcore/providers` or provider lifecycle in `dbcore.Manager`.
- No changes to regular SQL query execution, connection pools, query timeouts, or database backup/restore.
- No changes to schema watchers (`internal/schema/watcher.go`), which continue starting independently for schema timeline and diffing.
- No changes to table-scoped chat context (`tableId != ""`), which continues using table-scoped DDL without full indexing.
- No changes to non-SQL AI workflows (MongoDB schema context, Redis engine prompt).
- No changes to SQLite metadata schemas (`schema_embeddings`, `schema_embedding_vectors`).
- No UI toggles or settings changes.

## Behavior

1. **No startup scans**: When KamehaDB starts, no AI schema indexing jobs are launched for saved SQL connections.
2. **First general SQL chat triggers indexing**: When a user initiates an uncached general AI chat (`tableId == ""` and `latestUserMsg != ""`) targeting a SQL connection:
   - `AiService.StartChat` checks whether the connection has already been indexed in the current process lifetime.
   - If not yet indexed, it invokes `EnsureConnectionSchemaIndexed` before running `SearchRelevantSchema`.
   - The chat request waits for that connection's indexing to finish.
   - Once indexed, the connection is marked completed in memory, and `SearchRelevantSchema` searches the freshly updated vector index.
3. **Subsequent chats reuse the index**: Subsequent general AI chats for that connection in the same process lifetime find the completed marker and immediately proceed to `SearchRelevantSchema` without rescanning schema metadata.
4. **App restart refreshes hashes**: Completed markers are held in process memory and reset on app restart. On the first general chat after restart, `BuildSchemaIndex` computes table hashes and compares them with stored hashes in SQLite, updating embeddings only for tables whose schemas actually changed.
5. **Table-scoped chats bypass indexing**: A chat targeting a specific table (`tableId != ""`) generates table-scoped DDL and does not invoke connection indexing.
6. **Concurrent request sharing**: If multiple chats for the same connection arrive concurrently while indexing is in flight, they share the single running index job and wait for its completion.
7. **Cross-connection serialization**: If requests for different connections require indexing at the same time, their indexing jobs run sequentially through a global mutex.
8. **Client disconnect protection**: Indexing executes with an independent context (`context.Background()`), ensuring that if a client cancels a chat request, the shared index job runs to completion and remains available for subsequent chats.

## Edge cases

1. **No active provider or active provider disabled**: If AI settings have no active provider or the provider has `Enabled == false`, `EnsureConnectionSchemaIndexed` skips indexing without error and does not mark the connection completed. The chat continues to the existing fallback.
2. **Database or embedding failure during indexing**: If `BuildSchemaIndex` returns an error (e.g. database unreachable or provider error):
   - The error is logged (`logs.Warn` for network connection refusal, `logs.Error` otherwise).
   - The connection is NOT marked completed in memory.
   - The in-flight job is cleared and the cross-connection mutex is released.
   - `AiService.StartChat` proceeds to relevance search and the existing full-schema fallback (`ai.BuildSchemaContext`).
   - If full-schema fallback also fails, the existing error `"Schema context is unavailable due to an error"` is returned.
   - A subsequent uncached chat for that connection can retry indexing.
3. **Caller context cancelled while waiting**: If the caller's context expires while awaiting an in-flight job, `EnsureConnectionSchemaIndexed` returns `ctx.Err()`, but the background indexing job continues running to completion.
4. **Empty or non-SQL connections**: Non-SQL connections (MongoDB, Redis) never invoke `EnsureConnectionSchemaIndexed`.
5. **Deleted or missing profile**: If `s.lookup.Get` fails to retrieve an adapter, `StartChat` returns `"Schema context is unavailable due to an error"` before indexing is invoked.

## Interfaces

### Go backend `internal/ai/indexer.go`

```go
package ai

import (
	"context"
	"sync"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

type indexJob struct {
	done chan struct{}
	err  error
}

// SchemaIndexer coordinates on-demand AI schema indexing for SQL connections.
// It ensures that indexing runs at most once per process lifetime for each connection,
// shares in-flight jobs for concurrent requests to the same connection, and serializes
// indexing jobs across different connections. (What / Why)
type SchemaIndexer struct {
	st *store.Store

	globalMu sync.Mutex

	stateMu   sync.Mutex
	completed map[string]bool
	inFlight  map[string]*indexJob
}

func NewSchemaIndexer(st *store.Store) *SchemaIndexer

func (idx *SchemaIndexer) EnsureConnectionSchemaIndexed(ctx context.Context, connectionID string, adapter engines.SQLAdapter) error
```

### Go backend `internal/api/ai.go`

```go
type AiService struct {
	st      *store.Store
	lookup  appengines.SQLLookup
	mongo   *MongoService
	cache   *ttlCache
	emit    terminal.EmitFunc
	indexer *ai.SchemaIndexer

	chatsMu sync.Mutex
	chats   map[string]context.CancelFunc
}
```

In `AiService.StartChat`:

- Construct or reference `indexer`.
- Under the default SQL branch, when `input.TableID == ""` (general chat) and `ddl == ""` (uncached) and `latestUserMsg != ""`:
  - Call `_ = s.getIndexer().EnsureConnectionSchemaIndexed(ctx, input.ConnectionID, adapter)`.
  - Call `ai.SearchRelevantSchema(...)`.
  - Fall back to `ai.BuildSchemaContext(ctx, adapter)` if relevance search returns no hits.

## Verification

1. **Unit tests in `internal/ai/indexer_test.go`**:
   - `TestEnsureConnectionSchemaIndexed_FirstUse`: Verifies indexing runs and marks connection completed.
   - `TestEnsureConnectionSchemaIndexed_SubsequentUse`: Verifies second call does not re-index.
   - `TestEnsureConnectionSchemaIndexed_ConcurrentSameConnection`: Verifies concurrent calls share one indexing job and call `BuildSchemaIndex` exactly once.
   - `TestEnsureConnectionSchemaIndexed_SerializeAcrossConnections`: Verifies indexing for connection A and connection B run serially, not concurrently.
   - `TestEnsureConnectionSchemaIndexed_DisabledProvider`: Verifies indexing is skipped and not marked completed when active provider is disabled.
   - `TestEnsureConnectionSchemaIndexed_FailureRetry`: Verifies failed indexing is not marked completed and allows a subsequent call to retry.
   - `TestEnsureConnectionSchemaIndexed_ClientDisconnectKeepsJob`: Verifies cancelled caller context does not abort the in-flight indexing job.
2. **Integration tests in `internal/api/ai_test.go`**:
   - Verifies `StartChat` on uncached general SQL chat invokes indexing before relevance search.
   - Verifies `tableId != ""` skips full-connection indexing.
   - Verifies indexing failure gracefully falls back to full schema context.
3. **Automated test suite & linters**:
   - `pnpm test:go` (backend tests pass).
   - `pnpm lint:go` (golangci-lint passes with 0 issues).
   - `pnpm typecheck` (desktop TypeScript passes).
   - `pnpm build` (full Wails build completes cleanly).

## Related context

- [AI Assistant](../../../../llm/integrations/ai-assistant.md)
