# Read-only Database MCP — Implementation Plan

## Approved design

[Read-only Database MCP design](../specs/2026-09-30-read-only-database-mcp-design.md)

## Global Constraints

- Support PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, and MongoDB. Client setup covers Codex, Claude Code, Devin CLI, and OpenCode.
- Attempt to start a dedicated MCP Streamable HTTP listener at 127.0.0.1 on the persisted fixed port, default 13979, with no master enable/disable switch. Keep it separate from the randomly assigned sidecar listener, expose only MCP routes, and never silently select a fallback port. A bind conflict leaves KamehaDB running with MCP unavailable and retryable.
- Authenticate every MCP request with Authorization: Bearer <mcp-token>. Keep the cryptographically random persistent MCP token separate from the per-launch sidecar token; never accept it in a URL or log it. Return it only through the existing sidecar-authenticated settings API.
- Profile access is an explicit per-profile allowlist that defaults off and is rechecked on every tool call. Use database credentials with read-only grants as the primary write barrier. MCP owns separate adapters and connections from the UI. SQLite query and introspection work runs in a child process opening the file read-only.
- Tools take an explicit profile ID. SQL uses the shared isQuerySafe check and exposes no write tools. MongoDB exposes only list, find, and aggregate; reject $out and $merge. Do not expose runCommand, mongosh, or existing sidecar write routes.
- Return 100 rows by default and at most 1,000 rows, fetching only one extra row to mark truncation. Cap metadata lists at 1,000 items. Enforce a 30-second database execution budget with native cancellation. MySQL and MariaDB may stop at server checkpoints, so the timeout response can arrive at the deadline while backend cancellation finishes shortly afterward; Promise.race alone is not query cancellation:

  | Engine     | Enforcement                                                                     |
  | ---------- | ------------------------------------------------------------------------------- |
  | PostgreSQL | statement_timeout on each MCP statement                                         |
  | MySQL      | session max_execution_time of 30,000 ms; reject timeout-weakening SET_VAR hints |
  | MariaDB    | session max_statement_time of 30 seconds                                        |
  | SQL Server | 30-second request timeout and request cancellation                              |
  | MongoDB    | maxTimeMS of 30,000 on find and aggregate, and close capped cursors             |
  | SQLite     | terminate the read-only child process at the deadline                           |

- Use cursor or iterator reads, close or cancel after the row cap, and do not rewrite SQL with an outer LIMIT. Use pg-cursor for PostgreSQL. Limit active database calls to four per profile and return retryable BUSY errors above the cap. Store MCP port, timeout, row/list limits, Mongo skip limit, and per-profile concurrency limit as named constants.
- Count every database-backed tool against the per-profile concurrency cap, including SQL and Mongo metadata-list/describe tools. Exclude `list_mcp_profiles`, which reads only local metadata.
- Place MCP Settings inside API Settings. Show endpoint, token, status, Retry, fixed-port editing, enabled profiles, and native client snippets in English. Codex's copied config uses inline http_headers. KamehaDB does not edit client config files.

## Tasks

### Task 1 — Add shared MCP contracts and persisted settings

Depends on: None.

Files:

- packages/shared/src/schemas.ts:3-55, 141-171, 253-254
- apps/sidecar/src/db/metadata-store.ts:66-375, 382-518
- apps/sidecar/src/lib/constants.ts:1-49
- apps/sidecar/src/db/metadata-store.test.ts (new)

Interfaces:

- Add MCP_SUPPORTED_KINDS from the existing KIND constants for the five SQL engines and MongoDB.
- Extend ConnectionProfile with mcpEnabled; keep ordinary create/edit payloads from changing this allowlist flag.
- Export validated port and profile-toggle inputs and a typed settings response with listener status, configured port, endpoint, token, and enabled-profile summaries.
- Add metadata-store operations getMcpSettings(), updateMcpPort(port), rotateMcpToken(), and setProfileMcpEnabled(id, enabled). Later tasks consume these contracts and operations.

Change:

