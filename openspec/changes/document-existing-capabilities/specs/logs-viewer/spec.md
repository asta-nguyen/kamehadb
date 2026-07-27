## ADDED Requirements

### Requirement: Merged log viewing

The system SHALL merge frontend, Tauri, and sidecar logs into a single unified view in the desktop app, with each entry tagged by source.

#### Scenario: View all logs

- **WHEN** user opens the Logs page
- **THEN** the system displays merged log entries from frontend, Tauri, and sidecar sources, sorted by timestamp

#### Scenario: Filter by source

- **WHEN** user selects a source filter (frontend, Tauri, or sidecar)
- **THEN** the system displays only log entries from the selected source

### Requirement: Log severity levels

The system SHALL display log severity levels (info, warn, error, debug) with visual distinction and support filtering by severity.

#### Scenario: Filter by severity

- **WHEN** user selects a severity level filter
- **THEN** the system displays only entries at or above the selected severity

### Requirement: Frontend error forwarding

The system SHALL forward frontend runtime errors to the Tauri log store via the app-logs bridge, making them visible in the Logs page alongside Tauri and sidecar logs.

#### Scenario: Frontend error captured

- **WHEN** a runtime error occurs in the frontend
- **THEN** the system forwards the error to the Tauri log store with a frontend source tag

### Requirement: Sidecar log persistence

The system SHALL persist sidecar logs via pino multistream to both stdout and a log file under the app data directory, with credential redaction for sensitive fields.

#### Scenario: Sidecar logs persisted

- **WHEN** the sidecar writes log entries
- **THEN** the system writes them to both stdout and `${KAMEHADB_DATA_DIR}/logs/sidecar.log`

#### Scenario: Credentials redacted

- **WHEN** a log entry contains password, token, apiKey, authorization, connectionString, or cookie fields
- **THEN** the system replaces those field values with `[REDACTED]` in the persisted log

### Requirement: Dev mode fallback

The system SHALL fall back to localStorage for frontend logs in dev mode (Vite browser without Tauri runtime), since Tauri and sidecar logs require the built Tauri app.

#### Scenario: Dev mode logs

- **WHEN** the app runs in dev mode without Tauri
- **THEN** the Logs page displays only frontend logs from localStorage
