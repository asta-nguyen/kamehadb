# AI Schema Indexing on Demand — Tasks

## Design

[AI Schema Indexing on Demand](design.md)

## Global Constraints

- Defer SQL schema indexing until an uncached general SQL chat needs relevance search; schema watchers remain independent.
- Maintain a process-local successful-index marker per connection; reuse completed indexes for the remainder of the process lifetime.
- Share an in-flight index job across concurrent requests targeting the same connection.
- Serialize indexing jobs across connections using a global lock so no two connections are indexed concurrently.
- If indexing is skipped or fails, log the event, leave the connection uncompleted so subsequent chats can retry, and proceed to the existing relevance search and full-schema fallback.
- Keep table-scoped requests (`tableId != ""`) out of full connection indexing.
- Detach indexing execution from chat request cancellation so client disconnects do not abort shared in-flight indexing.
- Do not change SQL query execution, connection pools, schema watchers, non-SQL AI workflows, or SQLite storage schemas.

## Impact map

Entry: internal/api/ai.go::AiService.StartChat
Flow: AiService.StartChat -> SchemaIndexer.EnsureConnectionSchemaIndexed -> ai.BuildSchemaIndex -> ai.SearchRelevantSchema -> ai.BuildSchemaContext fallback
State changes: In-memory process-local indexer maps (completed connection IDs, in-flight jobs); local metadata SQLite schema_embeddings and schema_embedding_vectors updated on first uncached general SQL chat
External effects: Customer database schema metadata queries and embedding API calls move from startup to the first uncached general AI chat for that SQL connection
Change candidates: internal/ai/indexer.go; internal/ai/indexer_test.go; internal/api/ai.go; internal/api/ai_test.go; CHANGELOG.md; docs/llm/integrations/ai-assistant.md
Verification: go test -v ./internal/ai/...; go test -v ./internal/api/...; pnpm typecheck; pnpm lint:go; pnpm build
Verified at: pending approval

## Tasks

### Task 1 — Implement SchemaIndexer with singleflight and cross-connection serialization

Files:

- `internal/ai/indexer.go::SchemaIndexer`, `EnsureConnectionSchemaIndexed`
- `internal/ai/indexer_test.go::TestEnsureConnectionSchemaIndexed_*`

Interfaces:

- Export `type SchemaIndexer struct`, constructor `NewSchemaIndexer(st *store.Store) *SchemaIndexer`, and method `EnsureConnectionSchemaIndexed(ctx context.Context, connectionID string, adapter engines.SQLAdapter) error`.
- Consume `store.Store`, `engines.SQLAdapter`, and `BuildSchemaIndex` from `internal/ai/vecstore.go`.

Change:

- Replace the uncalled `IndexAllConnections` function with `SchemaIndexer`.
- Implement in-memory tracking of completed connection IDs (`completed map[string]bool`).
- Implement same-connection in-flight sharing (`inFlight map[string]*indexJob`), allowing concurrent callers to wait on the shared `job.done` channel.
- Implement cross-connection serialization (`globalMu sync.Mutex`), ensuring only one database is scanned at a time.
- Launch index execution in an independent background context so client context cancellation does not abort or corrupt the shared indexing job.
- On success, mark the connection completed in memory, delete the in-flight job, and close `job.done`.
- On failure, log the error (`logs.Warn` or `logs.Error`), do not mark the connection completed, delete the in-flight job, set `job.err`, and close `job.done` so future uncached chats can retry.
- If the active embedding provider is disabled or not configured, log info and return without error, without marking the connection completed.
- Add comprehensive unit tests in `internal/ai/indexer_test.go` covering first-use indexing, subsequent-use caching, same-connection in-flight sharing, cross-connection serialization, disabled provider skip, failure retry, and client cancellation immunity.

Verify:

- `go test -v -race ./internal/ai` passes all indexer tests with zero race conditions.

Progress: done
Result: `go test -v -race ./internal/ai` — all 7 EnsureConnectionSchemaIndexed tests pass, no races

