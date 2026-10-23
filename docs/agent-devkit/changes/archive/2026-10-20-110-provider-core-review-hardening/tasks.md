# Unified provider core review hardening tasks

## Design

[Unified provider core review hardening](design.md)

## Global Constraints

- Keep the public core's ten live engine registrations unchanged; legacy Qdrant compatibility stays in the app integration layer.
- Keep `Manager.Get` and `Manager.GetFor` source-compatible; the config guard receives the exact config used by the provider and never runs under manager or entry locks.
- Release every acquired config guard exactly once, including rejection, cancellation, retirement, and construction errors.
- Preserve cross-profile same-file maintenance ordering, close-error propagation, request cancellation before provider close, and Mongo terminal ownership.
- Retain a maintenance lock key while any caller holds it or waits for it, and remove it only when its reference count reaches zero.
- Unsaved PostgreSQL/MySQL test requests use existing one-shot helpers; saved SQL health checks and other engine probes retain their current behavior.
- Do not edit archived #110 artifacts, change footprint Task 7, split the existing staged change set, or commit.

## Impact map

Entry: `internal/api/connections.go::ConnectionsService.TestConnection`, `internal/database/database.go::DB.get`, `dbcore/manager.go::Manager.get`.

Flow: desktop Wails call → `ConnectionsService` or SQL/Mongo/Redis service → `internal/database.DB` → `dbcore.Manager` → profile loader and provider registry; file backup/restore goes through `DB.WithMaintenance` and same-file invalidation.

State changes: Manager entry waiters, retirement state, pending closes, and provider ownership change at runtime; profile CRUD remains in metadata SQLite with encrypted credentials; no persistent schema changes.

External effects: profile load/decryption, provider construction and close, file backup/restore, Mongo terminal shutdown, generated Wails service wrappers, and frontend connection-test messages.

Change candidates: `dbcore/manager.go`, `dbcore/manager_test.go`, `dbcore/README.md`, `internal/database/database.go`, `internal/database/database_test.go`, `internal/api/connections.go`, `internal/api/mongo.go`, `internal/api/redis.go`, `internal/api/provider_lifecycle_test.go`, `internal/api/api_test.go`, `main.go`, `apps/desktop/wailsjs/go/api/MongoService.js`, `apps/desktop/wailsjs/go/api/MongoService.d.ts`, `apps/desktop/wailsjs/go/api/RedisService.js`, `apps/desktop/wailsjs/go/api/RedisService.d.ts`, `docs/llm/architecture/engine-support.md`, `docs/llm/workflows/connections-and-workspace.md`, `CHANGELOG.md`, and this change's `delta.md`.

Verification: focused manager/database/API/provider tests, local race suites, Go build/vet/lint, Wails binding regeneration and production build, TypeScript/lint/Vitest, DuckDB helper build/handshake, and wiki validation; live remote-engine checks depend on configured Docker fixtures.

Baseline before source edits: `go test ./dbcore/... ./internal/database ./internal/api` — 259 passed in 20 packages; no failures.

Verified at: `c35d46222b5837ecf44d9d4f770fcb06cedd9e6c` (source map was checked against the current staged working tree; this is its HEAD baseline).

## Tasks

### Task 1 — Make manager retirement atomic and consistent

Files: `dbcore/manager.go::Manager.get`, `dbcore/manager.go::Manager.leave`, `dbcore/manager.go::Manager.retire`, `dbcore/manager.go::Manager.Close`, `dbcore/manager_test.go::TestManagerLastCancelledWaiterRetires`, `dbcore/manager_test.go::TestCloseCollectsAsyncInvalidateCloseError`.

Interfaces: Define the retirement synchronization used by `Get`, last-waiter cancellation, invalidation, and close. Keep existing public `Get` and `GetFor` signatures.

Change: Serialize last-waiter departure with entry retirement and admission so a live get cannot join an empty unfinished entry; return `ErrProviderRetired` to admitted callers retired while waiting for config; keep `ErrManagerClosed` for new gets after `Close`; make pending close registration observable with the retirement mark; retain exactly-once async close-error reporting and replace close polling with state-driven waiting.

