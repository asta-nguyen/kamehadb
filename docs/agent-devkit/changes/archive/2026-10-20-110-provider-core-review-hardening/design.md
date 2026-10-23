# Unified provider core review hardening

Issue: #110

## Goal

Close the verified provider-core review regressions while preserving one managed provider owner, exact file-lock selection, and existing app-facing connection behavior.

## Scope

- Make manager retirement atomic with last-waiter departure so an open manager never admits a new caller into an unfinished retired entry. Return `ErrProviderRetired` to callers already waiting when invalidation retires an entry; reserve `ErrManagerClosed` for gets rejected after manager shutdown.
- Let the manager supply the exact cached or newly loaded config to a config-scoped guard. `internal/database` uses that guard to hold the matching file read lock while it obtains the provider. Cache hits do not resolve or decrypt the profile again, and config loading remains single-flight on a manager miss.
- Keep same-file maintenance behavior: every provider for profiles pointing to the canonical file is retired and closed before the file operation, failed closes prevent the operation, and cache cleanup runs before readers can reopen the file.
- Release maintenance-lock map entries after their final holder or waiter exits, so profile churn does not retain every historical file path until app shutdown.
- Preserve the existing one-shot PostgreSQL and MySQL connection-test helpers for unsaved dialog input, including their friendly error classification and test timeouts.
- Preserve the app's legacy Qdrant `UnsupportedAdapter` behavior without registering Qdrant in the public ten-engine core.
- Remove the empty Mongo `CloseAll` and Redis `Shutdown` methods and their call sites. Mongo shutdown continues to stop its terminal-owned shells; the shared database manager remains the provider teardown owner.
- Replace `Manager.Close`'s polling window with close tracking that can wait without spinning.
- Update the connection and provider wiki sections, the provider lifecycle requirements, and the Unreleased changelog entry for the restored test-connection behavior.

The open footprint Task 7 benchmark remains separate. This change does not edit archived #110 artifacts or the footprint plan, split the user's staged change set, or commit it.

## Behavior

- `Manager.GetWithGuard` admits a waiter and resolves its entry through the manager. After config is available, it invokes the optional guard outside both manager and entry locks, then starts or joins construction. It releases the guard exactly once on every return path. `Get` and `GetFor` keep their current signatures and behavior when no guard is needed.
- The last-waiter decision, retired mark, map removal, and pending-close registration are coordinated so a new get cannot join an empty unfinished entry. A get admitted before invalidation returns `ErrProviderRetired` if invalidation retires its entry. A later get on an open manager creates or joins a fresh entry. A get after `Close` returns `ErrManagerClosed`.
- `DB.get` no longer preloads a profile for each SQL, MongoDB, or Redis lookup. The manager loads a profile only when it needs a new entry; both the guard's file lock and the factory use that same config snapshot.
- Maintenance locks count holders and waiters before blocking, then remove their keyed entry after the final release; same-file profiles still share one lock.
- File maintenance continues to coordinate across profiles by canonical file path and to invalidate same-file caches before releasing its write lock.
- Unsaved PostgreSQL/MySQL tests use the existing single-shot helpers. Other connection-test dispatch and saved-profile health checks retain their current behavior.
- A saved legacy Qdrant profile continues to receive empty metadata lists and `UnsupportedAdapter` operation results from the app SQL route. The public core still reports unregistered kinds as selection errors.
- Shutdown has no empty adapter-cache methods: Mongo terminal shutdown remains explicit, and `db.Close` closes managed providers once.

## Edge cases

- A live get races with the last waiter cancelling an unfinished construction: it must not observe `ErrManagerClosed` or join the retired entry, and it must be able to use a fresh entry while the manager remains open.
- Invalidation races with a get waiting for the profile load: the admitted caller receives `ErrProviderRetired`; a subsequent get can load and construct a new provider.
- A config guard blocks behind file maintenance: it holds no manager or entry mutex while blocked, and after maintenance retires the entry it releases the file lock and returns the retirement result without constructing a provider on the replaced file.
- A same-file reader or writer is queued on a lock entry: the entry remains mapped until every holder and waiter releases it, then it is pruned without splitting the file's lock identity.
- A guard is released on context cancellation, config rejection, constructor failure, retirement, and successful lookup.
- Wrong-family checks still run before provider factory dispatch, and the provider config always matches the config used to select the maintenance lock.
- Unsaved PostgreSQL/MySQL tests retain their prior friendly authentication, missing-database, refused, and DNS errors and their helper-defined deadlines.
- Legacy Qdrant lookup remains compatible while unknown kinds in the public `dbcore.Registry` still return `ErrProviderNotRegistered`.
- Mongo terminal shutdown does not close a manager-owned Mongo provider; manager shutdown still closes it once. Redis has no adapter-specific shutdown work.
- Concurrent `Close` calls share one result, pending asynchronous close errors are reported once, and close waits on state changes without a polling loop.