1. Migrate existing connection_profiles rows with mcp_enabled INTEGER NOT NULL DEFAULT 0 and include the flag in profile reads. Existing profiles stay disabled.
2. Create a singleton mcp_settings record with the default port and a cryptographically random token from Node's crypto module. Persist only the port and token; derive listener status at runtime.
3. Add the named constants MCP_DEFAULT_PORT, MCP_QUERY_TIMEOUT_MS, MCP_DEFAULT_ROW_LIMIT, MCP_MAX_ROW_LIMIT, MCP_MAX_METADATA_ITEMS, MCP_MAX_MONGO_SKIP, and MCP_MAX_CONCURRENT_CALLS_PER_PROFILE.
4. Reject attempts to enable MCP for engines outside MCP_SUPPORTED_KINDS. Keep the database password and Mongo connection string out of profile summaries and settings responses.
5. Add migration tests proving old profiles remain disabled and the port/token survive store reopen and rotation.

Verify:

- Run pnpm --filter @kamehadb/sidecar test. Expect migration tests to pass for a fresh store and a pre-MCP metadata database; assert returned summaries omit credentials.
- Run pnpm typecheck. Expect the shared profile type and existing consumers to compile with mcpEnabled present.

Files inspected, no change:

- packages/shared/src/index.ts:1-8 — its export-star barrel exposes the shared schemas and types.
- apps/sidecar/src/routes/connections.ts:191-194 — the existing list route returns metadata-store profiles and does not need a parallel profile API.

### Task 2 — Add bounded, cancellable MCP database readers

Depends on: Task 1.

Files:

- apps/sidecar/src/adapters/postgres.ts:98-115, 467-484
- apps/sidecar/src/adapters/mysql.ts:50-72, 260-275
- apps/sidecar/src/adapters/sqlserver.ts:49-73, 267-300
- apps/sidecar/src/adapters/mongodb.ts:51-108, 110-170, 225-280
- apps/sidecar/src/mcp/types.ts (new)
- apps/sidecar/src/mcp/adapters/factory.ts (new)
- apps/sidecar/src/mcp/adapters/sqlite.ts (new)
- apps/sidecar/src/mcp/adapters/sqlite-worker.ts (new)
- apps/sidecar/src/mcp/adapters.test.ts (new)
- docker-init/postgres/02-mcp-readonly.sql (new)
- docker-init/mysql/02-mcp-readonly.sql (new)
- docker-init/mariadb/02-mcp-readonly.sql (new)
- docker-init/sqlserver/mcp-readonly.sql (new)
- docker-init/mcp-readonly/mongodb.js (new; manual test helper outside auto-run directories)
- docker-init/MCP-READONLY.md (new)
- apps/sidecar/package.json:15-38
- pnpm-lock.yaml (generated by pnpm; line positions are unstable)

Interfaces:

- Define an internal McpSqlAdapter extension with runQueryBounded({ query, maxRows }) returning ordered columns, array-valued rows, durationMs, and truncated.
- Export createMcpSqlAdapter(profile, password): McpSqlAdapter | null from the MCP adapter factory. It constructs MCP-owned engine adapters directly and preserves the bounded method type; do not route this through createSqlAdapter(), whose public return type is only SqlAdapter.
- Add MCP-specific bounded Mongo find and aggregate methods returning JSON-safe documents, durationMs, and truncated.
- Later tasks obtain independent instances from the MCP factory; they do not use the UI adapter cache or full-result query methods.

Change:

