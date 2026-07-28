## Why

A comprehensive code review uncovered 14 findings across SQL safety, error handling, performance, and type safety. The most critical (P0) is that `isQuerySafe` is imported but never called in the primary SQL execution path — destructive queries run unguarded. Other findings include 28 silent empty catch blocks, N+1 sequential queries in MongoDB and AI schema context, missing exhaustiveness guards, and oversized files needing decomposition.

## What Changes

- **P0**: Add `isQuerySafe` check to `sql.ts` `/query` endpoint before `adapter.runQuery()`
- **P0**: Add `isQuerySafe` check to `sql-editor.tsx` `executeQuery()` before sending to backend
- **P1**: Add `log.warn`/`log.error` to all 28 empty catch blocks across the sidecar
- **P1**: Fix `sqlserver.ts` empty `catch {}` on pool close — log the error
- **P1**: Fix `ai.ts` `buildSchemaContext` — log error before returning `null`
- **P1**: Fix `sql-schema.ts` — return 400 on JSON parse failure instead of silent default
- **P1**: Add `never` exhaustiveness guard to `getProviderRequirements` switch
- **P2**: Parallelize MongoDB collection sampling in `mongo.ts` with `Promise.all`
- **P2**: Parallelize AI schema context collection stats in `ai.ts` with `Promise.all`
- **P2**: Fix SSE abort event registration order in `connections.ts`
- **P2**: Split `sql-editor.tsx` (1087 lines), `metadata-store.ts` (873), `ai-chat-panel.tsx` (732)
- **P2**: Extract SQLite migrations from `metadata-store.ts` into versioned migration files

## Capabilities

### New Capabilities

(none — all changes target existing capabilities)

### Modified Capabilities

- `sql-query`: Add server-side and client-side `isQuerySafe` enforcement on the primary query execution path
- `ai-chat`: Log errors in `buildSchemaContext` instead of silently returning null; parallelize collection stats with `Promise.all`
- `mongodb`: Parallelize collection sampling with `Promise.all`; add error logging to empty catch blocks
- `connection-management`: Fix SSE abort event registration order to eliminate theoretical race
- `postgres-tools`: Add error logging to empty catch blocks in file-database-maintenance and adapter close

## Impact

- **Sidecar**: `sql.ts`, `ai.ts`, `mongo.ts`, `connections.ts`, `sql-schema.ts`, `sqlserver.ts`, `oracle.ts`, `redis.ts`, `tigerbeetle.ts`, `metadata-store.ts`, `mongosh.ts`, `schema-watcher.ts`, `file-database-maintenance.ts`, `provider.ts`, `vec-store.ts`, `logger.ts`
- **Desktop**: `sql-editor.tsx`, `api-settings-page.tsx`, `ai-chat-panel.tsx`
- **Shared**: No changes to `isQuerySafe` itself — only adding call sites
- **No dependency changes**: All fixes use existing libraries
- **No breaking API changes**: SQL safety check returns 400 with clear error message, consistent with AI path
