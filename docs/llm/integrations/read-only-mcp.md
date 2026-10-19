# Read-only MCP Server

Verification: [x] MCP listener, profile scope, managed-account permissions, tool limits, call history, and error paths were checked against current Go source and tests.

KamehaDB exposes a local Model Context Protocol (MCP) endpoint so supported AI clients can inspect opted-in database profiles. The endpoint is separate from the Wails-bound management service and listens only on loopback.

## Requirements

### MCP-account-provisioning

The system SHALL use generated managed-account credentials for server-backed MCP reads, use saved profile credentials only for explicit provisioning and Revoke, and scope engine-specific read grants to the configured database: PostgreSQL CONNECT/USAGE/SELECT, MySQL/MariaDB SELECT, SQL Server `db_datareader`, or MongoDB `read`.

#### Scenario: managed account serves a database profile

- GIVEN a supported server-backed profile has a ready managed MCP account
- WHEN an MCP database tool opens that profile
- THEN the adapter uses the generated credential and the database account has only the engine-specific read grants for the configured database

Evidence: `internal/api/mcp.go`, `internal/mcp/manager.go`, `internal/mcp/provisioner.go`

### MCP-call-history-capture

The system SHALL record request arguments and call summaries for database-backed MCP tools without storing returned database rows or documents in history or changing the tool response.

#### Scenario: successful query is summarized

- GIVEN an enabled MCP `sql_query` call returns two rows
- WHEN the tool handler completes
- THEN history stores its request arguments and item count without the rows, while the original MCP response still contains them

#### Scenario: rejected query stores its stable error code

- GIVEN `sql_query` rejects an unsafe statement
- WHEN the tool handler completes
- THEN history stores the request arguments and error code with no item count, and `list_mcp_profiles` does not create a history entry

Evidence: `internal/mcp/jsonrpc.go`, `internal/store/mcp.go`, `internal/mcp/mcp_test.go`

### MCP-call-history-limits

The system SHALL prune history older than 30 days and return no more than the newest 50 entries.

#### Scenario: old entries are removed and recent entries are capped

- GIVEN history contains an expired entry and more than 50 recent entries
- WHEN the store initializes or history is read
- THEN expired entries are removed and at most the newest 50 entries are returned

Evidence: `internal/store/mcp.go`, `internal/store/store_test.go`

### MCP-call-history-recording

The system SHALL default history to enabled for new and existing metadata stores, then preserve old entries and prevent new ones when recording is disabled.

#### Scenario: history defaults on and disabling it retains existing entries

- GIVEN a fresh store or a legacy store with an MCP settings row
- WHEN the metadata store initializes and recording is later disabled
- THEN history starts enabled, existing entries remain, and later calls are not added

Evidence: `internal/store/mcp.go`, `internal/store/store_test.go`, `internal/api/mcp.go`

### MCP-call-history-ui

The desktop SHALL show recorded inputs and summaries with a plain-text storage warning and controls to disable recording or clear history.

#### Scenario: MCP Logs displays local history controls and an empty or populated list

- GIVEN MCP call-history settings and entries are available
- WHEN the MCP Server Logs tab is rendered
- THEN the user sees the recording toggle, Clear History action, local-storage warning, and recorded inputs and summaries without database results

Evidence: `apps/desktop/src/components/mcp-settings-section.tsx`, `apps/desktop/src/components/mcp-settings-section.test.tsx`, `internal/api/mcp.go`

### MCP-database-scope

The system SHALL restrict SQL metadata arguments and database-list results, MongoDB database arguments and database-list results, and SQLite metadata to the selected profile's configured database or `main`.

#### Scenario: MCP requests data outside the selected profile

- GIVEN an MCP-enabled server profile is configured for database `app`
- WHEN a client lists databases or requests SQL or MongoDB metadata or data for another database
- THEN the MCP server exposes only `app` in SQL and MongoDB database lists and rejects requests for another database before querying it

#### Scenario: SQLite metadata names another database

- GIVEN an MCP-enabled SQLite profile uses a local file
- WHEN a metadata tool names a database or schema other than `main`
- THEN the tool rejects the request before querying the file

Evidence: `internal/mcp/manager.go`, `internal/mcp/tools.go`, `internal/mcp/mcp_test.go`

### MCP-listener-loopback

The system SHALL bind its MCP endpoint to `127.0.0.1/mcp` on the configured port, defaulting to `13979`, and leave the ordinary workspace available when binding fails without choosing another port.

#### Scenario: configured port is unavailable