1. Add pg-cursor as a sidecar production dependency and @types/pg-cursor as a sidecar development dependency because pg-cursor does not ship TypeScript declarations. Use it on a dedicated PostgreSQL pool connection, set statement_timeout on every acquired MCP session so metadata calls are bounded too, read in batches up to maxRows + 1, and close the cursor on completion, cap, or timeout. Preserve SHOW, DESCRIBE, and EXPLAIN without SQL rewriting.
2. Add bounded MySQL/MariaDB stream reads. Apply the engine-specific session timeout on MCP-owned sessions; reject SET_VAR(max_execution_time=...) hints that weaken the limit. Stop and close the stream after maxRows + 1. Do not report Promise.race as cancellation; return the timeout at the deadline and discard the connection if the driver cannot confirm cancellation.
3. Add SQL Server request streaming with a 30-second request timeout. Cancel the request and discard the connection if cancellation cannot be confirmed.
4. Add a SQLite MCP reader and child worker using better-sqlite3 readonly mode and iterate(). Resolve the worker next to the current module: in dev, spawn the source `src/mcp/adapters/sqlite-worker.ts` through the sidecar-local `tsx` loader (`process.execPath --import tsx`, with the sidecar package as cwd); in production, spawn the compiled `dist/mcp/adapters/sqlite-worker.js` with plain `process.execPath`. Route MCP query and metadata operations through that worker; kill it at the deadline so synchronous SQLite work cannot block the sidecar. The parent must spawn the worker entrypoint and must not import it statically or dynamically; compiling the entrypoint into dist must not execute it. Never spawn a `.ts` worker directly without the loader.
5. Add Mongo find and aggregate methods that set maxTimeMS, stop after maxRows + 1, close cursors, and avoid countDocuments, full toArray materialization, or a second count pipeline. Apply native operation deadlines to catalog-list commands too; return TIMEOUT_UNAVAILABLE if a command cannot be bounded. Reject $out and $merge before execution.
6. Fail closed with TIMEOUT_UNAVAILABLE when a driver cannot apply its native limit. Map timeout and cancellation to the stable MCP error contract without leaking credentials.
7. Keep the existing UI runQuery/find/aggregate behavior unchanged; use these new bounded methods only from MCP.
8. Add local-only read-only test-account scripts for PostgreSQL, MySQL, MariaDB, SQL Server, and MongoDB plus a short run guide. They create a dedicated non-owner account with read/catalog access and no write grants; they do not replace or change the existing writable `kameha` user. Keep the Mongo helper at `docker-init/mcp-readonly/mongodb.js`, outside any `docker-entrypoint-initdb.d` path, and instruct users to run it manually only against an auth-enabled test instance. The guide must say that PostgreSQL/MySQL/MariaDB init scripts run automatically only on fresh Docker volumes, that SQL Server has no service in the current docker-compose file, and that the current Mongo service has no auth enabled, so those two scripts require a separate test instance with authorization enabled.

Verify:

- Run pnpm --filter @kamehadb/sidecar test. Adapter tests must cover row cap plus one, truncation, cursor/stream closure, native timeout configuration, cancellation, and Mongo write-stage rejection.
- Run pnpm --filter @kamehadb/sidecar build. Expect the worker entry and pg-cursor types to compile into dist.
- Verify both SQLite worker launches: source `.ts` under `tsx` in dev and compiled `.js` under plain Node after build.
- Confirm no sidecar module imports `sqlite-worker.ts`; both dev and production launch paths spawn it as a child-process entrypoint.
- Use the guide's test accounts for PostgreSQL, MySQL, MariaDB, SQL Server, and an auth-enabled MongoDB. Verify a direct write attempt with each read-only credential is rejected by the database itself, then use the same credentials for MCP read queries. This check bypasses `isQuerySafe` so it proves the database grant is the enforcement layer. Confirm the SQLite worker opens its file read-only and cannot write.

Files inspected, no change:

- apps/sidecar/src/adapters/sqlite.ts:24-269 — remains the UI's writable SQLite adapter; MCP uses its own child worker.
- apps/sidecar/src/routes/sql.ts:14-67 — its UI adapter cache and materializing runQuery path are not reused.

### Task 3 — Implement MCP tools, authentication, and listener lifecycle

Depends on: Tasks 1 and 2.

Files:

