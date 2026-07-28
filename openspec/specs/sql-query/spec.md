## ADDED Requirements

### Requirement: SQL query execution

The system SHALL execute SQL queries against connected databases via the sidecar SQL adapter and return structured results with columns, rows, row count, execution duration, and a truncated flag.

#### Scenario: Successful query execution

- **WHEN** user runs a valid SELECT query against a connected database
- **THEN** the system returns a `QueryResult` with columns, rows, rowCount, durationMs, and truncated=false

#### Scenario: Query result truncation

- **WHEN** a query returns more rows than the configured limit
- **THEN** the system returns a `QueryResult` with truncated=true and only the limited number of rows

#### Scenario: Query execution error

- **WHEN** user runs an invalid query
- **THEN** the system returns an error response with a descriptive message

### Requirement: SQL safety checking

The system SHALL validate queries against a safety check before execution in read-only mode, rejecting destructive keywords (DROP, TRUNCATE, ALTER, CREATE, INSERT, UPDATE, DELETE, MERGE, GRANT, REVOKE) and allowing only read-only keywords (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN).

#### Scenario: Safe query passes

- **WHEN** user runs a SELECT or WITH query
- **THEN** the system allows execution

#### Scenario: Destructive query blocked

- **WHEN** user runs a query containing DROP, TRUNCATE, or other destructive keywords
- **THEN** the system blocks execution with a reason message

#### Scenario: Multi-statement query blocked

- **WHEN** user runs a query containing a semicolon separating multiple statements
- **THEN** the system blocks execution with "Only one read-only statement can run automatically"

### Requirement: SQL autocomplete

The system SHALL provide context-aware SQL autocomplete suggestions based on the connected database's schema, including table names, column names, and schema names.

#### Scenario: Table name completion

- **WHEN** user types a partial table name in the editor
- **THEN** the system suggests matching table names from the current schema

#### Scenario: Column name completion

- **WHEN** user types a column reference after a table alias
- **THEN** the system suggests matching column names for that table

### Requirement: Query history persistence

The system SHALL persist executed queries in a local history store with connection ID, query text, execution timestamp, duration, row count, and a favorite flag.

#### Scenario: Query saved to history

- **WHEN** a query execution completes
- **THEN** the system stores the query in history with metadata

#### Scenario: Favorite a query

- **WHEN** user marks a history entry as favorite
- **THEN** the system updates the favorite flag and optionally stores a custom name

#### Scenario: Delete history entry

- **WHEN** user deletes a history entry
- **THEN** the system removes it from the history store

### Requirement: Monaco SQL editor

The system SHALL provide a Monaco-based SQL editor with syntax highlighting, multi-tab support, keyboard shortcuts, and query execution via keyboard or button.

#### Scenario: Execute query via keyboard shortcut

- **WHEN** user presses the execute shortcut (Ctrl/Cmd+Enter)
- **THEN** the system runs the current query or selected text

#### Scenario: Multiple query tabs

- **WHEN** user opens multiple workspace tabs
- **THEN** each tab maintains its own editor content and query state independently