- GIVEN another process owns the configured MCP port
- WHEN the MCP listener starts
- THEN MCP reports `unavailable`, keeps the configured port, and the Wails workspace continues running

Evidence: `internal/mcp/runtime.go`, `internal/store/mcp.go`, `internal/mcp/mcp_test.go`, `main.go`

### MCP-mongodb-auth-probe

The system SHALL stop MongoDB managed-account provisioning unless an unauthenticated `listCollections` probe proves access control is enabled.

#### Scenario: MongoDB permits unauthenticated reads

- GIVEN a MongoDB profile can list collections without credentials
- WHEN the user prepares a managed MCP account
- THEN provisioning stops before creating an account

Evidence: `internal/mcp/provisioner.go`

### MCP-profile-allowlist

The system SHALL serve only supported profiles explicitly enabled for MCP, requiring a ready managed account for server-backed engines and using a dedicated read-only file adapter for SQLite.

#### Scenario: a disabled or unprovisioned profile is requested

- GIVEN a profile is disabled for MCP or its required managed account is not ready
- WHEN a client calls a database-backed tool for that profile
- THEN the call is rejected before an adapter serves the database

Evidence: `internal/store/migrate.go`, `internal/store/profiles.go`, `internal/mcp/manager.go`, `internal/mcp/mcp_test.go`

### MCP-query-bounds

The system SHALL bound MCP database work to 1,000 SQL rows, 1,000 MongoDB results, a 30-second query budget, four concurrent calls per profile, and a MongoDB `skip` of at most 100,000, with a default result limit of 100.

#### Scenario: requested result exceeds MCP limits

- GIVEN a client requests more than the default result count or MongoDB skip cap
- WHEN the tool executes the request
- THEN it clamps results to the configured maximum and reports whether SQL or MongoDB results were truncated

Evidence: `internal/mcp/manager.go`, `internal/mcp/tools.go`, `internal/mcp/errors.go`, `internal/mongo/mongo.go`

### MCP-read-only-tool-surface

The system SHALL register only ten read-oriented tools for profile discovery, SQL metadata and queries, and MongoDB metadata and reads.

#### Scenario: a client lists MCP tools

- GIVEN the MCP listener is running
- WHEN a client calls `tools/list`
- THEN it receives the ten supported tools and no database write tool

Evidence: `internal/mcp/tools.go`, `internal/mcp/jsonrpc.go`, `internal/mcp/mcp_test.go`

### MCP-sql-mongo-read-only

The system SHALL reject unsafe SQL statements and MongoDB aggregation pipelines containing `$out` or `$merge`, while leaving database permissions as the SQL write-prevention boundary.

#### Scenario: a client submits a write operation

- GIVEN a profile is enabled for MCP
- WHEN `sql_query` receives a chained, destructive, or unsupported-leading SQL statement, or `mongo_aggregate` receives `$out` or `$merge`
- THEN the operation is rejected before it can write through the MCP adapter

Evidence: `internal/mcp/tools.go`, `internal/sqlsafety/sqlsafety.go`, `internal/mongo/mongo.go`, `internal/mcp/mcp_test.go`

## Flow

1. On app startup, `main.go` opens metadata SQLite, constructs the bound `McpService`, and starts the `mcp.Runtime` listener alongside Wails. Listener status is `listening`, `unavailable`, or `stopped`.
2. In **API Settings → MCP Server**, the desktop reads listener settings, enabled profiles, and managed-account status via `McpService` bindings. For server database profiles, **Create read-only account** asks the backend to generate the credential, encrypt it into local metadata SQLite, reload and verify it, then provision and verify the DB account. The desktop never receives the credential. SQLite needs no account. The user explicitly enables the profile after setup.
3. The **Logs** tab under MCP Server settings has a local call-history toggle, a recent-call list, and a Clear History action. The list resolves profile names when available and falls back to profile IDs after removal.
4. The desktop provides copyable snippets for Codex, Claude Code, Devin CLI, and OpenCode; it does not edit client config files. Token rotation requires updating the snippets.
5. MCP clients send stateless Streamable HTTP JSON-RPC `POST` requests to `http://127.0.0.1:<port>/mcp` with `Authorization: Bearer <token>`.
6. Every database tool asks the `mcp.Manager` to re-read the profile and check its allowlist. Server database calls require a ready managed-account record and an in-memory credential restored from encrypted local storage. Missing credentials fail closed with no fallback to saved profile credentials. SQLite calls use the dedicated read-only adapter.

For MongoDB, the MCP `mongoScoped` adapter returns only the configured profile database from its database-list tool; it does not call the general adapter's broader database-list method. Requests for another database are rejected before the adapter call. The generated user's `read` role is an additional database-level boundary.