- apps/sidecar/src/mcp/runtime.ts (new)
- apps/sidecar/src/mcp/tools.ts (new)
- apps/sidecar/src/mcp/adapter-manager.ts (new)
- apps/sidecar/src/mcp/errors.ts (new)
- apps/sidecar/src/mcp/runtime.test.ts (new)
- apps/sidecar/src/index.ts:107-164
- apps/sidecar/package.json:15-38 — pin the approved MCP SDK dependency to the exact version `@modelcontextprotocol/sdk@1.31.0`.
- pnpm-lock.yaml (generated by pnpm; line positions are unstable)

Interfaces:

- Export an McpRuntime with getStatus(), updatePort(port), retry(), rotateToken(), and close() for Task 4's management routes and Task 3's process lifecycle.
- Export an adapter manager that owns MCP-specific adapters by profile ID, checks the allowlist and supported engine on every access, enforces the per-profile concurrency limit, and closes adapters on invalidation or shutdown.
- Consume Task 1's persisted settings/constants and Task 2's bounded readers.

Change:

1. Add the exact dependency `@modelcontextprotocol/sdk@1.31.0` and implement stateless Streamable HTTP at /mcp on its own HTTP listener. Bind only to 127.0.0.1 at the persisted port; do not route MCP traffic through the sidecar Hono listener. Build SQL readers through Task 2's typed createMcpSqlAdapter factory, never by calling createSqlAdapter or casting its SqlAdapter result.
2. Require Authorization: Bearer <mcp-token> on every MCP request; compare tokens safely, reject missing/invalid tokens with HTTP 401, ignore URL/query tokens, and never log authorization headers, MCP tokens, SQL arguments, or credential-bearing database errors.
3. Register exactly these read-only tools: list_mcp_profiles, sql_list_databases, sql_list_schemas, sql_list_tables, sql_describe_table, sql_query, mongo_list_databases, mongo_list_collections, mongo_find, and mongo_aggregate. Validate all arguments with Zod. list_mcp_profiles takes no input and returns enabled profile ID, name, engine, and default database without credentials. Every database tool requires connection_id: sql_list_databases(connection_id); sql_list_schemas(connection_id, database?); sql_list_tables(connection_id, database?, schema?); sql_describe_table(connection_id, table, database?, schema?); sql_query(connection_id, sql, max_rows?); mongo_list_databases(connection_id); mongo_list_collections(connection_id, database); mongo_find(connection_id, database, collection, filter?, projection?, sort?, skip?, limit?); and mongo_aggregate(connection_id, database, collection, pipeline, max_rows?). Optional database values default to the profile database; optional SQL schemas default to the adapter's default schema. max_rows defaults to 100 and accepts integers from 1 to 1,000; Mongo filter defaults to {}, skip to 0 and accepts integers from 0 to 100,000, and find limit defaults to 100 and accepts integers from 1 to 1,000. Validate Mongo filter/projection/sort as JSON objects and pipeline as an array of JSON objects. Return named metadata arrays capped at 1,000 with truncated, SQL columns/rows/duration_ms/truncated, and JSON-safe Mongo documents/duration_ms/truncated.
4. Run isQuerySafe before every SQL dispatch. Use bounded adapter methods for sql_query. Expose Mongo only through list/find/aggregate; reject write stages before the adapter call. Return sanitized messages with the stable codes INVALID_ARGUMENTS, PROFILE_NOT_ENABLED, PROFILE_NOT_FOUND, READ_ONLY_QUERY_REQUIRED, QUERY_TIMEOUT, TIMEOUT_UNAVAILABLE, BUSY, and DATABASE_ERROR.
5. Cap every metadata list at MCP_MAX_METADATA_ITEMS and flag truncation. sql_describe_table returns column names and types. list_mcp_profiles reports the enabled allowlist only and does not claim that KamehaDB verified database grants. Return query duration and truncation status; do not run a second full query to calculate totals.
6. Enforce MCP_MAX_CONCURRENT_CALLS_PER_PROFILE around every database-backed tool, including SQL/Mongo metadata tools; exclude list_mcp_profiles because it reads local metadata only. Return retryable BUSY when full. Never expose write tools or existing sidecar routes through the MCP listener.
7. Attempt listener startup after metadata initialization even when no profile is enabled. Treat EADDRINUSE as MCP-only unavailable status and display “MCP unavailable: port <configured-port> is in use” so the sidecar and KamehaDB continue normally; keep the configured port unchanged for Retry. Rebind only to the user-selected fixed port and never fall back silently.
8. Start MCP after KamehaDB starts and close the listener and MCP adapters before closing metadata storage on SIGINT/SIGTERM.

