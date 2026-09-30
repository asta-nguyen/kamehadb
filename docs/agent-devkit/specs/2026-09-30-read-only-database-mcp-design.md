# Read-only Database MCP

**Status:** Approved for planning; the implementation plan is pending user approval.

## Goal

Let local AI clients use Model Context Protocol (MCP) to inspect schemas and run read-only queries against KamehaDB connection profiles that the user explicitly enables for MCP.

## Initial scope

- Databases: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, and MongoDB.
- Clients: Codex, Claude Code, Devin CLI, and OpenCode.
- MCP runs only while KamehaDB is running. The first version does not support remote clients, tunnels, or cloud-hosted Devin.
- SQL clients can run arbitrary read-only SQL, one statement per call. MongoDB tools support `find` and `aggregate` only.
- Schema discovery includes databases, schemas, tables, and columns for SQL, plus databases and collections for MongoDB.
- All MCP-related app labels, buttons, status and error messages, and setup instructions are in English. This design spec is in English.

The first version excludes Oracle, ClickHouse, DuckDB, Redis, Qdrant, TigerBeetle, write queries, database shells, and general MongoDB commands.

## Approved design

### MCP endpoint and authentication

- The desktop currently starts the sidecar with a randomly assigned internal port and a new internal token (`apps/desktop/src-tauri/src/lib.rs:287` creates the token). These are for KamehaDB-to-sidecar communication and change across app launches, so MCP clients must not use them.
- The existing Hono sidecar listener has a global sidecar-token middleware (`apps/sidecar/src/index.ts`). Keep that listener unchanged and open a second, dedicated Streamable HTTP listener for MCP at `http://127.0.0.1:13979/mcp`. Bind both listeners only to `127.0.0.1`; the MCP listener must expose only MCP routes.
- Attempt to bind the MCP listener automatically when KamehaDB starts; v1 has no master enable/disable switch. The listener is attempted even when no profiles are enabled, while each profile remains excluded until explicitly enabled for MCP.
- MCP authenticates every HTTP request with `Authorization: Bearer <mcp-token>`. Do not accept the token in the URL or query string. This is a KamehaDB-issued static bearer token, not an OAuth flow. Codex, Claude Code, Devin CLI, and OpenCode all document Streamable HTTP configuration with bearer/custom HTTP headers; use each client's native header mechanism in the copyable snippets.
- Generate a cryptographically random MCP token once, persist it in the local metadata database, and keep it separate from the per-launch sidecar token. The MCP token is returned only through the sidecar-authenticated settings API and is never written to logs. The user can rotate it in KamehaDB.
- The MCP listener follows the sidecar lifecycle and stops when KamehaDB closes.
- The MCP port is fixed by default, not selected randomly. If the configured port (default `13979`) is occupied, KamehaDB continues running and shows `MCP unavailable: port <configured-port> is in use`. MCP Settings provides a **Retry** action. After the user frees the port and retries, MCP binds to the same endpoint and existing client config works without changes.
- If the user cannot free `13979`, MCP Settings lets them choose another fixed port. KamehaDB then displays the new endpoint and regenerated client config; the user must update the endpoint in each client. MCP must never silently fall back to another port because clients would keep connecting to the old URL.

### Profiles and database permissions

- Only profiles explicitly enabled for MCP are available through MCP tools.
- Add `mcpEnabled` to the shared connection-profile contract and a `mcp_enabled` column defaulting to false. Existing metadata databases receive a migration using the current manual migration pattern.
- For server databases, users create a separate profile with a database account that has read-only permissions, then enable that profile for MCP. KamehaDB does not grant or change database permissions. The user's normal profile can remain writable.
- MCP owns separate adapter instances/pools for enabled profiles. It must not reuse the UI adapter cache or its database connections, even when the same profile ID is enabled in both places.
- SQLite uses a separate MCP query process that opens the file read-only; it does not reuse the UI's writable connection.
- Check `mcpEnabled` on each tool call. Disabling or deleting a profile immediately blocks further calls and closes its MCP-owned adapter.

### Tools

- MCP tools use explicit profile IDs on every call; there is no mutable server-wide selected connection.

