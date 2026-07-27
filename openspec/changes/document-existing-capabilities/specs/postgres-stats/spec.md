## ADDED Requirements

### Requirement: Database size statistics

The system SHALL retrieve and display database-level size statistics for PostgreSQL connections, including per-schema and per-table sizes (total bytes, index bytes, row estimates).

#### Scenario: View database sizes

- **WHEN** user opens database stats for a PostgreSQL connection
- **THEN** the system displays per-table sizes broken down by schema, including total bytes, index bytes, and row estimates

### Requirement: Table-level statistics

The system SHALL retrieve and display detailed table statistics for PostgreSQL, including row estimate, total bytes, index bytes, toast bytes, bloat bytes, bloat percentage, vacuum/autovacuum counts and timestamps, analyze/autoanalyze timestamps, and live/dead tuple counts.

#### Scenario: View table stats

- **WHEN** user selects a table and opens its stats
- **THEN** the system displays all available table statistics in a structured layout

### Requirement: Index statistics

The system SHALL retrieve and display index usage statistics for PostgreSQL tables, including index name, columns, uniqueness, size bytes, scans, reads, and usage percentage.

#### Scenario: View index stats

- **WHEN** user navigates to index stats for a table
- **THEN** the system displays each index with its size, scan count, and usage percentage

### Requirement: Active connection monitoring

The system SHALL retrieve and display active PostgreSQL connections, including PID, username, application name, client address, backend start time, state, current query, query start time, wait event type, wait event, and duration.

#### Scenario: View active connections

- **WHEN** user opens the active connections view
- **THEN** the system lists all active backend connections with their metadata

#### Scenario: Long-running query visible

- **WHEN** a backend connection has a long-running query
- **THEN** the system displays the query text and its duration in seconds