## State changes

- The singleton `mcp_settings` row stores the listener port and a random 32-byte base64url bearer token in metadata SQLite. Both survive restarts; listener status is runtime-only.
- The same `mcp_settings` row stores whether MCP call history is enabled. `mcp_call_history` stores tool inputs and call metadata in local metadata SQLite; rows expire after 30 days. Returned database rows and documents are not stored.
- `connection_profiles.mcp_enabled` stores the per-profile allowlist flag and defaults to disabled. Migration disables legacy enabled server profiles that lack managed accounts while preserving SQLite settings.
- `mcp_managed_accounts` stores the profile ID, an opaque reference used to derive the generated DB principal, lifecycle state, and an AES-256-GCM encrypted credential bundle. The random 32-byte encryption key is stored in the OS keychain (service `kamehadb-mcp-vault`, account = absolute metadata DB path). A legacy `<dbPath>.mcp.key` is moved into the keychain on first read; when no keychain is available (e.g. headless Linux) the key stays in that file with owner-only permissions and a warning is logged. Only a keychain "not found" result allows writing a key, so a locked keychain never overwrites an existing one. Copying the SQLite DB or the app data directory does not reveal the credentials unless the key file fallback is in use.
- On app startup, ready credentials are decrypted and loaded into process memory. Credentials are bound to their profile and account reference, and invalid ciphertext or a missing key fails closed. The desktop does not hydrate credentials after startup.
- Disabling MCP retains the managed DB account and encrypted credential. Revoke disables MCP first, closes the adapter, drops the exact generated principal, then removes the local account record and ciphertext. A failed database revoke retains state for retry. A `prepared` account can be discarded without a DB call because no DB write has started.
- Legacy managed-account rows without encrypted SQLite credentials remain unavailable to MCP until revoked and recreated. Current sources do not establish whether an OS Keychain value from an older version is separately removed.
- While a managed account exists, changing the profile kind or target, toggling SSL, changing the saved username/password, or deleting the profile is rejected until Revoke. The Root CA PEM remains editable; the updated trust data is used by subsequent managed-account database connections.
- MCP adapters and decrypted credentials are process-local. Profile updates, deletions, credential changes, and allowlist changes invalidate cached adapters; app shutdown closes adapters and clears decrypted secrets.

## Authorization & constraints

- The public MCP listener requires a bearer token and compares equal-length values in constant time. It binds to loopback only.
- Settings and account management run through the bound `McpService` inside the app process; they are not mounted on the MCP listener.
- PostgreSQL, MySQL/MariaDB, and SQL Server apply native query timeouts; MongoDB applies `maxTimeMS` (context deadline); SQLite opens with `mode=ro` and each call runs under a context deadline.
- If a native timeout cannot be applied, the query fails closed with `TIMEOUT_UNAVAILABLE`; recognized driver timeout errors map to `QUERY_TIMEOUT`.
- A bind conflict leaves MCP `unavailable`; retry uses the configured port. KamehaDB's ordinary workspace continues to run.
- `docker-init/MCP-READONLY.md` describes direct grant fixtures. The repository's default MongoDB Docker service has no authentication, so its managed-account probe correctly refuses it.

## MCP tool call history

### Record details

- History records the nine database-backed SQL and MongoDB tools. `list_mcp_profiles` is excluded because it reads local profile metadata rather than a customer database.
- Recording defaults on for new and existing metadata databases. Turning it off stops new records and retains existing ones; Clear History deletes all records.
- Records expire after 30 days. History reads return the newest 50 entries.
- A record stores the profile ID, tool name, validated input, timestamp, success/error status, elapsed duration, item count, truncation flag, and a stable error code on failure.
- `item_count` is the length of the primary result array: SQL `rows`, MongoDB `documents`, or a metadata list/describe array. Failed calls have no count and are not truncated.
- Inputs are stored locally as plain text and may contain sensitive SQL literals or filters. The settings UI explains this and provides the toggle and clear action.
- Returned rows and documents are not persisted or added to history summaries.

### Flow

1. `Runtime.callMethod` dispatches each MCP tool handler, then records the request arguments, elapsed time, item count, truncation state, or stable error code for database-backed calls. It returns the original MCP result unchanged.
2. Wails-bound `McpService` methods read recent history, update the recording flag, and clear history inside the app process. These management calls are separate from the public MCP listener.
3. The desktop uses the existing MCP settings query and API Settings section to display local inputs and summaries. It never renders returned database content.

### State changes

