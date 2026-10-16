# Database Support and Adapter Boundaries

Verification: [~] Confirmed content gap: the DuckDB requirement below is owned by the in-progress runtime-footprint change and is not refreshed here. The supported-engine list and adapter boundaries were checked against current Go source, but this checkpoint does not mark the page current.

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

KamehaDB supports ten database kinds. Eight use the shared SQL adapter route; MongoDB and Redis use dedicated routes.

| Path                    | Database kinds                                                             | Main implementation boundary             |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| SQL adapter path        | PostgreSQL, MySQL, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB | `internal/engines` registry and adapters |
| Dedicated explorer path | MongoDB                                                                    | Mongo service and adapter                |
| Dedicated explorer path | Redis                                                                      | Redis service and adapter                |

- PostgreSQL has the broadest set of database-specific tools: schema lifecycle, statistics, pgvector, psql, backup, and restore.
- DuckDB and SQLite are file-based. SQLite has a read-only vec0 vector workflow.
- MongoDB and Redis do not use the generic SQL query route.

### Flow

1. `packages/shared` defines connection kinds, schemas, defaults, and adapter contracts.
2. The backend resolves a profile through the `internal/engines` registry, which selects a SQL adapter factory or rejects kinds that use a dedicated route.
3. Desktop hooks call the matching bound service for the selected profile kind.

### State changes

- The selected database kind is part of the locally saved connection profile.
- Adapter instances and database sessions are runtime state; metadata such as connection profiles and histories is persisted separately.

### Side effects

- Adapter creation opens engine-specific database clients or file handles when a service needs them.
- Shutdown closes cached adapters and process-backed sessions.

### Authorization & constraints

- Engine-specific profile schemas and shared kind helpers are defined in packages/shared.
- Default ports and connection URL aliases come from shared constants rather than duplicated frontend/backend literals.
- Optional metadata and statistics capabilities differ by adapter; the UI can receive empty/default values where an adapter does not implement an optional metric.

### Error paths

- Unknown or invalid kinds fail shared profile validation or adapter selection.
- Engine-specific connection failures are returned through the relevant profile test or service error.

### Tests

Searches for a shared adapter-selection test found no direct registry-selection test. Engine-specific tests are listed on the individual feature pages where present.

### Related

- [Architecture overview](overview.md)
- [Engine explorers](../workflows/engine-explorers.md)
- [SQL workspace](../workflows/sql-workspace.md)

### Sources

- main.go
- internal/engines/registry.go
- internal/engines/kinds.go
- internal/engines/duckdb/duckdb.go
- internal/engines/duckdb/duckdb_test.go
- README.md
- packages/shared/src/index.ts
- packages/shared/src/schemas.ts
- packages/shared/src/types.ts
