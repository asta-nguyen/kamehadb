# AI Schema Indexing on Demand

Issue: #107

## Goal

Keep schema-aware AI relevance search while avoiding metadata scans for every saved SQL connection when the sidecar starts. Index only the SQL connection selected for general AI chat, and let that first chat wait for the index to finish.

## Current behavior

- `apps/sidecar/src/index.ts::start` starts the listener, then calls `indexAllConnections()` in the background before resuming schema watchers.
- `apps/sidecar/src/ai/indexer.ts::indexAllConnections` reads every saved SQL profile sequentially and calls `buildSchemaIndex` for each one.
- `apps/sidecar/src/ai/vec-store.ts::buildSchemaIndex` reads schemas, tables, columns, and indexes from the customer database, compares table hashes, and stores changed embeddings and DDL in local metadata SQLite.
- On an uncached SQL AI chat, `apps/sidecar/src/routes/ai.ts` searches the local index for relevant schema, then falls back to full-schema context when search returns no rows. A `tableId` request uses table-scoped DDL.

## Proposed behavior

1. Remove the AI indexer's all-connections startup call. This stops AI schema scans for saved SQL connections that are never used for AI chat. Schema watcher startup remains unchanged.
2. On an uncached, general SQL AI chat with a user query, call `ensureConnectionSchemaIndexed(connectionId, adapter)` before relevance search. The selected connection's first chat waits for this work to finish. The existing schema hashes, embedding provider selection, and local persistence remain in use.
3. Keep one process-local successful-index marker per connection, share an in-flight promise for concurrent requests to the same connection, and serialize index jobs across connections. Later chats in the same sidecar lifetime do not repeat the full metadata scan. The next sidecar lifetime checks hashes again, matching the existing startup indexing lifecycle.
4. If indexing is skipped or fails, continue through the current relevance-search and full-schema fallback behavior. If fallback also fails, retain the existing `SCHEMA_CONTEXT_UNAVAILABLE` response. A failed index is not marked complete and can be retried on a later uncached general chat.
5. Keep the table-scoped `tableId` path out of full-connection indexing. It continues to build DDL only for its selected table.

## Interfaces

- Replace the internal all-profiles indexer entry point with `ensureConnectionSchemaIndexed(connectionId: string, adapter: SqlAdapter): Promise<void>`.
- Call the helper from the existing `/ai/chat` SQL path immediately before `searchRelevantSchema`; do not change the HTTP request or response contract.
- Keep embeddings and DDL in the existing local metadata SQLite tables. Add no database migration, setting, dependency, or new sidecar route.

## Error and concurrency behavior

- If no active embedding provider is available, skip indexing and preserve the current schema-context fallback.
- Log index failures and allow the request to continue to the existing full-schema fallback. A failed job must release the global queue so another connection can index.
- Concurrent requests for one connection share its indexing job. Jobs for different connections wait in one process-local queue, so the indexer never scans multiple profiles at once.
- The indexing work is not cancelled when the HTTP client disconnects; a completed index remains reusable by later chats.

## Scope boundaries

- Do not change regular SQL execution, connection-pool limits, query timeouts, schema watchers, non-SQL AI context, or the table-scoped DDL path.
- Do not add a UI toggle or change which schema content is sent to the configured AI provider.
- The first general AI chat for a connection can take longer because it now waits for that connection's full metadata scan and embedding work. Large schemas can still produce a noticeable one-connection load; this change removes scans for unused connections and serializes indexing jobs.

## Impact map

Entry: `apps/sidecar/src/index.ts::start`

Flow: `apps/sidecar/src/index.ts::start` → `apps/sidecar/src/ai/indexer.ts::indexAllConnections` → `apps/sidecar/src/ai/vec-store.ts::buildSchemaIndex`; `apps/sidecar/src/routes/ai.ts::POST /chat` → `searchRelevantSchema` → `buildSchemaContext` fallback

State changes: Existing local metadata SQLite schema embeddings and DDL are updated when an SQL connection is first used for general AI chat; no schema migration is planned.

External effects: Customer database metadata reads and configured provider embedding requests move from sidecar startup to the first uncached general AI chat for that connection. Schema watchers continue to start independently.

Change candidates: `apps/sidecar/src/index.ts`; `apps/sidecar/src/ai/indexer.ts`; `apps/sidecar/src/routes/ai.ts`; `CHANGELOG.md`; `docs/llm/integrations/ai-assistant.md`.

Verification: Sidecar typecheck and build; manually confirm startup does not invoke AI schema scans, the first general chat indexes only its selected connection, concurrent requests share/serialize index jobs, table-scoped chat skips full indexing, and index failure retains the existing fallback. These planned checks are pending approval.

Verified at: `148b55efc4a7b9cfb5623a99a170f66a2313dfa6`

## Related context

- [AI Assistant](../../../llm/integrations/ai-assistant.md)

## Open questions

None. The user confirmed that the first general AI chat for a connection may wait for indexing.