- `mcp_settings.history_enabled` persists the recording toggle and defaults to enabled.
- `mcp_call_history` stores the call metadata and serialized input without a result-payload column. Profile IDs remain stored if the corresponding connection is deleted.
- Disabling recording does not delete history. Clear History deletes all entries; startup, writes, and reads prune expired records.

### Side effects

- Each enabled database-backed MCP call attempts to write a local metadata row. It does not write to the customer database or change the MCP tool response.
- If local history persistence fails, the MCP tool result is still returned, but that call may have no history entry.

### Authorization & constraints

- History management uses the Wails-bound service inside the app process; the public listener's bearer token does not apply to these desktop calls.
- Tool inputs are stored in the local metadata database without a new encryption layer. Users can disable future recording or clear existing records.
- The query-history table and desktop SQL Query History remain separate and unchanged.

### Error paths

- A tool error stores its stable error code, not the formatted error message, and does not store an item count.
- Failure to parse a result summary or persist a history entry leaves the original MCP tool result unchanged.

## Error paths

- The listener returns `404 NOT_FOUND` for an unknown path, `405 METHOD_NOT_ALLOWED` for methods other than `POST`, and `401 UNAUTHORIZED` for an invalid bearer token. Invalid/oversized JSON returns `400 INVALID_JSON`.
- If MCP runtime initialization fails, startup logs the error and continues; runtime-dependent management calls return `MCP runtime is unavailable` and the ordinary workspace remains available.
- Tools return stable errors for invalid arguments, unknown/disabled profiles, unsupported targets, unsafe SQL, unavailable native timeouts, query timeout, overload (`BUSY`), missing managed credentials, and database failures. Driver messages redact common credential forms.
- Provisioning that may have partially reached the database retains the reference with `recovery_required`; failed Revoke retains `revoke_failed`. Both keep MCP disabled and allow explicit cleanup retry.

## Tests

- `internal/store/store_test.go` — metadata persistence, migration, history defaults, retention pruning, and managed-account records.
- `internal/api/api_test.go` — allows a Root CA update with a managed account while keeping the SSL toggle protected; `internal/mcp/root_ca_test.go` — verifies SQL profiles carry Root CA data into MCP connection paths.
- `internal/api/mcp_test.go` — verifies runtime-dependent management calls return an unavailable error if MCP runtime initialization fails.
- `internal/store/vault_test.go` — AES-256-GCM vault byte-compatibility with the legacy sidecar format, tamper and missing-key fail-closed behavior.
- `internal/mcp/mcp_test.go` — loopback transport, bearer auth, tool list, bounded reads against a real SQLite file, concurrency cap (`BUSY`), provisioning state, error mapping, and call-history integration.
- `apps/desktop/src/components/mcp-settings-section.test.tsx` — verifies the Logs tab displays local inputs and summaries without database results.
- `apps/desktop/src/lib/mcp-managed-account.test.ts` — prepare/provision order, failed setup cleanup, and recovery retention.

## Related

- [Architecture overview](../architecture/overview.md)

## Sources

- `README.md`
- `docker-init/MCP-READONLY.md`
- `main.go`
- `apps/desktop/src/components/mcp-settings-section.tsx`
- `apps/desktop/src/components/mcp-settings-section.test.tsx`
- `apps/desktop/src/hooks/use-mcp-settings.ts`
- `apps/desktop/src/lib/mcp-managed-account.ts`
- `apps/desktop/src/lib/api.ts`
- `internal/api/mcp.go`
- `internal/api/mcp_test.go`
- `internal/store/vault.go`
- `internal/store/migrate.go`
- `internal/store/profiles.go`
- `internal/store/mcp.go`
- `internal/mcp/runtime.go`
- `internal/mcp/jsonrpc.go`
- `internal/mcp/tools.go`
- `internal/mcp/manager.go`
- `internal/engines/sqlite/sqlite.go`
- `internal/mcp/provisioner.go`
- `internal/mcp/root_ca_test.go`
- `internal/mcp/credentials.go`
- `internal/mcp/errors.go`
- `internal/engines/postgres/postgres.go`
- `internal/engines/mysql/mysql.go`
- `internal/engines/sqlserver/sqlserver.go`
- `internal/api/connections.go`
- `internal/api/api_test.go`
- `internal/mongo/mongo.go`
- `packages/shared/src/schemas.ts`
- `internal/store/store_test.go`
- `internal/store/vault_test.go`
- `internal/mcp/mcp_test.go`
- `internal/sqlsafety/sqlsafety.go`
- `apps/desktop/src/lib/mcp-managed-account.test.ts`
