# Database Support and Adapter Boundaries

Verification: [~] Confirmed content gap: the DuckDB requirement below is owned by the in-progress runtime-footprint change and is not refreshed here. The supported-engine list and adapter boundaries were checked against current Go source, but this checkpoint does not mark the page current.

## Requirements

### ENG-duckdb-runtime

The system SHALL execute DuckDB using the native library embedded in the desktop executable.

#### Scenario: opening DuckDB

- GIVEN a DuckDB file path
- WHEN the adapter opens it
- THEN the in-process go-duckdb driver executes its SQL and metadata requests

Evidence: `main.go`, `dbcore/providers/duckdb/duckdb.go`, `dbcore/providers/duckdb/duckdb_test.go`

### ENG-legacy-sql-kind-compatibility

The system SHALL preserve the app's unsupported-adapter behavior for retained legacy SQL-route profiles without registering those kinds in the public provider core.

#### Scenario: a saved legacy Qdrant profile uses the SQL route

- GIVEN a saved Qdrant profile retained by the app's profile schema
- WHEN the SQL route requests metadata, preview, or a query
- THEN metadata lists are empty and preview/query operations return the unsupported-adapter error

Evidence: `internal/engines/kinds.go`, `dbcore/engines/adapter.go`, `internal/database/database.go`, `internal/database/database_test.go`

### ENG-provider-cache-lifecycle

The system SHALL share one managed provider entry per connection ID, avoid profile-store reads on live cache hits, and prevent retired entries or constructions from serving callers or repopulating the cache.

#### Scenario: concurrent gets share one provider

- GIVEN multiple callers get the same connection ID concurrently
- WHEN their shared entry finishes construction
- THEN the factory was invoked once and every successful caller receives the same published provider

#### Scenario: a cache hit reuses its loaded config

- GIVEN a live managed provider entry for a connection
- WHEN another caller gets that connection
- THEN the manager reuses the entry without loading or decrypting the profile again

#### Scenario: invalidation races with construction

- GIVEN provider creation is in progress for a connection
- WHEN the manager invalidates that connection before creation finishes
- THEN the late provider is closed once and cannot repopulate the cache

#### Scenario: one waiter cancels

- GIVEN two callers await one entry's factory
- WHEN the first caller cancels while the second still waits
- THEN the entry context remains active and the second caller can receive the provider

#### Scenario: a new get follows last-waiter cancellation

- GIVEN the last caller leaves an unfinished entry while the manager remains open
- WHEN a new caller gets the same connection during retirement
- THEN it does not join the retired entry or receive the manager-closed error and can use a fresh entry

#### Scenario: invalidation retires a caller waiting for profile load

- GIVEN a caller is waiting for a managed entry's profile load
- WHEN the manager invalidates that entry
- THEN the admitted caller receives the provider-retired error and a later get can create a fresh entry

#### Scenario: the manager is closed

- GIVEN the manager has completed shutdown
- WHEN a new caller gets a connection
- THEN the manager-closed error is returned without loading a profile or invoking a factory

Evidence: `dbcore/manager.go`, `dbcore/manager_test.go`, `internal/database/database.go`, `internal/database/database_test.go`

### ENG-provider-capabilities

The system SHALL expose native SQL, MongoDB and Redis capabilities through transport-independent operation interfaces selected by one core without exposing concrete driver adapters or changing existing query languages, serialized results or optional SQL capabilities.

#### Scenario: service requests the wrong family

- GIVEN a MongoDB provider
- WHEN a SQL service calls the typed core SQL capability helper
- THEN the helper returns ErrCapabilityUnsupported before a SQL operation is executed

#### Scenario: app family lookup rejects before construction

- GIVEN a caller requests a SQL, MongoDB or Redis family that does not match the entry config
- WHEN Manager.Get evaluates the app's ConfigCheck on that loaded or cached config
- THEN that request is rejected before factory dispatch and does not poison another accepted caller's entry

#### Scenario: SQL supports an optional operation

- GIVEN a SQL adapter supports native CSV export or metadata-aware preview
- WHEN its provider exposes the SQL capability
- THEN the caller receives the original adapter and retains that optional operation

#### Scenario: alternate MongoDB or Redis implementation

- GIVEN a fake MongoDB or Redis implementation of the public operation interfaces
- WHEN a consumer obtains its capability through the core
- THEN the consumer uses the same typed operations without importing concrete provider adapters