## Interfaces

- Add `Manager.GetWithGuard(ctx, connectionID, check, guard)` and a `ConfigGuard` callback that receives the exact `dbcore.Config` and returns a release function. The manager invokes the guard after config resolution and outside manager/entry locks, then releases it once after provider acquisition or error.
- Document the additive guarded lookup in `dbcore/README.md` for external consumers; do not change the existing `Get` or `GetFor` signatures.
- Keep `Manager.Get` and `Manager.GetFor` source-compatible. `internal/database.DB.get` uses the guarded lookup; `DB.Open` remains an uncached explicit-config probe.
- Replace the raw maintenance-lock lookup with an acquire/release helper that tracks waiters and prunes unused keyed locks; `DB.get`, `DB.Open`, and `DB.WithMaintenance` use it.
- Keep the Wails `ConnectionsService.TestConnection` signature unchanged. Its unsaved PostgreSQL/MySQL dispatch calls the existing provider-package helpers.
- Keep the app-only legacy Qdrant compatibility registration in `internal/database`; do not add Qdrant to `dbcore/providers/all` or the public engine-kind list.
- Remove only the unused Wails-bound `MongoService.CloseAll` and `RedisService.Shutdown` methods and regenerate their wrappers. Keep `MongoService.Shutdown` for terminal shutdown.

### Cross-task constraints

- Keep the public core's ten live engine registrations unchanged; legacy Qdrant compatibility stays in the app integration layer.
- Keep `Manager.Get` and `Manager.GetFor` source-compatible; the config guard receives the exact config used by the provider and never runs under manager or entry locks.
- Release every acquired config guard exactly once, including rejection, cancellation, retirement, and construction errors.
- Preserve cross-profile same-file maintenance ordering, close-error propagation, request cancellation before provider close, and Mongo terminal ownership.
- Retain a maintenance lock key while any caller holds it or waits for it, and remove it only when its reference count reaches zero.
- Unsaved PostgreSQL/MySQL test requests use existing one-shot helpers; saved SQL health checks and other engine probes retain their current behavior.
- Do not edit archived #110 artifacts, change footprint Task 7, split the existing staged change set, or commit.

## Verification

- Before the first source edit, rerun the existing relevant Go checks as the baseline; the reviewer reports they pass on the current staged tree.
- Add focused manager checks for last-waiter/new-get races, invalidation while loading, guard release, close-error collection, and cache-hit loader counts. Run the manager and database race suites.
- Run `go test -count=1 ./...`, `go test -race ./dbcore/... ./internal/database ./internal/api ./internal/mcp`, `go build ./...`, `go vet ./...`, and `pnpm lint:go`.
- Regenerate Wails bindings, confirm only the removed unused service methods disappear, and run `pnpm typecheck`, desktop `tsc --noEmit`, `pnpm lint`, desktop tests, and `pnpm build`.
- Run the DuckDB helper build/handshake check and the wiki validator. Run live PostgreSQL, MySQL, MongoDB, and Redis checks only where the configured Docker fixtures are available; report any unavailable engine explicitly.

## Related context

- [Database support and adapter boundaries](../../../../llm/architecture/engine-support.md)
- [Connections and workspace](../../../../llm/workflows/connections-and-workspace.md)
- [Architecture overview](../../../../llm/architecture/overview.md)

## Previous work

- [Archived unified provider core design](../2026-10-19-110-unified-provider-core/design.md)
- [Archived unified provider core tasks](../2026-10-19-110-unified-provider-core/tasks.md)
- [Open runtime footprint tasks](../../2026-10-13-footprint-and-large-tables/tasks.md)
- [Open runtime footprint delta](../../2026-10-13-footprint-and-large-tables/delta.md)