Verify: Reproduce the reviewer's 5,000-run cancellation/new-get race with zero manager-closed errors; add a blocked-loader invalidation test followed by a successful get on the still-open manager, plus concurrent close and close-failure checks; run `go test ./dbcore/...` and `go test -race ./dbcore/...`.

Progress: done
Result: `go test ./dbcore/...` and `go test -race ./dbcore/...` — 205 passed in 18 packages; 5,000-round last-waiter/new-get stress, load-invalidation retry, and close tracking pass.

### Task 2 — Guard managed lookups with the manager's config snapshot

Files: `dbcore/manager.go::Manager.GetWithGuard`, `dbcore/manager_test.go`, `dbcore/README.md`, `internal/database/database.go::DB.get`, `internal/database/database.go::DB.maintLock`, `internal/database/database.go::DB.Open`, `internal/database/database.go::DB.WithMaintenance`, `internal/database/database_test.go`.

Interfaces: Add the config-guard callback described in `design.md`; `DB.get` supplies the file read-lock guard while the manager owns cache lookup and profile loading. Replace raw maintenance mutex access with an acquire/release lease shared by managed opens, explicit opens, and maintenance.

Change: Invoke the guard only after config resolution and outside manager/entry locks; release it once on every result. Remove the app-side `ProfileForConnect` preflight from SQL, MongoDB, and Redis managed lookup so cache hits do not query SQLite or decrypt credentials; use the identical config for file-lock selection, family validation, and provider construction. Reference-count the keyed read/write lock before waiting and prune it after the final holder or waiter releases it.

Verify: Add a counting-loader test showing one load on first construction and no additional load on cache hits for SQL, MongoDB, and Redis; assert guard release on rejection, cancellation, retirement, and constructor failure; prove same-file readers and writers share a lock until all waiters exit and that the map entry is then pruned; preserve same-file cross-profile maintenance tests; run `go test ./dbcore/... ./internal/database` and `go test -race ./internal/database`.

Progress: done
Result: `go test ./dbcore/... ./internal/database` — 221 passed in 19 packages; `go test -race ./internal/database` — 12 passed. Guard release, one-load cache hits, shared queued-lock identity, pruning, and existing same-file maintenance checks pass.

### Task 3 — Restore app compatibility and connection-test behavior

Files: `internal/database/database.go::New`, `internal/database/database_test.go`, `internal/api/connections.go::testConnectionByKind`, `internal/api/api_test.go`, `internal/api/mongo.go::MongoService.Shutdown`, `internal/api/redis.go`, `internal/api/provider_lifecycle_test.go`, `main.go::main`.

Interfaces: The bound `ConnectionsService.TestConnection` signature stays unchanged; removed no-op service methods disappear from generated wrappers, and Mongo terminal shutdown remains available.

Change: Route unsaved PostgreSQL/MySQL tests through their existing one-shot helpers; register an app-only Qdrant compatibility provider that wraps `UnsupportedAdapter`; remove Mongo `CloseAll` and Redis `Shutdown` plus call sites while keeping Mongo shell shutdown and manager-owned provider teardown.

Verify: Assert the saved Qdrant SQL route returns empty metadata while query/preview remain unsupported; run existing PostgreSQL/MySQL helper classification and timeout tests; keep `TestProviderLifecycleIsolationAndShutdown` passing; regenerate Wails bindings and confirm only the deleted no-op exports disappear; run focused `internal/database` and `internal/api` tests.

Progress: done
Result: `go test -count=1 ./internal/database ./internal/api ./dbcore/providers/postgres ./dbcore/providers/mysql` — 90 passed in 4 packages. Qdrant fallback and one-shot helper dispatch tests pass; `wails generate module` removed only Mongo `CloseAll` and Redis `Shutdown` wrappers.

### Task 4 — Update provider and connection documentation

Files: `docs/llm/architecture/engine-support.md`, `docs/llm/workflows/connections-and-workspace.md`, this change's `delta.md`, `CHANGELOG.md`.

