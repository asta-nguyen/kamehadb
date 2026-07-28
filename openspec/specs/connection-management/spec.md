## ADDED Requirements

### Requirement: Connection profile persistence

The system SHALL persist connection profiles in a local SQLite metadata store, including engine kind, host, port, database name, username, SSL flag, file path (for file-based DBs), and connection string (for MongoDB). Passwords SHALL be stored separately from profile metadata.

#### Scenario: Create a new connection profile

- **WHEN** user submits a new connection profile with valid fields
- **THEN** the system stores the profile and returns a unique connection ID

#### Scenario: Update an existing connection profile

- **WHEN** user modifies a saved connection profile
- **THEN** the system updates the profile and invalidates any cached adapter for that connection

#### Scenario: Delete a connection profile

- **WHEN** user deletes a saved connection profile
- **THEN** the system removes the profile, its cached adapter, and its password from the metadata store

### Requirement: Connection health checking

The system SHALL perform periodic health checks on saved connections and report status (connected, disconnected, error) to the frontend.

#### Scenario: Health check succeeds

- **WHEN** the sidecar polls a connection that is reachable
- **THEN** the system reports `connected` status with server version and latency

#### Scenario: Health check fails

- **WHEN** the sidecar polls a connection that is unreachable
- **THEN** the system reports `disconnected` status with an error message

### Requirement: Connection testing before save

The system SHALL allow testing a connection configuration before saving it, with a configurable timeout.

#### Scenario: Test successful connection

- **WHEN** user tests a connection with valid credentials and reachable host
- **THEN** the system returns success with server version and latency in milliseconds

#### Scenario: Test failed connection

- **WHEN** user tests a connection with invalid credentials or unreachable host
- **THEN** the system returns failure with a descriptive error message within the timeout period

### Requirement: Adapter factory routing

The system SHALL route connection profiles to the correct database adapter based on the engine kind, supporting PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, Redis, Qdrant, and TigerBeetle.

#### Scenario: SQL engine routing

- **WHEN** a connection profile has kind `postgres`, `mysql`, `mariadb`, `sqlite`, `sqlserver`, `oracle`, `clickhouse`, or `duckdb`
- **THEN** the system creates a SQL adapter implementing the `SqlAdapter` interface

#### Scenario: Non-SQL engine routing

- **WHEN** a connection profile has kind `mongodb`, `redis`, `qdrant`, or `tigerbeetle`
- **THEN** the system creates a dedicated adapter for that engine type

#### Scenario: Unsupported engine

- **WHEN** a connection profile has an unknown or unsupported kind
- **THEN** the system returns a fallback adapter that reports unsupported for all operations

### Requirement: Password requirement validation

The system SHALL validate password requirements per engine kind, requiring passwords for engines that need authentication and allowing empty passwords for engines that do not.

#### Scenario: Password required engine

- **WHEN** user saves a connection for PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, or ClickHouse without a password
- **THEN** the system rejects the save with a password-required error

#### Scenario: Password optional engine

- **WHEN** user saves a connection for SQLite, DuckDB, Redis, Qdrant, or TigerBeetle without a password
- **THEN** the system accepts the save without error
