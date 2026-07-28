## MODIFIED Requirements

### Requirement: Backup and restore error visibility

All catch blocks in `file-database-maintenance.ts` SHALL log errors via `log.error` with descriptive context. Backup and restore failures SHALL NOT be silently swallowed.

#### Scenario: DuckDB backup fails

- **WHEN** a DuckDB backup operation throws an error
- **THEN** the error is logged via `log.error({ err }, 'duckdb backup')` and the error is propagated to the caller so the user sees a failure indication

### Requirement: Malformed JSON rejection in schema watcher

The schema watcher start endpoint SHALL return HTTP 400 with `{ error: 'INVALID_JSON' }` when the request body is not valid JSON, instead of silently defaulting to an empty object.

#### Scenario: Schema watcher start with malformed body

- **WHEN** a POST request to `/sql/:connectionId/schema/watcher/start` has a body that fails JSON parsing
- **THEN** the endpoint returns HTTP 400 with `{ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }` instead of starting the watcher with default interval