Evidence: `dbcore/provider.go`, `dbcore/capabilities.go`, `dbcore/capabilities_test.go`, `dbcore/manager_test.go`, `dbcore/mongo/contracts.go`, `dbcore/redis/contracts.go`, `dbcore/providers/all/all_test.go`, `internal/database/database.go`

### ENG-provider-close-order

The system SHALL perform the existing cancellation of affected GUI work before closing its managed SQL, MongoDB or Redis provider.

#### Scenario: provider teardown follows cancellation

- GIVEN an existing profile-change or shutdown path cancels affected GUI work
- WHEN that path tears down its managed provider
- THEN all affected request contexts are already cancelled when provider close runs

Evidence: `internal/api/connections.go`, `internal/api/request-lifecycle_test.go`

### ENG-provider-core

The system SHALL provide a public Go database core with explicit registration for the ten supported engine kinds, selective or all-in-one assembly, and no dependencies on application-internal packages or Wails.

#### Scenario: external consumer opens SQLite

- GIVEN a separate Go consumer registers SQLite alone or uses all-in-one assembly
- WHEN it opens a private SQLite fixture through the core
- THEN it can execute and read the fixture without initializing KamehaDB profiles, credential storage or Wails

#### Scenario: selection is invalid

- GIVEN a registry has no provider for a kind or already has a provider registered for it
- WHEN a caller opens the unregistered kind or registers the duplicate
- THEN the core returns a selection error before database work

Evidence: `dbcore/registry.go`, `dbcore/manager_test.go`, `dbcore/providers/all/all.go`, `dbcore/example_test.go`, `dbcore/dependency_boundary_test.go`, `dbcore/engines/kinds_test.go`

### ENG-provider-file-maintenance

The system SHALL serialize file-database maintenance with managed provider opens for the same canonical file and close every provider that can hold that file before modifying it.

#### Scenario: profiles share a file during maintenance

- GIVEN two profiles point to the same canonical SQLite or DuckDB file
- WHEN maintenance begins for either profile
- THEN both managed providers are closed before the file operation, queued opens wait until cache cleanup completes, and providers for unrelated files remain available

#### Scenario: provider close fails before maintenance

- GIVEN a provider for the target file fails to close
- WHEN backup or restore begins
- THEN the file operation is skipped and the close failure is returned

Evidence: `internal/database/database.go`, `internal/database/database_test.go`, `internal/api/connections.go`, `internal/maintenance/filedb.go`

### ENG-provider-session-scope

The system SHALL scope provider close to its owned connection/session rather than terminating an unrelated shared runtime or sibling session.

#### Scenario: sibling sessions share a runtime

- GIVEN two fake provider sessions backed by one fake runtime
- WHEN the manager invalidates one session
- THEN only that session is released and its sibling remains usable

#### Scenario: DuckDB owns its helper

- GIVEN a DuckDB provider owns one initialized helper process
- WHEN that provider closes
- THEN its owned helper is stopped and cleaned up

Evidence: `dbcore/manager_test.go`, `dbcore/providers/duckdb/duckdb.go`, `dbcore/providers/duckdb/duckdb_test.go`

## Sources

- `main.go`
- `dbcore/registry.go`
- `dbcore/provider.go`
- `dbcore/capabilities.go`
- `dbcore/capabilities_test.go`
- `dbcore/dependency_boundary_test.go`
- `dbcore/engines/kinds_test.go`
- `dbcore/mongo/contracts.go`
- `dbcore/redis/contracts.go`
- `dbcore/providers/all/all.go`
- `dbcore/providers/all/all_test.go`
- `dbcore/manager.go`
- `dbcore/manager_test.go`
- `dbcore/example_test.go`
- `dbcore/engines/adapter.go`
- `internal/database/database.go`
- `internal/database/database_test.go`
- `internal/engines/kinds.go`
- `internal/api/connections.go`
- `internal/maintenance/filedb.go`
- `internal/api/request-lifecycle_test.go`
- `dbcore/providers/duckdb/duckdb.go`
- `dbcore/providers/duckdb/duckdb_test.go`

## Supported engines and paths

### Business rules

KamehaDB supports ten database kinds. Eight use the shared SQL adapter route; MongoDB and Redis use dedicated routes.

| Path                    | Database kinds                                                             | Main implementation boundary            |
| ----------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| SQL adapter path        | PostgreSQL, MySQL, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB | `dbcore` registry and provider adapters |
| Dedicated explorer path | MongoDB                                                                    | Mongo service and adapter               |
| Dedicated explorer path | Redis                                                                      | Redis service and adapter               |