### Task 2 — Integrate on-demand indexing into AiService.StartChat

Files:

- `internal/api/ai.go::AiService.StartChat`, `AiService.getIndexer`
- `internal/api/ai_test.go::TestStartChatOnDemandIndexing`

Interfaces:

- Consume `SchemaIndexer` from `internal/ai`.
- Retain existing `StartChat(input ChatInput) (string, error)` signature and runtime behavior.

Change:

- Add `indexer *ai.SchemaIndexer` field to `AiService` and initialize it in `NewAiService`. Add lazy `getIndexer()` helper for compatibility with tests constructing `&AiService{}` directly.
- In `AiService.StartChat`, under the default SQL branch when `ddl == ""` (uncached):
  - When `input.TableID == ""` (general chat) and `latestUserMsg != ""`, call `_ = s.getIndexer().EnsureConnectionSchemaIndexed(ctx, input.ConnectionID, adapter)` before invoking `ai.SearchRelevantSchema`.
  - If `input.TableID != ""` (table-scoped chat), do not invoke `EnsureConnectionSchemaIndexed`.
  - If indexing fails or returns no relevance hits, proceed to existing `ai.BuildSchemaContext(ctx, adapter)` fallback.
- Add regression tests in `internal/api/ai_test.go` proving:
  - An uncached general SQL chat invokes `EnsureConnectionSchemaIndexed` before `SearchRelevantSchema`.
  - A table-scoped chat (`TableID != ""`) does not invoke connection indexing.
  - An indexing failure still proceeds to full-schema fallback.

Verify:

- `go test -v -race ./internal/api` passes with all tests green.

Progress: done
Result: `go test -v -race ./internal/api` — TestStartChatOnDemandIndexing subtests pass, full package green

### Task 3 — Document the on-demand indexing lifecycle and update changelog

Files:

- `CHANGELOG.md::[Unreleased]`
- `docs/llm/integrations/ai-assistant.md::AI-schema-index-on-demand`, `Flow`, `Side effects`, `Error paths`
- `docs/agent-devkit/changes/archive/2026-10-12-ai-schema-indexing/delta.md::AI-schema-index-on-demand`

Interfaces:

- Merge requirement block from `delta.md` into `docs/llm/integrations/ai-assistant.md`.
- No new external API or breaking changes.

Change:

- Add a bullet under `## [Unreleased]` in `CHANGELOG.md` describing on-demand SQL schema indexing and the first-chat indexing wait.
- Apply the `AI-schema-index-on-demand` requirement to `docs/llm/integrations/ai-assistant.md`.
- Update the AI Assistant wiki flow, side effects, and error handling sections to reflect that SQL schema metadata and embeddings are generated on-demand on the first general AI chat rather than scanning connections at startup.
- Update verification status on the wiki page.

Verify:

- Confirm `delta.md` matches the requirement block added to `docs/llm/integrations/ai-assistant.md`.
- Confirm changelog entry is under `[Unreleased]`.
- Run `pnpm typecheck`, `pnpm lint:go`, and `pnpm test:go` to verify repository-wide consistency.

Progress: done
Result: requirement block merged verbatim into ai-assistant.md; CHANGELOG entry under [Unreleased]; `go test ./...` all green, `golangci-lint` 0 issues, shared+desktop `tsc` clean

## Files inspected, no change

- `internal/ai/vecstore.go` — `BuildSchemaIndex` and `SearchRelevantSchema` already handle table hash comparisons, SQLite embedding upserts, and vector retrieval.
- `internal/ai/schemactx.go` — `BuildSchemaContext` and `BuildTableSchemaContext` remain the fallback and table-scoped context builders.
- `internal/database/database.go` — `database.DB` facade already provides managed SQL adapter lookups.
- `internal/schema/watcher.go` — Schema timeline/diff watchers remain independent and resume on startup.
- `apps/desktop/src/components/ai-chat-panel.tsx` — Desktop UI remains unchanged; the first general chat simply waits for backend preparation before streaming begins.

## Approval Gate

Status: approved

## Decision Log

None.
