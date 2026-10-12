# Read-only MCP Server

KamehaDB exposes a local Model Context Protocol (MCP) endpoint so supported AI clients can inspect opted-in database profiles. The endpoint is separate from the Wails-bound management service and listens only on loopback.

## Requirements

### MCP-call-history-capture

The system SHALL record validated inputs and call summaries for database-backed MCP tools without storing returned database rows or documents in history or changing the tool response.

#### Scenario: successful query is summarized

- GIVEN an enabled MCP `sql_query` call returns two rows
- WHEN the tool callback completes
- THEN history stores its validated input and item count without the rows, while the original MCP response still contains them

#### Scenario: rejected query stores only its stable error code

- GIVEN `sql_query` rejects an unsafe statement
- WHEN the tool callback completes
- THEN history stores the error code with no item count, and `list_mcp_profiles` does not create a history entry

Evidence: `apps/sidecar/src/mcp/tools.ts`, `apps/sidecar/src/mcp/tools.test.ts`, `apps/sidecar/src/mcp/runtime.test.ts`

### MCP-call-history-limits

The system SHALL prune history older than 30 days and return no more than the newest 50 entries.

#### Scenario: old entries are removed and recent entries are capped

- GIVEN history contains an expired entry and more than 50 recent entries
- WHEN the store initializes or history is read
- THEN expired entries are removed and at most the newest 50 entries are returned

Evidence: `apps/sidecar/src/lib/constants.ts`, `apps/sidecar/src/db/metadata-store.ts`, `apps/sidecar/src/db/metadata-store.test.ts`

### MCP-call-history-recording

The system SHALL default history to enabled for new and existing metadata stores, then preserve old entries and prevent new ones when recording is disabled.

#### Scenario: history defaults on and disabling it retains existing entries

- GIVEN a fresh store or a legacy store with an MCP settings row
- WHEN the metadata store initializes and recording is later disabled
- THEN history starts enabled, existing entries remain, and later calls are not added

Evidence: `apps/sidecar/src/db/metadata-store.ts`, `apps/sidecar/src/db/metadata-store.test.ts`, `apps/sidecar/src/routes/mcp-settings.ts`, `apps/sidecar/src/routes/mcp-settings.test.ts`

### MCP-call-history-ui

The desktop SHALL show recorded inputs and summaries with a plain-text storage warning and controls to disable recording or clear history.

#### Scenario: MCP Logs displays local history controls and an empty or populated list

- GIVEN MCP call-history settings and entries are available
- WHEN the MCP Server Logs tab is rendered
- THEN the user sees the recording toggle, Clear History action, local-storage warning, and recorded inputs and summaries without database results

Evidence: `apps/desktop/src/components/mcp-settings-section.tsx`, `apps/desktop/src/components/mcp-settings-section.test.tsx`, `apps/sidecar/src/routes/mcp-settings.ts`, `apps/sidecar/src/routes/mcp-settings.test.ts`

## Business rules

- The MCP listener binds to `127.0.0.1` at `/mcp`. Its default port is `13979`; the port is configurable and does not fall back if binding fails.
- MCP access is a per-profile allowlist. Profiles default to disabled. PostgreSQL, MySQL, MariaDB, SQL Server, and MongoDB require a KamehaDB-managed account before enablement; SQLite uses a dedicated read-only file adapter.
- The server registers ten read-oriented tools: `list_mcp_profiles`; SQL database/schema/table/column discovery and `sql_query`; MongoDB database/collection discovery, `mongo_find`, and `mongo_aggregate`.
- `sql_query` uses the shared `isQuerySafe` heuristic. It rejects statement chains, destructive keywords, and statements that do not begin with `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, or `EXPLAIN`. This is keyword screening, not a SQL parser. Database permissions remain the write-prevention boundary. MongoDB exposes only read methods and rejects aggregation stages `$out` and `$merge`.
- SQL metadata database arguments and MongoDB database arguments are restricted to the database configured in the profile. SQL and MongoDB database-list tools expose only that configured database. MySQL/MariaDB treat database and schema names as equivalents; SQLite metadata is limited to `main`.
- Server database query adapters use only the generated account credential. Saved profile credentials are used only for explicit account provisioning and Revoke. KamehaDB provisions PostgreSQL CONNECT/USAGE/SELECT grants, MySQL/MariaDB SELECT, SQL Server `db_datareader`, or the MongoDB `read` role, scoped to the selected database.
- MongoDB account setup requires access control to be enabled. A credential-free `listCollections` probe must return MongoDB Unauthorized (code 13); unauthenticated success and inconclusive errors stop provisioning.
- SQL query results contain `columns`, positional `rows`, `duration_ms`, and `truncated`. The default row limit is 100 and the maximum is 1,000. Queries have a 30-second budget and each profile allows at most four concurrent database-backed calls. MongoDB `skip` is capped at 100,000.

## Flow

1. On app startup, `main.go` opens metadata SQLite, constructs the bound `McpService`, and starts the `mcp.Runtime` listener alongside Wails. Listener status is `listening`, `unavailable`, or `stopped`.
2. In **API Settings → MCP Server**, the desktop reads listener settings, enabled profiles, and managed-account status via `McpService` bindings. For server database profiles, **Create read-only account** asks the backend to generate the credential, encrypt it into local metadata SQLite, reload and verify it, then provision and verify the DB account. The desktop never receives the credential. SQLite needs no account. The user explicitly enables the profile after setup.
3. The **Logs** tab under MCP Server settings has a local call-history toggle, a recent-call list, and a Clear History action. The list resolves profile names when available and falls back to profile IDs after removal.
4. The desktop provides copyable snippets for Codex, Claude Code, Devin CLI, and OpenCode; it does not edit client config files. Token rotation requires updating the snippets.
5. MCP clients send stateless Streamable HTTP JSON-RPC `POST` requests to `http://127.0.0.1:<port>/mcp` with `Authorization: Bearer <token>`.
6. Every database tool asks the `mcp.Manager` to re-read the profile and check its allowlist. Server database calls require a ready managed-account record and an in-memory credential restored from encrypted local storage. Missing credentials fail closed with no fallback to saved profile credentials. SQLite calls use the dedicated read-only adapter.