| Tool                     | Required input                                        | Optional input                                  | Result                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_mcp_profiles`      | none                                                  | none                                            | MCP-enabled profile ID, name, engine, and default database; never credentials. This reports the MCP allowlist and does not claim KamehaDB has verified database grants. |
| `sql_list_databases`     | `connection_id`                                       | none                                            | Database names.                                                                                                                                                         |
| `sql_list_schemas`       | `connection_id`                                       | `database`                                      | Schema names.                                                                                                                                                           |
| `sql_list_tables`        | `connection_id`                                       | `database`, `schema`                            | Table names.                                                                                                                                                            |
| `sql_describe_table`     | `connection_id`, `table`                              | `database`, `schema`                            | Column names and types.                                                                                                                                                 |
| `sql_query`              | `connection_id`, `sql`                                | `max_rows`                                      | Columns, rows, duration, and truncation flag.                                                                                                                           |
| `mongo_list_databases`   | `connection_id`                                       | none                                            | Database names.                                                                                                                                                         |
| `mongo_list_collections` | `connection_id`, `database`                           | none                                            | Collection names.                                                                                                                                                       |
| `mongo_find`             | `connection_id`, `database`, `collection`             | `filter`, `projection`, `sort`, `skip`, `limit` | Documents, duration, and truncation flag.                                                                                                                               |
| `mongo_aggregate`        | `connection_id`, `database`, `collection`, `pipeline` | `max_rows`                                      | Documents, duration, and truncation flag.                                                                                                                               |

- Tool arguments are validated with Zod schemas. `max_rows` and Mongo `limit` default to 100 and accept integers from 1 to 1,000. Mongo `skip` defaults to 0 and accepts integers from 0 to 100,000.
- `connection_id`, `database`, `schema`, `table`, and `collection` are strings; `sql` is a string. Mongo `filter`, `projection`, and `sort` are JSON objects; `pipeline` is an array of JSON objects. Optional `database` values default to the selected profile's configured database; optional `schema` values default to the adapter's default schema where applicable. Mongo `filter` defaults to `{}` and `skip` defaults to 0.
- SQL query results contain ordered `columns`, array-valued `rows`, `duration_ms`, and `truncated`. Mongo query results contain JSON-safe `documents`, `duration_ms`, and `truncated`. List tools return named arrays capped at 1,000 items with a `truncated` flag when more items exist. Missing or invalid bearer tokens receive HTTP 401. Tool errors use stable codes (`INVALID_ARGUMENTS`, `PROFILE_NOT_ENABLED`, `PROFILE_NOT_FOUND`, `READ_ONLY_QUERY_REQUIRED`, `QUERY_TIMEOUT`, `TIMEOUT_UNAVAILABLE`, `BUSY`, `DATABASE_ERROR`) and messages that do not include credentials or tokens.
- Do not expose insert/update/delete/DDL tools, MongoDB `runCommand`, `mongosh`, or access to the sidecar's existing write routes.
- SQL passes through the existing shared `isQuerySafe` check (`packages/shared/src/types.ts:636`) before dispatch. It accepts one read statement; read-only database credentials remain the primary enforcement layer.
- Reject MongoDB aggregation stages that can write, including `$out` and `$merge`. MongoDB credentials must also be read-only.

### Query and result limits

- Return at most 100 rows by default, with a hard maximum of 1,000 rows per call. Fetch at most one extra row to detect truncation. Cap metadata list tools at 1,000 items and set `truncated` when additional items exist.
- Add an MCP-owned cursor/iterator path to each SQL adapter. It must return column metadata and read no more than `max_rows + 1` rows, then close or cancel the cursor/stream. Do not use the UI `runQuery` path, which materializes the full result, or rewrite user SQL with an outer `LIMIT`; cursor-based reading must also work for allowed forms such as `SHOW`, `DESCRIBE`, and `EXPLAIN`.
- For PostgreSQL, add the official `pg-cursor` package and read in bounded batches using its cursor API. SQLite's isolated child process uses `better-sqlite3` row iteration and exits after the same cap or at the execution deadline.
- The database execution budget is 30 seconds per tool call. A response timer alone is insufficient; apply database/driver cancellation as follows:

| Engine     | Enforcement                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | Apply server-side `statement_timeout` of 30 seconds to each MCP statement.                                                                                                                          |
| MySQL      | Set session `max_execution_time` to 30,000 ms on MCP-owned sessions; reject timeout-weakening `SET_VAR(max_execution_time=...)` hints.                                                              |
| MariaDB    | Set session `max_statement_time` to 30 seconds on MCP-owned sessions.                                                                                                                               |
| SQL Server | Set `mssql` request timeout to 30 seconds for each request and cancel the request on timeout.                                                                                                       |
| MongoDB    | Set `maxTimeMS: 30000` on `find` and `aggregate` operations and close cursors when the row cap is reached.                                                                                          |
| SQLite     | Run each MCP query in a Node child process using `better-sqlite3` with `readonly: true`; terminate that process at the deadline. This keeps synchronous SQLite execution from blocking the sidecar. |

- MySQL/MariaDB server limits can stop execution at server checkpoints, so a timeout response may arrive at 30 seconds while backend cancellation completes shortly afterward. Do not claim that `Promise.race` alone stops a database query. If a server does not support the configured native timeout, fail the call with a clear timeout-unavailable error instead of running it unbounded.
- At the deadline, request cancellation and discard/close the MCP-owned connection if its driver cannot confirm cancellation. The tool returns a timeout error at the deadline; it must not leave an untracked query running on a reusable MCP connection.
- Return a clear `truncated` flag when more rows exist than the result limit. Do not run a second full query just to calculate the total row count.
- Support multiple clients concurrently using stateless Streamable HTTP. Limit the sidecar to four active database tool calls per profile; reject excess calls with a retryable `BUSY` error.
- Store MCP port, timeout, row limits, metadata-list limit, Mongo skip limit, and per-profile concurrency limit as named constants in `apps/sidecar/src/lib/constants.ts` (for example, `MCP_DEFAULT_PORT`, `MCP_QUERY_TIMEOUT_MS`, `MCP_DEFAULT_ROW_LIMIT`, `MCP_MAX_ROW_LIMIT`, `MCP_MAX_METADATA_ITEMS`, `MCP_MAX_MONGO_SKIP`, and `MCP_MAX_CONCURRENT_CALLS_PER_PROFILE`); do not inline these values in implementation code.

### Client setup

- KamehaDB displays the MCP endpoint, token, status, and copyable setup snippets for Codex, Claude Code, Devin CLI, and OpenCode.
- Place MCP Settings inside the existing API Settings view (`AppView` remains `workspace`, `api-settings`, and `logs`); do not add a top-level app view for MCP.
- Every snippet sends `Authorization: Bearer <mcp-token>`. Codex uses inline `http_headers` so the copied configuration works without an environment-variable export; Claude Code uses `--header` or HTTP `headers`; Devin CLI uses its HTTP `headers` config; OpenCode uses remote MCP `headers`.
- Users paste the configuration into their clients; KamehaDB does not edit external client config files.
- When the token is rotated, KamehaDB displays the new token so users can update client configs.

### Management API and persistence

- Persist `mcp_enabled` on each `connection_profiles` row. Add a singleton `mcp_settings` table to the local metadata SQLite database containing the selected port (default `13979`) and persistent MCP token. The sidecar generates the token on first run and loads both settings on startup.
- Add sidecar management endpoints protected by the existing per-launch sidecar authentication:
  - `GET /mcp/settings` returns listener status, configured port, endpoint, MCP token, and safe summaries of enabled profiles.
  - `PATCH /mcp/settings` accepts a validated port and persists it before attempting to bind/rebind the MCP listener.
  - `POST /mcp/settings/retry` retries binding the configured port.
  - `POST /mcp/settings/rotate-token` persists a new random token and activates it for subsequent MCP requests.
  - `PATCH /connections/:id/mcp` accepts `{ "enabled": boolean }` and updates the profile allowlist.
- The management API does not expose database passwords. The public MCP listener uses only the MCP bearer token; it does not expose these management endpoints or any existing sidecar routes.
- All profile and settings changes use the existing manual metadata-store migration pattern and shared Zod contracts. Status is runtime state and is not persisted.

### Runtime dependency and connection behavior

- Add the official TypeScript `@modelcontextprotocol/sdk` to the sidecar. Use its stateless Streamable HTTP transport and the existing Zod dependency for tool schemas.
- Maintain a separate MCP adapter cache keyed by enabled profile ID. MCP does not call `getSqlAdapter` or reuse the UI's `adapterCache`; query connections, timeout settings, and cancellation are owned by MCP.

## Acceptance criteria

1. KamehaDB automatically attempts to start the MCP listener; when available it binds only to loopback, and no global enable/disable switch is shown.
2. An MCP client connects using `Authorization: Bearer <mcp-token>`; missing or invalid tokens are rejected, URL tokens are rejected, and the MCP token never appears in logs.
3. MCP Settings appears inside the existing API Settings view, with endpoint, token, status, Retry, port selection, and client snippets.
4. MCP lists and queries only enabled profiles; a disabled profile cannot be accessed using a previously known ID.
5. SQL schema discovery and read-only queries work on all five SQL adapters in scope. `isQuerySafe` runs before dispatch, and read-only credentials prevent writes if the application check misses one.
6. SQL adapters return no more than `max_rows + 1` rows through their MCP cursor/iterator path; PostgreSQL uses `pg-cursor`, and allowed result-producing forms such as `SHOW`, `DESCRIBE`, and `EXPLAIN` are not rewritten. Metadata lists are capped at 1,000 entries and report truncation.
7. MCP query execution uses separate adapters/connections from the UI. The SQLite child process opens the file read-only and can be terminated without blocking the sidecar.
8. MongoDB exposes only list/find/aggregate tools; `$out` and `$merge` are rejected.
9. SQL and MongoDB calls respect row limits, report truncation, and use the documented per-engine timeout/cancellation. Unsupported native timeout settings fail closed.
10. A port conflict makes only MCP unavailable. KamehaDB and the existing sidecar connection continue working, and **Retry** can bind MCP after the port is freed.
11. If the user changes the MCP port, KamehaDB displays the new endpoint and client snippets; clients work after their configs are updated.
12. Multiple clients can issue concurrent calls; the per-profile concurrency cap rejects excess calls with a retryable `BUSY` error.
13. MCP status, port, token, and enabled-profile changes round-trip through the management API and persist across app restarts.
14. Copyable bearer-header setup snippets work for Codex, Claude Code, Devin CLI, and OpenCode. KamehaDB does not edit their config files.
15. MCP UI copy and setup instructions are in English.

## Verification plan for implementation

- Connect through MCP Inspector and each supported client.
- Check automatic listener startup, enabled/disabled profiles, missing/invalid tokens, token rotation, port conflicts, retry behavior, and endpoint shutdown when the app closes.
- Use read-only credentials to confirm database writes fail; verify SQLite access through the MCP-only read-only connection.
- Check bounded cursor/iterator reads, truncation flags, per-engine timeout cancellation, and timeout-unavailable behavior for each supported adapter. Confirm PostgreSQL results use `pg-cursor` without SQL rewriting for `SHOW`, `DESCRIBE`, and `EXPLAIN`.
- Connect two or more local MCP clients concurrently and verify the per-profile concurrency cap.
- Restart the app and verify MCP port, token, and allowlist persist; verify management routes require the internal sidecar token.
- Verify logs and returned errors contain neither tokens nor database credentials.

## Execution

- [Read-only Database MCP implementation plan](../plans/2026-09-30-read-only-database-mcp-plan.md)

## Related context

None. No verified `docs/llm/` pages were used as design context.

## Client references

- [Codex configuration reference](https://developers.openai.com/codex/config-reference/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Devin CLI MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration)
- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/)
- [MCP TypeScript SDK server and Streamable HTTP](https://ts.sdk.modelcontextprotocol.io/server)
- [node-postgres cursor API](https://github.com/brianc/node-postgres/blob/master/docs/pages/apis/cursor.mdx)
- [PostgreSQL `statement_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html)
- [MySQL server-side SELECT timeout](https://dev.mysql.com/blog-archive/server-side-select-statement-timeouts/)
- [MariaDB query timeouts](https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/query-optimizations/aborting-statements)
- [SQL Server Node.js driver request timeout](https://github.com/tediousjs/node-mssql)
- [MongoDB Node.js driver operation timeout](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/)