Verify:

- Run pnpm --filter @kamehadb/sidecar test. Runtime tests must check loopback bind, bearer auth versus URL tokens, every tool's read-only gate, disabled/unsupported profiles, port-in-use startup, retry after freeing the port, token rotation, shutdown, and BUSY behavior.
- Use an MCP SDK client against a running sidecar to call each registered tool. Expect only the ten named tools and no create/update/delete/DDL capability.

Files inspected, no change:

- apps/desktop/src-tauri/src/lib.rs:280-400 — its random sidecar port and internal token stay for desktop-to-sidecar traffic.
- apps/sidecar/src/routes/sql.ts:14-67 — MCP adapters remain separate from the UI cache.
- apps/sidecar/src/lib/sidecar-auth.ts:1-14 — the MCP listener has its own bearer auth; internal management routes keep existing sidecar auth.
- apps/sidecar/scripts/bundle-for-tauri.mjs:83-120 — pnpm deploy and recursive dist copy already include production dependencies and compiled worker files.

### Task 4 — Add authenticated settings and profile-management routes

Depends on: Tasks 1 and 3.

Files:

- apps/sidecar/src/routes/mcp-settings.ts (new)
- apps/sidecar/src/routes/mcp-settings.test.ts (new)
- apps/sidecar/src/routes/connections.ts:381-405
- apps/sidecar/src/index.ts:75-115
- apps/sidecar/src/db/metadata-store.ts:382-518

Interfaces:

- Consume McpRuntime from Task 3 and the settings/profile schemas and metadata operations from Task 1.
- `mcp-settings.ts` owns GET /mcp/settings, PATCH /mcp/settings, POST /mcp/settings/retry, and POST /mcp/settings/rotate-token. `connections.ts` owns PATCH /connections/:id/mcp beside the existing profile update/delete routes so it shares their persistence and adapter-invalidation lifecycle.
- Return listener state and safe profile summaries; only GET /mcp/settings returns the MCP token, under existing sidecar authentication.

Change:

1. Mount the `mcp-settings.ts` router on the existing Hono app under its global sidecar-token middleware. Register PATCH `/:id/mcp` in `connections.ts`; keep both management route groups separate from the public MCP listener.
2. Validate configured ports and profile toggles. Persist a new port before attempting to bind it; return the new endpoint and unavailable status if the bind fails.
3. Implement Retry against the configured port and token rotation using a new persisted random token. The previous token stops authenticating after rotation.
4. Implement the per-profile toggle and reject unsupported database kinds. On disable, immediately block future calls and close that profile's MCP adapter.
5. Invalidate the MCP adapter when a saved profile's connection fields change or the profile is deleted, using the existing update/delete lifecycle. Never include DB passwords in management responses.

Verify:

- Run pnpm --filter @kamehadb/sidecar test. Route tests must verify sidecar auth, input validation, persistence, unsupported profile rejection, token rotation, port conflict/retry responses, and cache closure on disable/update/delete.
- Confirm GET /mcp/settings contains the MCP token and enabled-profile summaries but no database passwords or connection strings.

Files inspected, no change:

- apps/sidecar/src/lib/sidecar-auth.ts:1-14 — the existing global middleware is the management API's auth boundary.

### Task 5 — Add MCP Settings to the existing API Settings view

Depends on: Tasks 1 and 4.

Files:

- apps/desktop/src/lib/api.ts:3-48
- apps/desktop/src/hooks/use-mcp-settings.ts (new)
- apps/desktop/src/components/mcp-settings-section.tsx (new)
- apps/desktop/src/components/api-settings-page.tsx:526-646

Interfaces:

