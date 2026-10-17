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
- With SSL enabled and no Root CA PEM, PostgreSQL, MySQL, MariaDB, and SQL Server encrypt traffic but skip server-certificate verification. PostgreSQL does not fall back to plaintext.
- When a Root CA PEM is supplied for PostgreSQL, MySQL, MariaDB, or SQL Server, the driver uses that trust pool to verify the certificate chain and hostname. Invalid PEM or an untrusted/mismatched server certificate fails the connection; it does not fall back to another trust source or plaintext. The PEM is stored locally in the profile and used by the client driver, not sent to the server.
- PostgreSQL `psql`, `pg_dump`, and `pg_restore` use `sslmode=require` through `PGSSLMODE`; they encrypt traffic without verifying the server certificate and do not use the profile Root CA PEM.

### Flow

1. `packages/shared` defines connection kinds, schemas, defaults, and adapter contracts.
2. The backend resolves a profile through the `internal/engines` registry, which selects a SQL adapter factory or rejects kinds that use a dedicated route.
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

Searches for a shared adapter-selection test found no direct registry-selection test. Engine-specific tests are listed on the individual feature pages where present.

Root CA tests cover skip-verification without a PEM and custom-root/hostname verification with one in `internal/engines/tls_test.go`; PostgreSQL rejects invalid PEM before dialing, and MySQL/SQL Server tests cover adapter TLS settings.

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
- internal/engines/tls.go
- internal/engines/tls_test.go
- internal/engines/postgres/postgres.go
- internal/engines/postgres/postgres_test.go
- internal/engines/mysql/mysql.go
- internal/engines/mysql/mysql_test.go
- internal/engines/sqlserver/sqlserver.go
- internal/engines/sqlserver/sqlserver_test.go
- internal/api/terminal.go
- internal/maintenance/pgtools.go
- internal/api/connections.go
- README.md
- packages/shared/src/index.ts
- packages/shared/src/schemas.ts
- packages/shared/src/types.ts
