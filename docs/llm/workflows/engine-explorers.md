# Engine Explorers

Verification: [~] The MongoDB and Redis explorer sections were re-checked against current Go/Wails source. The Qdrant and TigerBeetle sections are a confirmed content gap: they still describe the removed sidecar routes and have not been re-verified.

## MongoDB explorer

### Business rules

- The MongoDB workspace has dedicated database, collection, document, aggregation, stats, update/delete, and command flows through the Wails-bound `MongoService` and `dbcore/providers/mongo` adapter.
- Find and aggregation pages are bounded to whole documents under a 2 MiB encoded ceiling with a default limit of 100 and a cap of 1,000; `hasMore` comes from a limit+1 lookahead.
- Document and aggregation pages never run a compulsory count. Counts are explicit, separately cancellable requests: `estimated` only for an unfiltered/unsearched collection, `exact` under the effective filter/search. Counts beyond JavaScript's safe-integer range cross the bridge as decimal strings.
- Document update and delete require a non-empty filter.
- Raw commands are bounded to an 8 MiB response; oversized replies return an explicit may-have-executed error and are never automatically replayed.
- MongoDB does not use the SQL adapter path.

### Flow

1. The desktop Mongo hooks call bound `MongoService` methods for the selected profile.
2. The adapter performs collection/document operations and returns bounded pages plus `payloadBytes`/`limitReason` to the view.
3. The user can open an aggregation tab for a database and collection; `$skip`/`$limit` pagination stages are never appended after terminal `$out`/`$merge` stages, which execute at most once.
4. The footer offers optional Count… (estimated/exact) and shows the mode; a failed count never hides already-fetched documents.

### State changes

- Database, collection, document, and aggregation results are view/query state scoped to the connection; displayed counts reset when the effective search/sort context changes.

### Side effects

- Read requests query MongoDB. Update and delete requests perform database writes after filter validation.
- Each request runs under request-scoped cancellation owned by the GUI request layer.

### Authorization & constraints

- The backend rejects update/delete requests without a filter to avoid unbounded writes.
- Find and aggregation limits and negative skips are validated by the adapter; negative limits are rejected, while an omitted/zero limit falls back to the 100-document default.

### Error paths

- Invalid filters, invalid aggregation input, unsupported commands, adapter failures, oversized command responses, and invalid count modes return errors to the desktop hook.

### Tests

- dbcore/providers/mongo/count_test.go (paging validation, lossless large counts, live estimated/exact/search counts)
- dbcore/providers/mongo/aggregate_plan_test.go, ordered_inputs_test.go, request_test.go
- apps/desktop/src/lib/preview-cache.test.ts (cross-engine browse ownership)

### Related

- [Database support](../architecture/engine-support.md)

### Sources

- apps/desktop/src/components/mongo-view.tsx
- apps/desktop/src/components/mongo-data-footer.tsx
- apps/desktop/src/hooks/use-mongo.ts
- apps/desktop/src/components/workspace-content.tsx
- internal/api/mongo.go
- dbcore/providers/mongo/mongo.go

## Embedded mongosh

### Business rules

- The app can start an embedded mongosh session for a saved MongoDB profile.
- Shell session bookkeeping and output buffers live in the sidecar process; they are not persisted in metadata SQLite.
- Closing a shell tab requests session cleanup. Sidecar shutdown stops remaining sessions.

### Flow

1. The desktop opens a Mongo shell workspace tab and asks the sidecar to start a shell process.
2. The sidecar resolves a local mongosh binary or an app-managed copy, starts a PTY session, and streams output.
3. The desktop sends input and resize operations and can reconnect to buffered output for the active process session.
4. Session expiry or sidecar shutdown stops the process.

### State changes

- Session IDs, process handles, and bounded output buffers exist in sidecar memory for the lifetime of the process.
- Shell tab state is part of the local workspace tab store.

### Side effects

- Starting a session launches an external mongosh process with profile connection details.
- Closing the tab or shutting down the sidecar terminates the session.

### Authorization & constraints

- Shell sessions are available for MongoDB profiles only.
- The sidecar uses its managed binary resolver; it does not modify a globally installed mongosh.
- Sessions expire after the configured shell timeout.

### Error paths

- Missing binary resolution, failed process startup, unknown sessions, and process exit are returned as shell errors/events.

### Tests

The recorded FFF test-file search for Mongo shell route/session identifiers in test/spec files returned no direct shell-session test.

### Related

- [Connections and workspace](connections-and-workspace.md)

### Sources

- apps/desktop/src/components/mongo-shell.tsx
- apps/desktop/src/components/workspace-content.tsx
- apps/desktop/src/store/workspace-tabs.ts
- apps/sidecar/src/routes/mongo.ts
- apps/sidecar/src/lib/mongosh.ts
- apps/sidecar/src/index.ts

## Redis explorer

### Business rules

- Redis has a dedicated browser for key scanning, paged value inspection, TTL lookup, connection testing, statistics, and issuing a command through the Wails-bound `RedisService` and `dbcore/providers/redis` adapter.
- Key scans page one SCAN step per request under a 2 MiB encoded page budget. COUNT is a hint capped at 1,000 (default 100); an oversized native batch parks its unreturned keys in a bounded remainder session rather than dropping them.
- Continuations are opaque strings — never JavaScript numbers — bound to the connection scope, pattern, key, and type. Native cursors beyond the safe-integer range therefore cross losslessly.
- Remainder sessions are bounded (8 MiB each, 32 MiB shared, at most 16, five-minute expiry) and are released on drain, explicit release, connection close, and profile change.
- Value pages retain complete members: list/ZSET advance by admitted rank, hash/set use HSCAN/SSCAN with remainder sessions, and strings move in labelled 64 KiB GETRANGE windows (base64 when not valid UTF-8). Partial pages are never presented as the original value, and original-value copy is disabled until complete.
- Legacy whole-value reads return only complete bounded values; oversized values fail with an explicit use-the-paged-inspector error.
- Raw commands run once and are never split or replayed; responses are bounded to 8 MiB with an explicit may-have-executed error.

