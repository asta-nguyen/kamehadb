# Engine Explorers

Verification: [x] The MongoDB, Redis, Qdrant, and TigerBeetle route and hook behavior below was checked against current source. Direct route tests were searched for each engine.

## MongoDB explorer

### Business rules

- The MongoDB workspace has dedicated database, collection, document, aggregation, stats, update/delete, and command flows.
- Find and aggregation requests have bounded result sizes. Document update and delete require a non-empty filter.
- MongoDB does not use the SQL adapter route.

### Flow

1. The desktop Mongo hooks call the dedicated /mongo route family for the selected profile.
2. The sidecar adapter performs collection/document operations and returns the bounded results to the view.
3. The user can open an aggregation tab for a database and collection.

### State changes

- Database, collection, document, and aggregation results are view/query state scoped to the connection.

### Side effects

- Read requests query MongoDB. Update and delete requests perform database writes after filter validation.
- Collection and statistics requests may populate sidecar schema/metadata caches.

### Authorization & constraints

- The backend rejects update/delete requests without a filter to avoid unbounded writes.
- Find and aggregation result limits are bounded by route validation.

### Error paths

- Invalid filters, invalid aggregation input, unsupported commands, and adapter failures return route errors to the desktop hook.

### Tests

The recorded FFF test-file search for mongoRouter and Mongo route identifiers in test/spec files returned no direct Mongo explorer route tests.

### Related

- [Database support](../architecture/engine-support.md)

### Sources

- apps/desktop/src/components/mongo-view.tsx
- apps/desktop/src/hooks/use-mongo.ts
- apps/desktop/src/components/workspace-content.tsx
- apps/sidecar/src/routes/mongo.ts
- apps/sidecar/src/adapters/mongodb.ts

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

- Redis has a dedicated browser for key scanning, value inspection, TTL lookup, connection testing, statistics, and issuing a command.
- Key scans use a cursor and a bounded count; the route caps the requested count at 1,000.

### Flow

1. The Redis view loads keys through the dedicated hook and requests subsequent pages with the returned cursor.
2. Selecting a key loads its value and TTL.
3. A command view sends a non-empty command string to the Redis route.

### State changes

- Cursor, selected key, value, and command results live in connection-scoped query or view state.

### Side effects

- Key and stats reads query Redis. The command route sends the requested command to Redis and can therefore execute commands beyond simple reads.

### Authorization & constraints

- Redis uses its dedicated connection profile and route rather than the SQL query safety filter.
- The scan count is bounded by route validation.

### Error paths

- Invalid scan parameters, invalid/empty commands, and Redis client errors are returned by the route and shown by the view.

### Tests

The recorded FFF test-file search for redisRouter and Redis route identifiers in test/spec files returned no direct Redis explorer route tests.

### Related

- [Database support](../architecture/engine-support.md)

### Sources

- apps/desktop/src/components/redis-view.tsx
- apps/desktop/src/hooks/use-redis.ts
- apps/desktop/src/store/workspace-tabs.ts
- apps/sidecar/src/routes/redis.ts
- apps/sidecar/src/adapters/redis.ts

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
