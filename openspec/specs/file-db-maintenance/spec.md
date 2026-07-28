## ADDED Requirements

### Requirement: File database backup

The system SHALL create backups of file-based databases (DuckDB and SQLite) by copying the source file to a user-specified destination path, with validation of the source file existence.

#### Scenario: Backup DuckDB file

- **WHEN** user initiates a backup for a DuckDB connection
- **THEN** the system copies the source .duckdb file to the destination path

#### Scenario: Backup SQLite file

- **WHEN** user initiates a backup for a SQLite connection
- **THEN** the system copies the source .sqlite/.db file to the destination path

#### Scenario: Source file missing

- **WHEN** user initiates a backup but the source file does not exist
- **THEN** the system returns a 404 error indicating the source file is missing

### Requirement: File database restore

The system SHALL restore file-based databases from a backup file by copying the backup file to the target database file path, with validation of the backup file existence.

#### Scenario: Restore DuckDB from backup

- **WHEN** user initiates a restore for a DuckDB connection from a backup file
- **THEN** the system copies the backup file to the target .duckdb file path

#### Scenario: Restore SQLite from backup

- **WHEN** user initiates a restore for a SQLite connection from a backup file
- **THEN** the system copies the backup file to the target .sqlite/.db file path

#### Scenario: Backup file missing

- **WHEN** user initiates a restore but the backup file does not exist
- **THEN** the system returns a 404 error indicating the backup file is missing

### Requirement: Maintenance error handling

The system SHALL return structured error responses for file database maintenance operations, distinguishing between missing source files (404), invalid operations (400), and internal errors (500).

#### Scenario: Invalid operation

- **WHEN** user attempts an invalid maintenance operation
- **THEN** the system returns a 400 error with a descriptive message