- Use the shared MCP response/request types and Task 4 management routes.
- Expose React Query operations for reading MCP settings and existing connection profiles, editing the fixed port, retrying, rotating the token, and toggling eligible profiles.

Change:

1.  Add MCP API methods and a settings hook with query invalidation after every successful mutation.
2.  Add an MCP Settings section inside ApiSettingsPage. Do not add or change AppView.
3.  Show endpoint, status and port-conflict message, configured port input, Retry, the current token with copy and rotate actions, and toggles for every existing profile whose kind is in MCP_SUPPORTED_KINDS. Use ConnectionProfile.mcpEnabled for the toggle state; GET /mcp/settings continues to return only enabled-profile summaries.
4.  Show separate copyable native configuration snippets for Codex, Claude Code, Devin CLI, and OpenCode. Substitute the current endpoint and token before copying so placeholders never reach client configuration:
    - Codex TOML:

          [mcp_servers.kamehadb]
          url = "{endpoint}"
          http_headers = { Authorization = "Bearer {token}" }

    - Claude Code CLI:

          claude mcp add --transport http kamehadb "{endpoint}" --header "Authorization: Bearer {token}"

    - Devin CLI JSON:

          {
            "mcpServers": {
              "kamehadb": {
                "url": "{endpoint}",
                "transport": "http",
                "headers": { "Authorization": "Bearer {token}" }
              }
            }
          }

    - OpenCode JSON:

          {
            "$schema": "https://opencode.ai/config.json",
            "mcp": {
              "servers": {
                "kamehadb": {
                  "type": "remote",
                  "url": "{endpoint}",
                  "oauth": false,
                  "headers": { "Authorization": "Bearer {token}" }
                }
              }
            }
          }

    Codex uses inline http_headers. Verify the snippets against the current official client references recorded in the approved design.

5.  State in English that users should enable a separate profile with read-only database credentials. Use the available shadcn components and accessible labels; do not expose DB credentials or edit client config files.

Verify:

- Run pnpm --filter @kamehadb/desktop test and pnpm typecheck. Expect the view and typed API to compile and existing settings behavior to remain intact.
- Manually check the API Settings view for port update, conflict and Retry, token rotation, profile toggles, copyable snippets for all four clients, and English labels.

Files inspected, no change:

- apps/desktop/src/lib/types.ts:138 — the existing workspace, api-settings, and logs views remain unchanged.
- apps/desktop/src/components/ui/button.tsx, apps/desktop/src/components/ui/input.tsx, apps/desktop/src/components/ui/label.tsx, apps/desktop/src/components/ui/select.tsx, and apps/desktop/src/components/ui/card.tsx — use the existing shadcn components.

### Task 6 — Update product docs and public surfaces

Depends on: Task 5.

Files:

- CHANGELOG.md:8-10
- README.md:9-28, 44-54
- AGENTS.md:361-375
- landing/src/components/home-view.tsx:51-100
- landing/src/app/layout.tsx:8-73
- landing/src/app/opengraph-image.tsx:1-280
- landing/scripts/render-og-animated.mjs:17-50, 96-273
- landing/public/og-animated.gif (generated from the renderer)

Interfaces:

- Documentation describes only the approved engine/client scope, local endpoint behavior, per-profile opt-in, read-only credential model, and settings workflow shipped by Tasks 1-5.
- Keep the README, landing metadata, and actual Open Graph sources aligned with the new MCP feature copy.

Change:

1. Add an Unreleased changelog entry and a README feature/setup section explaining how to enable a separate read-only profile and copy client setup from API Settings.
2. Add an English read-only MCP feature card to the landing homepage and update page metadata and Open Graph descriptions.
3. Update the active Next.js Open Graph image source and animated OG renderer, then regenerate `landing/public/og-animated.gif`. Do not create or edit the absent `landing/public/og-image.svg`.
4. Correct AGENTS.md's stale Open Graph checklist entry: point to `landing/src/app/opengraph-image.tsx` for the active image source and `landing/scripts/render-og-animated.mjs` plus generated `landing/public/og-animated.gif` for the animated asset.
5. Keep the Compare panel and existing SQL/chat screenshots unchanged; this task adds an MCP feature card, not a new Compare panel.

