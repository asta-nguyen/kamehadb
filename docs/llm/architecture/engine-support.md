# Database Support and Adapter Boundaries

Verification: [~] Confirmed content gap: the legacy engine count, sidecar paths and pre-change DuckDB requirement below are historical baselines, not current behavior. The verified requirement replacement and current-runtime narrative refresh remain unfinished; this checkpoint does not mark the page current.

## Requirements

### ENG-duckdb-runtime

The system SHALL execute DuckDB using the native library embedded in the desktop executable.

#### Scenario: opening DuckDB

- GIVEN a DuckDB file path
- WHEN the adapter opens it
- THEN the in-process go-duckdb driver executes its SQL and metadata requests

Evidence: `main.go`, `internal/engines/duckdb/duckdb.go`, `internal/engines/duckdb/duckdb_test.go`

## Sources

- `main.go`
- `internal/engines/duckdb/duckdb.go`
- `internal/engines/duckdb/duckdb_test.go`

## Supported engines and paths

### Business rules

KamehaDB supports twelve database kinds. Eight use the shared SQL adapter route; four use dedicated sidecar routes.

| Path                    | Database kinds                                                             | Main implementation boundary               |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| SQL adapter path        | PostgreSQL, MySQL, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB | SQL routes and adapters                    |
| Dedicated explorer path | MongoDB                                                                    | Mongo routes and Mongo adapter             |
| Dedicated explorer path | Redis                                                                      | Redis routes and Redis adapter             |
| Dedicated explorer path | Qdrant                                                                     | Qdrant routes and Qdrant client            |
| Dedicated explorer path | TigerBeetle                                                                | TigerBeetle routes and TigerBeetle adapter |

- PostgreSQL has the broadest set of database-specific tools: schema lifecycle, statistics, pgvector, psql, backup, and restore.
- DuckDB is file-based. SQLite has a normal SQL adapter path plus a read-only vec0 vector workflow.
- MongoDB, Redis, Qdrant, and TigerBeetle do not use the generic SQL query route.

### Flow

1. The shared package defines connection kinds, schemas, defaults, and adapter contracts.
2. Connection routes validate the profile and choose either the SQL adapter factory or a dedicated engine path.
3. Desktop hooks call the matching route family for the selected profile kind.

### State changes

- The selected database kind is part of the locally saved connection profile.
- Adapter instances and database sessions are runtime state; metadata such as connection profiles and histories is persisted separately.

### Side effects

- Adapter creation opens engine-specific database clients or file handles when a route needs them.
- Sidecar shutdown closes managed adapters and process-backed sessions.

### Authorization & constraints

- Engine-specific profile schemas and shared kind helpers are defined in packages/shared.
- Default ports and connection URL aliases come from shared constants rather than duplicated frontend/backend literals.
- Optional metadata and statistics capabilities differ by adapter; the UI can receive empty/default values where an adapter does not implement an optional metric.

### Error paths

- Unknown or invalid kinds fail shared profile validation or adapter selection.
- Engine-specific connection failures are returned through the relevant profile test or route error.

### Tests

The recorded FFF test-file search for engine router identifiers found no direct shared adapter-selection test. Engine-specific tests are listed on the individual feature pages where present.

### Related

- [Architecture overview](overview.md)
- [Engine explorers](../workflows/engine-explorers.md)
- [SQL workspace](../workflows/sql-workspace.md)

### Sources

- main.go
- internal/engines/duckdb/duckdb.go
- internal/engines/duckdb/duckdb_test.go
- README.md
- packages/shared/src/index.ts
- packages/shared/src/schemas.ts
- packages/shared/src/types.ts
- apps/sidecar/src/adapters/factory.ts
- apps/sidecar/src/routes/connections.ts
- apps/sidecar/src/routes/sql.ts
- apps/sidecar/src/routes/mongo.ts
- apps/sidecar/src/routes/redis.ts
- apps/sidecar/src/routes/qdrant.ts
- apps/sidecar/src/routes/tigerbeetle.ts