- PostgreSQL has the broadest set of database-specific tools: schema lifecycle, statistics, pgvector, psql, backup, and restore.
- DuckDB and SQLite are file-based. SQLite has a read-only vec0 vector workflow.
- MongoDB and Redis do not use the generic SQL query route.
- With SSL enabled and no Root CA PEM, PostgreSQL, MySQL, MariaDB, and SQL Server encrypt traffic but skip server-certificate verification. PostgreSQL does not fall back to plaintext.
- When a Root CA PEM is supplied for PostgreSQL, MySQL, MariaDB, or SQL Server, the driver uses that trust pool to verify the certificate chain and hostname. Invalid PEM or an untrusted/mismatched server certificate fails the connection; it does not fall back to another trust source or plaintext. The PEM is stored locally in the profile and used by the client driver, not sent to the server.
- PostgreSQL `psql`, `pg_dump`, and `pg_restore` use `sslmode=require` through `PGSSLMODE`; they encrypt traffic without verifying the server certificate and do not use the profile Root CA PEM.

### Flow

1. `packages/shared` defines connection kinds, schemas, defaults, and adapter contracts.
2. The backend resolves a profile through the `internal/database` facade over the `dbcore` registry, which selects a SQL adapter factory or rejects kinds that use a dedicated route.
3. PostgreSQL, MySQL/MariaDB, and SQL Server adapters build TLS settings from the saved profile's SSL and Root CA values before opening their database client.
4. Desktop hooks call the matching bound service for the selected profile kind.

### State changes

- The selected database kind is part of the locally saved connection profile.
- The profile stores the SSL toggle and optional Root CA PEM as local connection settings; drivers consume the PEM as client-side trust data.
- Adapter instances and database sessions are runtime state; metadata such as connection profiles and histories is persisted separately.

### Side effects

- Adapter creation opens engine-specific database clients or file handles when a service needs them.
- Shutdown closes cached adapters and process-backed sessions.

### Authorization & constraints

- Engine-specific profile schemas and shared kind helpers are defined in packages/shared.
- SSL and Root CA settings apply to PostgreSQL, MySQL, MariaDB, and SQL Server only. Without a PEM, all four encrypt without server-certificate verification; PostgreSQL keeps TLS required and does not fall back to plaintext.
- Default ports and connection URL aliases come from shared constants rather than duplicated frontend/backend literals.
- Optional metadata and statistics capabilities differ by adapter; the UI can receive empty/default values where an adapter does not implement an optional metric.

### Error paths

- Unknown or invalid kinds fail shared profile validation or adapter selection.
- Engine-specific connection failures are returned through the relevant profile test or service error.
- Invalid Root CA PEM fails before a driver connection is opened. When a PEM is supplied, an untrusted chain or hostname mismatch fails the TLS handshake; without one, the connection is encrypted without verifying server identity.

### Tests

`dbcore/manager_test.go` covers registry selection and lifecycle directly — `TestRegistrySelection`, duplicate-registration rejection, wrong-family rejection before factory dispatch, retired-entry and cancellation cases. `dbcore/example_test.go` exercises both selective and all-in-one assembly. Engine-specific tests are listed on the individual feature pages where present.

Root CA tests cover skip-verification without a PEM and custom-root/hostname verification with one in `dbcore/engines/tls_test.go`; PostgreSQL rejects invalid PEM before dialing, and MySQL/SQL Server tests cover adapter TLS settings.

### Related

- [Architecture overview](overview.md)
- [Engine explorers](../workflows/engine-explorers.md)
- [SQL workspace](../workflows/sql-workspace.md)

### Sources

- main.go
- internal/database/database.go
- dbcore/manager.go
- dbcore/manager_test.go
- dbcore/example_test.go
- dbcore/engines/kinds.go
- dbcore/providers/duckdb/duckdb.go
- dbcore/providers/duckdb/duckdb_test.go
- dbcore/engines/tls.go
- dbcore/engines/tls_test.go
- dbcore/providers/postgres/postgres.go
- dbcore/providers/postgres/postgres_test.go
- dbcore/providers/mysql/mysql.go
- dbcore/providers/mysql/mysql_test.go
- dbcore/providers/sqlserver/sqlserver.go
- dbcore/providers/sqlserver/sqlserver_test.go
- internal/api/terminal.go
- internal/maintenance/pgtools.go
- internal/api/connections.go
- README.md
- packages/shared/src/index.ts
- packages/shared/src/schemas.ts
- packages/shared/src/types.ts
