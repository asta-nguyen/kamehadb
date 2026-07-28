## MODIFIED Requirements

### Requirement: Query execution safety gate

The system SHALL validate every SQL query through `isQuerySafe` before execution on both the server-side (`/sql/:connectionId/query` endpoint) and the client-side (`executeQuery` in the SQL editor). The server-side check SHALL return HTTP 400 with `{ error: 'UNSAFE', message: <reason> }` when the query fails safety validation. The client-side check SHALL warn the user before sending an unsafe query to the backend.

#### Scenario: Destructive query blocked server-side

- **WHEN** a user submits `DROP TABLE users` to `/sql/:connectionId/query`
- **THEN** the sidecar returns HTTP 400 with `{ error: 'UNSAFE', message: 'DROP is not allowed' }` and the query is never passed to the adapter

#### Scenario: Destructive query warned client-side

- **WHEN** a user types `DROP TABLE users` in the Monaco editor and clicks Run
- **THEN** the SQL editor shows a warning dialog indicating the query is unsafe before attempting execution

#### Scenario: Safe query passes through

- **WHEN** a user submits `SELECT * FROM users WHERE id = 1`
- **THEN** the query passes `isQuerySafe` on both client and server, executes normally, and returns results

### Requirement: Provider requirements exhaustiveness

The `getProviderRequirements` function SHALL include a `default` arm with a `never` type assertion to guarantee compile-time exhaustiveness. If a new provider is added to the `AIProvider` union without updating the switch, TypeScript SHALL produce a compile error.

#### Scenario: New provider added without switch update

- **WHEN** a developer adds `'anthropic'` to the `AIProvider` union type without adding a case to `getProviderRequirements`
- **THEN** TypeScript reports a compile error on the `const _exhaustive: never = provider` line, forcing the developer to handle the new provider