Verify:

- Run `npm --prefix landing run render:og`, `npm --prefix landing run build`, and `pnpm build`; expect the generated GIF and both builds to succeed after the landing and README changes.

Files inspected, no change:

- landing/public/images/sql-panel.png and landing/public/images/chat-panel.png — retain the existing SQL/chat comparison images because this task adds an MCP feature card, not a new Compare panel.

### Task 7 — Verify packaged integration and complete acceptance

Depends on: Tasks 1-6.

Files:

- None; this is a final packaging and acceptance task with no planned source edits.

Interfaces:

- Verify the implementation produced by Tasks 1-5 and documentation/product surfaces from Task 6.
- Use the read-only test-account scripts from Task 2 and the MCP client snippets from Task 5.

Change:

1. Run the final workspace checks: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @kamehadb/sidecar bundle:tauri`, and `pnpm --filter @kamehadb/desktop tauri build`.
2. Use MCP Inspector against all six supported engines to verify schema discovery, queries, row caps and truncation, and native timeout/cancellation. Check Mongo write-stage rejection; separately verify server-engine writes are rejected using the read-only test credentials, and SQLite writes are rejected by its read-only worker.
3. Verify each of Codex, Claude Code, Devin CLI, and OpenCode can connect from its generated snippet against one known-good read-only profile. This checks the four transport/config formats without repeating all six adapter scenarios in every client.
4. Check listener startup/shutdown, bearer auth, disabled-profile denial, token rotation, port conflict and Retry, persistence across restart, concurrent calls and BUSY behavior, and that logs/errors contain no token or database credential.

Verify:

- Every command exits successfully, the Tauri bundle contains the compiled SQLite worker and production dependencies, MCP Inspector exercises all six engines, and all four clients connect with their copied snippets.
- The cross-cutting runtime checks pass; direct write attempts using read-only database credentials are rejected by the engines themselves.
- Residual verification risk: this repository does not start a SQL Server service, so its database-level read-only grant is unverified until Task 2's script is run against a separate SQL Server test instance. Do not mark that acceptance criterion complete without that run.

Files inspected, no change:

- apps/sidecar/scripts/bundle-for-tauri.mjs:83-120 — the existing deploy copies production dependencies and recursively copies dist, including the compiled SQLite worker.
- apps/desktop/src-tauri/src/lib.rs:280-400 — the existing sidecar launch path uses the bundled Node runtime; no native launcher change is planned.

## Approval Gate

Required: yes
Reason: The implementation adds a persisted metadata schema, shared API contracts, management and MCP public APIs, production and development dependencies, and coordinated changes across sidecar, desktop, Docker fixtures, and landing.
Status: approved
Approved by user: 2026-09-30

## Decision Log

- MCP starts automatically without a master switch on the persisted fixed loopback port; a bind conflict makes only MCP unavailable and remains retryable. This preserves the client endpoint and reflects the approved product behavior.
- MCP Settings stays inside API Settings so the feature does not add a top-level AppView.
- SQLite work runs in a separate read-only child process because `better-sqlite3` is synchronous; dev uses the `tsx` loader and production uses the compiled worker entrypoint.
- PostgreSQL uses `pg-cursor` to enforce bounded reads without rewriting allowed SQL forms; `@types/pg-cursor` supplies declarations because the runtime package does not ship them.
- Keep the approved `@modelcontextprotocol/sdk` API family and pin exact version `1.31.0`; the approved design names this package, so adopting the newer package family is outside this plan.
- Keep MongoDB grant setup outside container auto-run directories because the repository's default Mongo service has authentication disabled; only run the helper manually against an auth-enabled test instance.
- Correct the stale AGENTS.md Open Graph checklist to reference the active `opengraph-image.tsx` source and animated renderer/output instead of the absent `og-image.svg`.
