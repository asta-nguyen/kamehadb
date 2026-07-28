## ADDED Requirements

### Requirement: Schema timeline tracking

The system SHALL track schema changes over time by periodically snapshotting table/column/index metadata and storing changelog entries, enabling users to view a timeline of structural changes.

#### Scenario: Enable schema watching

- **WHEN** user enables schema watching for a connection
- **THEN** the system periodically snapshots schema metadata and records changes

#### Scenario: View timeline

- **WHEN** user opens the schema timeline for a connection
- **THEN** the system displays chronological change entries with timestamps and affected tables

#### Scenario: Disable schema watching

- **WHEN** user disables schema watching for a connection
- **THEN** the system stops periodic snapshotting and persists the disabled state

### Requirement: Schema diff view

The system SHALL compute and display a structural diff between two schema snapshots, showing added tables, removed tables, modified columns, and changed indexes.

#### Scenario: Diff two snapshots

- **WHEN** user selects two schema snapshots to compare
- **THEN** the system displays added/removed/modified tables and columns with visual indicators

#### Scenario: Diff a snapshot against live schema

- **WHEN** user selects a past snapshot and the current live schema
- **THEN** the system computes the diff in real-time against the current database state

### Requirement: Migration assistant

The system SHALL generate migration SQL scripts from a schema diff, producing DDL statements that transform the source schema into the target schema.

#### Scenario: Generate migration from diff

- **WHEN** user requests migration generation from a schema diff
- **THEN** the system produces DDL statements (CREATE, ALTER, DROP) for each change

#### Scenario: Review migration script

- **WHEN** user views the generated migration
- **THEN** the system displays the SQL script in an editable Monaco editor for review before execution
