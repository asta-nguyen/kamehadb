# AI Schema Indexing on Demand — Tasks

## Design

[AI Schema Indexing on Demand](design.md)

## Global Constraints

- Remove the AI indexer's all-connections startup call; schema watcher startup remains unchanged.
- On an uncached general SQL AI chat with a user query, await indexing of only the selected connection before relevance search; reuse successful indexes for the rest of the sidecar lifetime, share same-connection in-flight work, and serialize jobs across connections.
- If indexing is skipped or fails, continue through the current relevance-search and full-schema fallback behavior; retain the existing `SCHEMA_CONTEXT_UNAVAILABLE` response if fallback also fails.
- Keep the table-scoped `tableId` path out of full-connection indexing.
- Keep existing schema hashes and local metadata persistence; do not change the chat HTTP contract, regular SQL execution, schema watchers, or non-SQL AI context.

## Tasks

### Task 1 — Replace startup indexing with a serialized per-connection indexer

Files:

- `apps/sidecar/src/index.ts::start`
- `apps/sidecar/src/ai/indexer.ts::indexAllConnections`, `ensureConnectionSchemaIndexed`

Interfaces:

- Export `ensureConnectionSchemaIndexed(connectionId: string, adapter: SqlAdapter): Promise<void>` from `indexer.ts` for the AI chat route in Task 2.
- Reuse `getAISettings` and `buildSchemaIndex`; do not add a new adapter, API, or persistence contract.

Change:

1. Remove the `indexAllConnections` import and startup call from `start`; leave `schemaWatcher.resumeAll()` in its current place.
2. Replace the all-profile loop with the per-connection helper. Track successfully indexed connection IDs and in-flight jobs in module memory, and queue jobs globally so only one schema index runs at a time.
3. Mark a connection complete only after `buildSchemaIndex` resolves. On failure, log the error, clear the failed in-flight job, and allow the queue to continue so a later uncached chat can retry.
4. If the active embedding provider is disabled, skip indexing and resolve without marking the connection complete so the route can keep using its existing fallback.

Verify: Run `pnpm --filter @kamehadb/sidecar typecheck`; confirm `start` no longer calls `indexAllConnections` and the new helper typechecks with the existing `SqlAdapter` contract. No AI indexer tests currently exist.

Progress: todo

Result: none

### Task 2 — Index only when an uncached general SQL chat needs relevance search

Files:

- `apps/sidecar/src/routes/ai.ts::aiRouter POST /chat`
- `apps/sidecar/src/ai/indexer.ts::ensureConnectionSchemaIndexed`

Interfaces:

- Consume `ensureConnectionSchemaIndexed(connectionId, adapter)` from Task 1.
- Keep the existing `/ai/chat` request and response shapes unchanged.

Change:

1. In the existing SQL chat branch, call the helper only when schema context is uncached, the request is not table-scoped, the latest user message exists, and `isSqlKind(profile.kind)` is true.
2. Await the helper before `searchRelevantSchema`, so a first general AI chat searches the completed index. Then retain the current no-results/full-schema fallback and cache behavior.
3. If indexing is skipped or fails, continue to relevance search and the existing full-schema fallback; do not turn an index failure alone into a chat error. Keep table-scoped DDL and other engine flows unchanged.

Verify: Run `pnpm --filter @kamehadb/sidecar build`. During a manual sidecar run with an enabled AI provider and SQL profiles, confirm startup performs no AI schema scan; the first general chat indexes only its selected connection; later chats in the same sidecar lifetime do not rescan it; a later sidecar lifetime checks hashes before reuse; concurrent jobs share/serialize; table-scoped chat skips the full index; a disabled provider skips indexing; and an index failure uses fallback, releases the queue, and can retry on a later cache miss. Confirm a disconnected request does not cancel a shared index job. If no runnable database/provider is available, record those runtime cases as unverified.

Progress: todo

Result: none

### Task 3 — Document the indexing lifecycle

Files:

- `CHANGELOG.md::[Unreleased]`
- `docs/llm/integrations/ai-assistant.md::AI-schema-index-on-demand`, `Flow`, `Side effects`, `Error paths`
- `docs/agent-devkit/changes/2026-10-12-ai-schema-indexing/delta.md::AI-schema-index-on-demand`

Interfaces:

- Merge the requirement block from `delta.md` unchanged into the existing AI Assistant requirements page.
- Document source-verified behavior after Tasks 1 and 2; do not link the wiki page to process artifacts.

Change:

1. Add an Unreleased changelog entry explaining that schema indexing starts on the first uncached general AI chat for the selected SQL connection and that this first chat waits for indexing.
2. Apply the delta requirement to the AI Assistant wiki page, replace the startup-indexing flow description with the on-demand flow, and update side effects and error behavior to match source.
3. Preserve existing edits in the AI Assistant wiki page and update its verification status only after checking every material claim changed by this task.

Verify: Confirm the new requirement block matches `delta.md`, the wiki no longer says the AI indexer starts a schema scan on sidecar startup, the changelog entry is under `[Unreleased]`, and all updated source paths exist and support their claims.

Progress: todo

Result: none

## Files inspected, no change

- `apps/sidecar/src/ai/vec-store.ts::buildSchemaIndex`, `searchRelevantSchema` — existing hash comparison, local persistence, and relevance retrieval remain in use.
- `apps/sidecar/src/routes/sql.ts::getSqlAdapter` — the chat route already obtains the shared SQL adapter; no pool changes are needed.
- `apps/sidecar/src/lib/schema-watcher.ts::schemaWatcher.resumeAll` — watcher lifecycle remains independent of AI indexing.
- `packages/shared/src/index.ts::SqlAdapter`, `isSqlKind` — existing shared adapter contract and SQL-kind helper are sufficient.
- `apps/sidecar/src/ai/` — the wiki records no direct AI route/settings tests, and FFF filename search found no dedicated `ai.test.ts` or `indexer.test.ts`.

## Impact map

Entry: `apps/sidecar/src/index.ts::start`

Flow: `start` → `indexAllConnections` → `buildSchemaIndex`; `POST /ai/chat` → `searchRelevantSchema` → `buildSchemaContext` fallback

State changes: Existing schema embeddings and DDL in local metadata SQLite are refreshed on the first general AI chat for each SQL connection in a sidecar lifetime; no schema migration is planned.

External effects: Customer database metadata reads and provider embedding requests move from startup to the first uncached general AI chat for the selected SQL connection; schema watchers still resume at startup.

Change candidates: `apps/sidecar/src/index.ts`; `apps/sidecar/src/ai/indexer.ts`; `apps/sidecar/src/routes/ai.ts`; `CHANGELOG.md`; `docs/llm/integrations/ai-assistant.md`.

Verification: Sidecar typecheck and build; manual sidecar verification of startup, first-use, serialization, table-scoped, and indexing-failure behavior when a configured provider and SQL database are available.

Verified at: `148b55efc4a7b9cfb5623a99a170f66a2313dfa6`

## Approval Gate

Status: pending

## Decision Log

None.