### Flow

1. The Redis view loads key pages through the dedicated hook, advancing with First/Next and the returned continuation; `done` marks true exhaustion — an empty non-terminal batch is not the end.
2. Selecting a key loads value pages with TTL and type; a re-read TYPE invalidates continuations when a key is deleted or changes type.
3. A command view sends a non-empty command string to the bound service.

### State changes

- Opaque cursors, selected key, value pages, and command results live in connection-scoped query or view state.
- Cached browse results share one bounded owner across SQL, Mongo, and Redis; closing the last owning tab removes every variant and releases orphaned remainder leases only when no retained page still references them.

### Side effects

- Key, value-page, and stats reads query Redis under request-scoped cancellation; the command path sends the requested command and can therefore execute commands beyond simple reads.

### Authorization & constraints

- Redis uses its dedicated connection profile and bound service rather than the SQL query safety filter.
- Scan counts, value-page limits, byte budgets, and session bounds are enforced by the adapter.

### Error paths

- Malformed, foreign-scope, expired, or released continuations return explicit restart errors; oversized members or replies fail without advancing the last valid continuation; deleted/type-changed keys return restart-style errors.

### Tests

- dbcore/providers/redis/paging_test.go (opt-in live Redis via KAMEHADB_TEST_REDIS_ADDR)
- dbcore/providers/redis/request_integration_test.go
- apps/desktop/src/lib/preview-cache.test.ts (shared ownership and lease release)

### Related

- [Database support](../architecture/engine-support.md)

### Sources

- apps/desktop/src/components/redis-explorer.tsx
- apps/desktop/src/components/redis-view.tsx
- apps/desktop/src/hooks/use-redis.ts
- apps/desktop/src/lib/preview-cache.ts
- internal/api/redis.go
- dbcore/providers/redis/redis.go

## Qdrant explorer and vector queries

### Business rules

- Qdrant views list collections, browse points, run similarity search or recommend requests, and show collection statistics.
- The inspected route exposes read-oriented collection and point operations; this route file does not define collection or point mutation endpoints.
- Point and search request limits are bounded at the route.

### Flow

1. The desktop loads collections through the Qdrant hook.
2. Opening a collection loads bounded point pages and collection statistics.
3. Search and recommend views send the selected collection and query inputs to the Qdrant route.

### State changes

- Selected collection, search mode, point ID, and map options are stored in workspace tab state.
- Returned points and collection metadata are query state scoped to the profile.

### Side effects

- Requests call the configured Qdrant endpoint through the Qdrant client.

### Authorization & constraints

- Qdrant uses dedicated routes rather than the SQL adapter route.
- Point browse/search limits are checked by the sidecar.

### Error paths

- Missing collections, invalid search parameters, and remote Qdrant errors are returned to the hook and view.

### Tests

The recorded FFF test-file search for qdrantRouter and Qdrant route identifiers in test/spec files returned no direct Qdrant explorer route tests.

### Related

- [Vector search](vector-search.md)
- [Database support](../architecture/engine-support.md)

### Sources

- apps/desktop/src/components/qdrant-view.tsx
- apps/desktop/src/components/qdrant-query.tsx
- apps/desktop/src/components/qdrant-stats.tsx
- apps/desktop/src/components/qdrant-vector-map.tsx
- apps/desktop/src/hooks/use-qdrant.ts
- apps/desktop/src/store/workspace-tabs.ts
- apps/sidecar/src/routes/qdrant.ts

## TigerBeetle explorer

### Business rules

- The explorer lists and looks up accounts, inspects transfers and balances, and can create accounts and transfers.
- Account and transfer query limits are bounded by the route.
- TigerBeetle IDs and amounts cross the sidecar boundary as strings and are converted to/from BigInt in the adapter.

### Flow

1. The desktop hook calls the dedicated TigerBeetle route for account, balance, and transfer views.
2. The adapter resolves the target host as required by the TigerBeetle client and submits the operation.
3. Create actions validate inputs and return the created operation result to the explorer.

### State changes

- Account, transfer, and balance records are stored in TigerBeetle, not in KamehaDB metadata SQLite.
- The active explorer tab and selected account are workspace state.

### Side effects

- Lookup requests query the TigerBeetle cluster.
- Create account and create transfer operations mutate that cluster.

### Authorization & constraints

- TigerBeetle has dedicated routes and a dedicated adapter.
- Query requests use bounded result sizes. Numeric identifiers and amounts use string representations in JSON to preserve integer precision.

### Error paths

- Invalid IDs, out-of-range request sizes, client errors, and unavailable cluster connections are returned through the route.

### Tests

The recorded FFF test-file search for tigerbeetleRouter and TigerBeetle route identifiers in test/spec files returned no direct explorer route tests.

### Related

- [Database support](../architecture/engine-support.md)

### Sources

- apps/desktop/src/components/tigerbeetle-explorer.tsx
- apps/desktop/src/hooks/use-tigerbeetle.ts
- apps/desktop/src/store/workspace-tabs.ts
- apps/sidecar/src/routes/tigerbeetle.ts
- apps/sidecar/src/adapters/tigerbeetle.ts
