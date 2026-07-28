## MODIFIED Requirements

### Requirement: SSE abort signal registration order

The SSE health check stream SHALL register the abort event listener before checking `signal.aborted` in the delay promise. This eliminates the theoretical race where `abort()` fires between the check and the listener registration.

#### Scenario: Client disconnects during health check delay

- **WHEN** the client disconnects while the health check is in the delay between rounds
- **THEN** the abort listener is already registered, the delay resolves immediately via `clearTimeout`, and the generator exits without waiting for the full interval

### Requirement: Health check error logging

All empty catch blocks in the health check and connection management code paths SHALL log errors via `log.warn` or `log.error` instead of silently swallowing them.

#### Scenario: SQL Server pool close fails

- **WHEN** `pool.close()` throws an error in the SQL Server adapter
- **THEN** the error is logged via `log.warn({ err }, 'sqlserver pool close')` instead of being silently swallowed
