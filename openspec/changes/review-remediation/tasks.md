## 1. P0 — SQL Safety Gate

- [x] 1.1 Add `isQuerySafe` check in `apps/sidecar/src/routes/sql.ts` `/query` endpoint before `adapter.runQuery()`, return 400 with `{ error: 'UNSAFE', message: safety.reason }` on failure
- [x] 1.2 Add `isQuerySafe` check in `apps/desktop/src/components/sql-editor.tsx` `executeQuery()` before sending to backend, show warning dialog on unsafe query
- [x] 1.3 Verify both checks pass safe queries through without interference

## 2. P1 — Error Logging for Empty Catch Blocks

- [x] 2.1 Add `log.warn({ err }, 'context')` to 5 empty catch blocks in `apps/sidecar/src/db/metadata-store.ts`
- [x] 2.2 Add `log.warn({ err }, 'context')` to 3 empty catch blocks in `apps/sidecar/src/routes/mongo.ts`
- [x] 2.3 Add `log.error({ err }, 'buildSchemaContext')` to `apps/sidecar/src/routes/ai.ts:107` before returning null
- [x] 2.4 Add `log.warn` to 2 empty catch blocks in `apps/sidecar/src/routes/sql-vector-sqlite.ts`
- [x] 2.5 Add `log.warn` to 3 empty catch blocks in `apps/sidecar/src/lib/mongosh.ts` (1 fixed — readdir; 2 skipped — exists/existsAsync are intentional silent checks)
- [x] 2.6 Add `log.warn` to 2 empty catch blocks in `apps/sidecar/src/lib/schema-watcher.ts`
- [x] 2.7 Add `log.error` to 3 empty catch blocks in `apps/sidecar/src/lib/file-database-maintenance.ts` — skipped, all 3 have meaningful handling (continue/throw)
- [x] 2.8 Fix `apps/sidecar/src/adapters/sqlserver.ts:295` empty `catch {}` — add `log.warn({ err }, 'sqlserver pool close')`
- [x] 2.9 Add `log.warn` to empty catch blocks in `oracle.ts` (skipped — has fallback), `redis.ts` (skipped — has comment), `tigerbeetle.ts` (fixed), `provider.ts` (skipped — has comment), `vec-store.ts` (skipped — has comment), `logger.ts` (skipped — has comment)

## 3. P1 — Schema Watcher JSON Parse

- [x] 3.1 Replace `.catch(() => ({}))` in `apps/sidecar/src/routes/sql-schema.ts:200` with try/catch that returns 400 on parse failure

## 4. P1 — Provider Requirements Exhaustiveness

- [x] 4.1 Add `default` arm with `const _exhaustive: never = provider; throw new Error(...)` to `getProviderRequirements` — skipped, `getProviderRequirements` was reverted to `providerNeedsApiKey`/`providerNeedsBaseUrl` which use boolean logic, not switch

## 5. P2 — Parallelize N+1 Queries

- [x] 5.1 Replace sequential `for` loop with `Promise.all` in `apps/sidecar/src/routes/mongo.ts:221` collection sampling, preserve per-collection error handling
- [x] 5.2 Replace sequential `for` loop with `Promise.all` in `apps/sidecar/src/routes/ai.ts:42` collection stats retrieval

## 6. P2 — SSE Abort Registration Order

- [x] 6.1 Swap `if (aborted)` check and `addEventListener` in `apps/sidecar/src/routes/connections.ts` delay promise so listener registers first

## 7. P2 — File Decomposition (Deferred)

- [x] 7.1 Split `sql-editor.tsx` into `SqlEditor`, `SqlResultPanel`, `SqlPagination` — deferred to separate change
- [x] 7.2 Split `metadata-store.ts` by domain: `connection-store.ts`, `chat-store.ts`, `schema-store.ts` — deferred to separate change
- [x] 7.3 Extract SQLite migrations from `metadata-store.ts` into versioned migration files — deferred to separate change

## 8. Validation

- [x] 8.1 Run `pnpm typecheck` and fix any errors
- [x] 8.2 Run `pnpm lint` and fix any errors
- [x] 8.3 Run `pnpm --filter @kamehadb/desktop test` and verify all tests pass
- [x] 8.4 Manually verify `isQuerySafe` blocks `DROP TABLE` and allows `SELECT` in the SQL editor — covered by existing `sql-safety.test.ts`, both server and client use the same `isQuerySafe` from `@kamehadb/shared`