Interfaces: Merge the approved `ENG-provider-cache-lifecycle` replacement and the two new ENG requirements from `delta.md`; refresh connection-test behavior and current evidence while retaining the existing `[~]` confirmed content gap owned by footprint Task 7.

Change: Document the manager retry/error contract, no-profile-read cache hits, file maintenance across profiles, Qdrant compatibility, and restored PostgreSQL/MySQL dialog-test behavior. Add the user-visible connection-test correction under `[Unreleased]`.

Verify: Run the wiki validator; confirm all requirement evidence paths exist and support their claims, links resolve, and the footprint Task 7 verification limit remains accurately marked.

Progress: done
Result: Wiki delta merged block-for-block; validator checked 17 Markdown files and 23 requirements with 0 errors/warnings. `git diff --check` is clean; connection-test behavior and the Unreleased changelog entry are current.

### Task 5 — Run final repository verification

Files: `apps/desktop/wailsjs/go/api/MongoService.js`, `apps/desktop/wailsjs/go/api/MongoService.d.ts`, `apps/desktop/wailsjs/go/api/RedisService.js`, `apps/desktop/wailsjs/go/api/RedisService.d.ts`, this change's `tasks.md`.

Interfaces: Confirm regenerated Wails surface matches the Go bound services and that the DuckDB helper handshake still works after the provider-core changes.

Change: No behavior changes beyond approved Tasks 1–4; record exact checks and any unavailable live-engine fixtures.

Verify: Run `go test -count=1 ./...`, race tests for dbcore/database/api/mcp, `go build ./...`, `go vet ./...`, `pnpm lint:go`, `pnpm typecheck`, desktop `tsc --noEmit`, `pnpm lint`, desktop tests, `pnpm build`, DuckDB helper build/handshake, and wiki validation. For PostgreSQL/MySQL/MongoDB/Redis, report a live check only if its Docker fixture is running.

Progress: done
Result: Final verification passed: `go test -count=1 ./...` — 350 passed in 32 packages; `go test -race ./dbcore/... ./internal/database ./internal/api ./internal/mcp` — 288 passed in 21 packages; `go build ./...`, `go vet ./...`, `pnpm lint:go`, `pnpm typecheck`, desktop `tsc --noEmit`, `pnpm lint`, and `pnpm test` passed (30 files / 141 tests). `pnpm build` completed after Wails binding generation; only the four removed Mongo `CloseAll` / Redis `Shutdown` wrappers changed. The DuckDB helper build and hello/close handshake passed. Wiki validation checked 17 Markdown files and 23 requirements with 0 errors/warnings; `git diff --check` is clean. MongoDB and Redis Docker fixtures were running for the full Go suite; PostgreSQL and MySQL fixtures were unavailable.

## Files inspected, no change

- `docs/agent-devkit/changes/archive/2026-10-19-110-unified-provider-core/design.md` — completed provider-core scope; archived history remains unchanged.
- `docs/agent-devkit/changes/archive/2026-10-19-110-unified-provider-core/tasks.md` — completed task history; follow-up scope starts in this change.
- `docs/agent-devkit/changes/2026-10-13-footprint-and-large-tables/tasks.md` and `delta.md` — open footprint Task 7 and its separate requirements remain owned by that change.
- `docs/llm/AGENTS.md`, `docs/llm/INDEX.md`, `docs/llm/architecture/overview.md`, `docs/llm/architecture/engine-support.md`, `docs/llm/workflows/connections-and-workspace.md` — wiki conventions, verified architecture context, current ENG requirements, and connection narrative.
- `internal/store/profiles.go` and `internal/engines/kinds.go` — persisted profile validation retains legacy Qdrant and current engine-kind behavior.
- `dbcore/providers/postgres/postgres.go` and `dbcore/providers/mysql/mysql.go` — existing one-shot helpers own the friendly connection-test errors and deadlines.
- `dbcore/duckdriver/` and `scripts/build-duckdb-driver.mjs` — existing helper build and handshake verification path.

## Approval Gate

Status: approved

## Decision Log

2026-10-20 — User approved the full design, tasks, and delta with “fix đi”; implement all planned review fixes.