## State changes

- The singleton `mcp_settings` row stores the listener port and a random 32-byte base64url bearer token in metadata SQLite. Both survive restarts; listener status is runtime-only.
- The same `mcp_settings` row stores whether MCP call history is enabled. `mcp_call_history` stores tool inputs and call metadata in local metadata SQLite; rows expire after 30 days. Returned database rows and documents are not stored.
- `connection_profiles.mcp_enabled` stores the per-profile allowlist flag and defaults to disabled. Migration disables legacy enabled server profiles that lack managed accounts while preserving SQLite settings.
- `mcp_managed_accounts` stores the profile ID, an opaque reference used to derive the generated DB principal, lifecycle state, and an AES-256-GCM encrypted credential bundle. The random 32-byte encryption key is stored beside the metadata DB in `<dbPath>.mcp.key` with owner-only permissions where supported. Copying only the SQLite DB does not reveal the credentials; copying the complete app data directory includes the key and allows decryption.
- On app startup, ready credentials are decrypted and loaded into process memory. Credentials are bound to their profile and account reference, and invalid ciphertext or a missing key fails closed. The desktop does not hydrate credentials after startup.
- Disabling MCP retains the managed DB account and encrypted credential. Revoke disables MCP first, closes the adapter, drops the exact generated principal, then removes the local account record and ciphertext. A failed database revoke retains state for retry. A `prepared` account can be discarded without a DB call because no DB write has started.
- Legacy managed-account rows without encrypted SQLite credentials remain unavailable to MCP until revoked and recreated. Current sources do not establish whether an OS Keychain value from an older version is separately removed.
- While a managed account exists, changing the profile kind, target, SSL settings, saved username/password, or deleting the profile is rejected until Revoke.
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
- Returned rows and documents are not persisted or added to MCP responses. Sidecar history-write warnings include only the tool and profile identifiers.

### Flow

1. One wrapper in `registerMcpTools` surrounds all nine database-backed tool callbacks. It captures validated inputs and elapsed time, summarizes the existing result, stores the summary, and returns the original result unchanged.
2. The authenticated sidecar settings router serves recent history, updates the recording flag, and clears history. These routes stay on the internal sidecar API, separate from the public MCP listener.
3. The desktop uses the existing MCP settings query and API Settings section to display local inputs and summaries. It never renders returned database content.

### State changes

- `mcp_settings.history_enabled` persists the recording toggle and defaults to enabled.
- `mcp_call_history` stores the call metadata and serialized input without a result-payload column. Profile IDs remain stored if the corresponding connection is deleted.
- Disabling recording does not delete history. Clear History deletes all entries; startup, writes, and reads prune expired records.

### Side effects

- Each enabled database-backed MCP call writes a local metadata row. It does not write to the customer database or change the MCP tool response.
- If summary extraction or the local history write fails, the MCP callback result is still returned and the sidecar logs a warning without the input or result content.

### Authorization & constraints

- History management uses the normal sidecar authentication middleware.
- Tool inputs are stored in the local metadata database without a new encryption layer. Users can disable future recording or clear existing records.
- The query-history table and desktop SQL Query History remain separate and unchanged.

### Error paths

- A tool error stores its stable error code, not the formatted error message, and does not store an item count.
- Failure to parse a result summary or persist a history entry leaves the original MCP tool result unchanged.

## Error paths

- The listener returns `404 NOT_FOUND` for an unknown path, `405 METHOD_NOT_ALLOWED` for methods other than `POST`, and `401 UNAUTHORIZED` for an invalid bearer token. Invalid/oversized JSON returns `400 INVALID_JSON`.
- Tools return stable errors for invalid arguments, unknown/disabled profiles, unsupported targets, unsafe SQL, unavailable native timeouts, query timeout, overload (`BUSY`), missing managed credentials, and database failures. Driver messages redact common credential forms.
- Provisioning that may have partially reached the database retains the reference with `recovery_required`; failed Revoke retains `revoke_failed`. Both keep MCP disabled and allow explicit cleanup retry.

## Tests

- `internal/store/store_test.go` — metadata persistence, migration, history defaults, retention pruning, and managed-account records.
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
- `internal/store/vault.go`
- `internal/store/profiles.go`
- `internal/store/mcp.go`
- `internal/mcp/runtime.go`
- `internal/mcp/jsonrpc.go`
- `internal/mcp/tools.go`
- `internal/mcp/manager.go`
- `internal/engines/sqlite/sqlite.go` (`NewMCP` — the read-only SQLite MCP adapter)
- `internal/mcp/provisioner.go`
- `internal/mcp/credentials.go`
- `internal/mcp/errors.go`
- `internal/engines/postgres/postgres.go`
- `internal/engines/mysql/mysql.go`
- `internal/engines/sqlserver/sqlserver.go`
- `internal/mongo/mongo.go`
- `packages/shared/src/schemas.ts`
- `internal/store/store_test.go`
- `internal/store/vault_test.go`
- `internal/mcp/mcp_test.go`
- `apps/desktop/src/lib/mcp-managed-account.test.ts`
