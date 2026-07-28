## ADDED Requirements

### Requirement: Embedded psql shell

The system SHALL provide an embedded PostgreSQL psql shell in the desktop app, using an app-managed psql binary, with multi-tab support and command history.

#### Scenario: Open psql tab

- **WHEN** user opens a psql tab for a PostgreSQL connection
- **THEN** the system launches an embedded psql process connected to the database

#### Scenario: Execute psql command

- **WHEN** user types a command in the psql shell
- **THEN** the system sends it to the psql process and displays the output in the terminal pane

#### Scenario: Multiple psql tabs

- **WHEN** user opens multiple psql tabs
- **THEN** each tab maintains its own independent psql process and session state

### Requirement: PostgreSQL backup

The system SHALL perform PostgreSQL database backups using pg_dump, with progress tracking and output logging, executed as a native Tauri job.

#### Scenario: Start backup

- **WHEN** user initiates a backup for a PostgreSQL connection
- **THEN** the system starts a pg_dump job and provides real-time progress updates

#### Scenario: Backup completes

- **WHEN** the pg_dump job finishes successfully
- **THEN** the system reports success and the backup file path

#### Scenario: Backup fails

- **WHEN** the pg_dump job encounters an error
- **THEN** the system reports the error with the tool log output

### Requirement: PostgreSQL restore

The system SHALL perform PostgreSQL database restores using pg_restore, with progress tracking and output logging, executed as a native Tauri job.

#### Scenario: Start restore

- **WHEN** user initiates a restore from a backup file
- **THEN** the system starts a pg_restore job and provides real-time progress updates

#### Scenario: Restore completes

- **WHEN** the pg_restore job finishes successfully
- **THEN** the system reports success

#### Scenario: Restore fails

- **WHEN** the pg_restore job encounters an error
- **THEN** the system reports the error with the tool log output

### Requirement: Tool job lifecycle

The system SHALL manage native tool jobs (backup, restore) with a lifecycle that includes pending, running, completed, and failed states, with cancellation support.

#### Scenario: Cancel running job

- **WHEN** user cancels a running backup or restore job
- **THEN** the system terminates the native process and updates the job state to cancelled

#### Scenario: Job progress polling

- **WHEN** a tool job is running
- **THEN** the frontend polls for status updates and displays progress in real-time
