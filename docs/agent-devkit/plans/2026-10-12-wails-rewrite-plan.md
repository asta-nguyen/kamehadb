# KamehaDB Wails + Go rewrite — implementation plan

## Approved design

- [KamehaDB Wails + Go rewrite](../specs/2026-10-12-wails-rewrite-design.md)

## Global Constraints

- Wails v2 (stable) only; generated bindings land in `apps/desktop/wailsjs`.
- Frontend↔backend IPC is Wails bindings + events only — no HTTP/fetch
  layer between them. `api.ts` stays a thin wrapper preserving exported
  call names where practical; `api-client.ts` is deleted at cleanup.
- Streaming uses Wails events with an explicit per-session protocol
  (session id + `output`/`input`/`resize`/`exit`); query cancellation uses
  explicit bound `cancel` methods.
- The metadata store must open the existing `kamehadb.db` and apply the
  current schema; the MCP credential vault stays byte-compatible
  (AES-256-GCM rows + 32-byte key file at `<dbPath>.mcp.key`,
  owner-only permissions).
- MCP stays loopback-only at `127.0.0.1:13979/mcp` with bearer auth from
  `mcp_settings`, same ten read-only tools and error taxonomy.
- Engine parity is judged against current route behavior, not TS types.
- Reuse, no duplication: each mechanism exists exactly once — port the
  existing TS/Rust logic rather than re-inventing it; shared
  implementations only (`internal/terminal` for both shells,
  `engines.Registry` for all adapters, `internal/store` accessors shared
  by services, one `lib/kinds.ts` in the frontend, generated `wailsjs`
  models as the single type source — no parallel type declarations).
  `api.ts` preserves exported call names so feature components are not
  forked or duplicated.
- Tasks land as PRs into the `wails-rewrite` integration branch;
  intermediate states are not required to keep the old Tauri+sidecar dev
  path working — `pnpm dev` keeps working only on `main` until cutover.

## Impact map

```text
Entry: no existing source; planned entry: main.go + app.go (Wails app
  bootstrap, OnStartup wiring of internal/api services)
Flow: no existing flow; planned flow: React components → api.ts →
  generated wailsjs bindings → internal/api services → internal/engines
  adapters → external DBs; metadata → internal/store → kamehadb.db
State changes: kamehadb.db (migrated, 10 tables); <dbPath>.mcp.key;
  app-data logs dir
External effects: outbound DB connections (10 engines); AI provider HTTP;
  MCP loopback listener; PTY child processes; pg_dump/pg_restore jobs
Change candidates: main.go, app.go, wails.json, go.mod, internal/** (new);
  apps/desktop/src/lib/api.ts + consumers (rewired); apps/sidecar,
  src-tauri, parts of packages/shared (deleted at cutover)
Verification: per-task Verify below; real-DB migration test; per-feature
  UAT in `wails dev`; `wails build` per OS
Verified at: e83378a2c2dc8e19c0392f32545d433817b8ba8c
```

```text
Entry: no existing source; planned entry: internal/mcp runtime listener
Flow: no existing flow; planned flow: external MCP client → POST
  127.0.0.1:13979/mcp (bearer) → tool dispatch → adapter-manager →
  engine adapters → external DBs
State changes: mcp_settings, mcp_managed_accounts, .mcp.key (unchanged
  formats — migration compatibility)
External effects: read-only DB queries; managed-account
  provision/revoke DB writes
Change candidates: internal/mcp/** (new); mcp-settings UI rewired
Verification: Go tests for auth/bounds/lifecycle; manual MCP client call
Verified at: e83378a2c2dc8e19c0392f32545d433817b8ba8c
```

## Tasks

### Phase 1 — Foundations

**Task 1 — Wails v2 scaffold**

- Files: `go.mod`, `main.go`, `app.go`, `wails.json`, `.gitignore` (add
  `build/`, `apps/desktop/wailsjs`); root `package.json` scripts
- Interfaces: produces the app shell every later task wires into:
  `app.go` exposes `startup(ctx)`/`shutdown(ctx)` hooks where services are
  registered; `wails.json` sets `"frontend:dir": "apps/desktop"`,
  `"frontend:build": "pnpm --filter @kamehadb/desktop build"`,
  `"frontend:dev:serverUrl": "auto"` (Vite port 1420).
- Change: create module `github.com/asta-nguyen/kamehadb` (Go 1.23+,
  installed toolchain is 1.27); add Wails v2 dependency; minimal `main.go`
  running `wails.Run` with the app and no bound services yet. `wails dev`
  launches the window loading the existing React app.
- Verify: `wails dev` opens a native window rendering the current UI
  (backend calls fail — expected); `wails build` produces `build/bin/` binary.

**Task 2 — `internal/store`: open, migrate, connection profiles**

- Files: `internal/store/store.go` (`Open`, `Close`, `Migrate`),
  `internal/store/profiles.go` (profile CRUD), `internal/store/store_test.go`
- Interfaces: produces `*store.Store` (wraps `*sql.DB` via
  `modernc.org/sqlite`) consumed by all services; `Profile` Go struct
  mirroring `connection_profiles` columns; path resolution honoring
  `KAMEHADB_DATA_DIR`, else app-data dir, else `./kamehadb.db`.
- Change: port the full schema DDL and migration sequence from
  `apps/sidecar/src/db/metadata-store.ts` (all 10 tables —
  `connection_profiles`, `mcp_managed_accounts`, `ai_settings`,
  `ai_provider_configs`, `chat_messages`, `query_history`,
  `schema_snapshots`, `schema_watchers`, `schema_embeddings`,
  `mcp_settings` — including CHECK constraints and indexes); port
  `listProfiles`, `getProfile`, `getProfilePassword`, `createProfile`,
  `updateProfile`, `deleteProfile`.
- Verify: `go test ./internal/store` — open a copy of a real
  `kamehadb.db`, assert tables/indexes exist and a saved profile
  round-trips; fresh-create path also covered.

**Task 3 — `internal/store`: auxiliary entities**

- Files: `internal/store/queryhistory.go`, `internal/store/chat.go`,
  `internal/store/schema.go` (snapshots + watchers), `internal/store/ai.go`
  (ai_settings + ai_provider_configs), `internal/store/mcp.go`
  (mcp_settings + mcp_managed_accounts records, no crypto),
  `internal/store/embeddings.go`
- Interfaces: extends `*store.Store` with the accessors the services need:
  query-history save/list/update/delete; chat save/list/clear; snapshot
  save/list/get/prune; watcher get/upsert/delete/list-enabled; AI
  settings get/save; MCP settings get/port update/rotate token; managed
  account create/state/clear/list/get; embeddings upsert/list/clear.
- Change: port remaining exported functions of `metadata-store.ts`,
  preserving column names, JSON blob fields, and query ordering.
- Verify: `go test ./internal/store` — per-entity round-trip tests;
  ordering assertions matching current queries (e.g. history
  `created_at` ordering).

**Task 4 — `internal/store`: MCP credential vault (byte-compatible)**

- Files: `internal/store/vault.go`, `internal/store/vault_test.go`
- Interfaces: `SaveManagedCredential(profileID, bundle)`,
  `LoadManagedCredential(profileID)` consumed by `internal/mcp`
  adapter-manager (Task 25/26). Byte-compat contract from design.
- Change: port `mcp-credential-vault.ts`: AES-256-GCM encrypt/decrypt of
  the credential bundle with identical nonce/tag layout; key file
  `<dbPath>.mcp.key` (random 32 bytes, `0600`), created on first use;
  missing/invalid ciphertext fails closed.
- Verify: `go test` — decrypt a ciphertext+key pair generated by the
  current TS implementation (fixture copied into testdata); encrypt →
  decrypt round-trip; tampered ciphertext and missing key both fail
  closed without plaintext.

**Task 5 — `internal/engines`: contract + registry**

- Files: `internal/engines/types.go` (QueryResult, DatabaseInfo,
  SchemaInfo, TableInfo, ColumnInfo, IndexInfo, TableCompletions,
  PreviewRowsInput, RunQueryInput, TestConnectionResult, IndexStats,
  TableStats, DatabaseSize, ConnectionInfo, SchemaSearch\*),
  `internal/engines/kinds.go` (KIND constants, ALL_KINDS, SQL_KINDS,
  DEFAULT_PORTS, helpers `IsSqlKind` etc.), `internal/engines/adapter.go`
  (`SqlAdapter` interface mirroring the 11 required + 5 optional methods
  with `context.Context` first arg), `internal/engines/registry.go`
  (per-connection adapter cache, mirrors `adapterCache`)
- Interfaces: consumed by every engine adapter (Tasks 6, 10–15) and the
  sql/MCP services; optional methods exposed via small interfaces
  (`Statser`, `SessionLister`) type-asserted like the TS `?` methods.
- Change: port the `SqlAdapter` contract and kind machinery from
  `packages/shared/src/types.ts` + `schemas.ts` constants.
- Verify: `go build ./internal/engines`; unit test for kind helpers and
  registry get/put/delete semantics.

**Task 6 — Postgres adapter**

- Files: `internal/engines/postgres/postgres.go`,
  `internal/engines/postgres/stats.go`, tests
- Interfaces: implements `engines.SqlAdapter` + stats/session optionals.
- Change: port `apps/sidecar/src/adapters/postgres.ts` with `pgx/v5`:
  connect/test, metadata listing, completions, preview, runQuery with
  row limits and `context.Context` cancellation, index/table stats,
  database sizes, active sessions.
- Verify: `docker compose up -d postgres`; `go test` integration test
  gated behind env DSN (skipped when unset) + manual UAT via `wails dev`
  once Task 9 lands.

**Task 7 — `internal/sqlsafety`: `isQuerySafe` port**

- Files: `internal/sqlsafety/sqlsafety.go`, `sqlsafety_test.go`
- Interfaces: `IsQuerySafe(query string) bool` consumed by MCP tools
  (Task 25) and anywhere the TS code used it.
- Change: port `apps/sidecar/src/lib/sql-safety.ts` — statement-chain
  rejection, destructive keyword screening, allowed leading keywords
  (`SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`). Keyword screening,
  not parsing — preserve semantics exactly.
- Verify: `go test` — port the existing test cases plus: `DROP`→reject,
  `SELECT …; DELETE`→reject, `WITH … SELECT`→accept,
  `EXPLAIN ANALYZE`→accept.

**Task 8 — `internal/api`: ConnectionsService + first bindings**

- Files: `internal/api/connections.go`, `app.go` (bind service),
  `apps/desktop/src/lib/api.ts` (connection methods → bindings),
  generated `apps/desktop/wailsjs/**`
- Interfaces: bound methods replace `/connections` endpoints: list, get,
  create, update, delete, test, checkHealth (global + per-id), and
  `setMcpEnabled` (setter only — managed-account guards land in Task 26).
- Change: port `routes/connections.ts` behavior to a Wails-bound service;
  run `wails generate module` (or `wails dev`) to emit bindings; rewrite
  the connection slice of `api.ts` to call them.
- Verify: `wails dev` — create/edit/delete a profile and run a Postgres
  health check end-to-end in the window; `pnpm --filter @kamehadb/desktop
typecheck` passes.

### Phase 2 — SQL service + remaining engines

**Task 9 — `internal/api`: SqlService + frontend rewire**

- Files: `internal/api/sql.go`, `apps/desktop/src/lib/api.ts` (sql slice)
- Interfaces: bound methods for databases/schemas/tables/columns/indexes/
  autocomplete/schema-search/runQuery/previewRows/cancelQuery/table
  stats/index stats/database sizes/active sessions; consumes
  `engines.Registry` from Task 5 and Postgres adapter from Task 6.
- Change: port `routes/sql.ts` incl. adapter cache eviction on profile
  change and the explicit `CancelQuery(connectionId)` method (replaces
  fetch abort); rewire sql hooks/components via `api.ts`.
- Verify: `wails dev` — browse schema tree, run + cancel a long query,
  open table view and stats for Postgres docker DB.

**Task 10 — MySQL/MariaDB adapter**

- Files: `internal/engines/mysql/mysql.go`, tests
- Change: port `adapters/mysql.ts` + `mariadb` handling with
  `go-sql-driver/mysql`.
- Verify: docker mysql+mariadb; same UAT path as Task 9.

**Task 11 — SQLite adapter + file-database maintenance**

- Files: `internal/engines/sqlite/sqlite.go`,
  `internal/maintenance/filedb.go`, `internal/api/connections.go`
  (add `backupFileDatabase`/`restoreFileDatabase`)
- Interfaces: adds bound methods consumed by
  `file-database-backup/restore-dialog.tsx` via `api.ts`.
- Change: port `adapters/sqlite.ts` with `modernc.org/sqlite`; port
  `lib/file-database-maintenance.ts` (sqlite/duckdb file backup+restore).
- Verify: UAT — open a `.duckdb`/`.sqlite` file DB, run backup+restore
  dialogs; `go test` for backup file integrity.

**Task 12 — SQL Server adapter**

- Files: `internal/engines/sqlserver/sqlserver.go`, tests
- Change: port `adapters/sqlserver.ts` with `go-mssqldb`.
- Verify: docker sqlserver; UAT path as Task 9.

**Task 13 — Oracle adapter**

- Files: `internal/engines/oracle/oracle.go`, tests
- Change: port `adapters/oracle.ts` with `sijms/go-ora/v2`; verify the
  used `oracledb` features map (SYS connection, metadata queries).
- Verify: docker oracle (`ORCLPDB1`); UAT path as Task 9.

**Task 14 — ClickHouse adapter**

- Files: `internal/engines/clickhouse/clickhouse.go`, tests
- Change: port `adapters/clickhouse.ts` with `clickhouse-go/v2` (HTTP or
  native protocol as the TS driver used).
- Verify: docker clickhouse; UAT path as Task 9.

**Task 15 — DuckDB adapter (cgo)**

- Files: `internal/engines/duckdb/duckdb.go`, `wails.json`/build docs for
  `CGO_ENABLED=1` + libduckdb linking
- Change: port `adapters/duckdb.ts` with `marcboeker/go-duckdb`; document
  the cgo requirement and link strategy (this is the one non-pure-Go
  driver).
- Verify: open a local `.duckdb` file; UAT path as Task 9.

### Phase 3 — Schema lifecycle

**Task 16 — Schema snapshots, diff, watcher, migration assistant**

- Files: `internal/schema/diff.go` (port `lib/schema-diff.ts`),
  `internal/schema/migration.go` (port `lib/schema-migration.ts`),
  `internal/schema/watcher.go` (port `lib/schema-watcher.ts`),
  `internal/api/schema.go`, `apps/desktop/src/lib/api.ts` (schema slice)
- Interfaces: bound methods replacing `routes/sql-schema.ts` (snapshots
  CRUD, changelog, diff, watcher start/stop/status, notify start/stop);
  watcher ticks emit Wails events for UI updates; consumes
  `internal/store` snapshot/watcher accessors (Task 3) + engine adapters.
- Change: port the schema lifecycle behavior; rewire
  `schema-timeline.tsx`, `schema-diff-view.tsx`,
  `migration-assistant.tsx` via `api.ts` + events.
- Verify: UAT — capture snapshot, alter a table in docker postgres,
  confirm changelog/diff and watcher notification; migration SQL output
  matches a known change.

### Phase 4 — Mongo + Redis

**Task 17 — Mongo adapter + MongoService**

- Files: `internal/engines/mongodb/mongo.go`,
  `internal/api/mongo.go`, `apps/desktop/src/lib/api.ts` (mongo slice)
- Interfaces: bound methods replacing `routes/mongo.ts` minus `/shell`:
  collections, databases, find, aggregate, insert/update/delete, stats,
  autocomplete, test.
- Change: port `adapters/mongodb.ts` + mongo routes with
  `mongo-driver/v2`; rewire `mongo-view.tsx`, `mongo-query.tsx` calls.
- Verify: docker mongo; UAT — browse databases/collections, run a find
  and an aggregate, edit a document.

**Task 18 — `internal/terminal` + mongosh sessions**

- Files: `internal/terminal/terminal.go` (PTY session manager over
  `creack/pty`: spawn/write/resize/close + `terminal:<id>` events),
  `internal/terminal/mongosh.go` (managed-binary resolution ported from
  `lib/mongosh.ts`: local `mongosh` else app-managed download),
  `internal/api/mongo.go` (shell methods), `mongo-shell.tsx` rewire
- Interfaces: `Spawn(session spec) → sessionID`, events
  `terminal:<id>` output, methods `Write/Resize/Close`; consumed by
  mongosh now and psql in Task 22 (replaces both node-pty and Rust PTY).
- Change: port shell create/stream/write/resize/delete semantics from
  `routes/mongo.ts` shell section to the event protocol.
- Verify: UAT — open mongosh tab against docker mongo, run a command,
  resize window; missing-binary path offers managed download.

**Task 19 — Redis adapter + RedisService**

- Files: `internal/engines/redis/redis.go`, `internal/api/redis.go`,
  `apps/desktop/src/lib/api.ts` (redis slice)
- Interfaces: bound methods replacing `routes/redis.ts`: test, scanKeys,
  getValue, getTtl, runCommand, stats.
- Change: port `adapters/redis.ts` + routes with `redis/go-redis/v9`;
  rewire `redis-view.tsx`, `redis-query.tsx`.
- Verify: docker redis; UAT — scan keys, inspect a value+TTL, run a
  command.

### Phase 5 — Platform features

**Task 20 — QueryHistoryService**

- Files: `internal/api/queryhistory.go`, `api.ts` rewire
- Change: bound methods for save/list/update/delete over store
  accessors (Task 3); rewire `query-history-panel.tsx` and the editor's
  history-save call.
- Verify: UAT — run a query, see it in history, favorite and delete.

**Task 21 — AiService (settings, models, context, streaming chat)**

- Files: `internal/ai/provider.go` (port `ai/provider.ts`),
  `internal/ai/indexer.go` (port `ai/indexer.ts` + schema context),
  `internal/ai/embeddings.go` (schema_embeddings access),
  `internal/api/ai.go`, `api.ts` + `ai-chat-panel.tsx` /
  `api-settings-page.tsx` rewire
- Interfaces: bound methods replacing `routes/ai.ts`: get/save settings,
  list models (provider HTTP), chat (streams `chat:<id>` token events),
  chat-history get/clear, clear-schema-cache; port the ReadableStream
  response to chunked events.
- Change: port AI behavior; SSE/token streaming becomes Wails events.
- Verify: UAT — configure a provider, list models, send a chat and watch
  tokens stream; schema context survives restart.

**Task 22 — psql terminal service**

- Files: `internal/terminal/psql.go` (binary resolution ported from
  `postgres_psql/config` logic), `internal/api/terminal.go`,
  `postgres-psql-tab.tsx` rewire
- Interfaces: reuses `internal/terminal` session manager + events from
  Task 18; bound spawn/write/resize/close for psql.
- Change: port `src-tauri/src/postgres_psql` + `terminal_sessions`
  behavior — psql spawn with profile env, output via events.
- Verify: UAT — open psql tab on docker postgres, run `\dt`, resize.

**Task 23 — MaintenanceService (pg_dump/pg_restore + progress)**

- Files: `internal/maintenance/postgres.go` (job runner via `os/exec`,
  progress+exit via `job:<id>` events; port `postgres_tools/jobs.rs` +
  `config.rs` tool resolution), `internal/api/maintenance.go`,
  backup/restore dialogs rewire
- Change: port Postgres backup/restore job lifecycle incl. tool
  discovery and progress reporting.
- Verify: UAT — run backup then restore into a scratch docker postgres
  DB; progress events update the dialog.

**Task 24 — LogsService + unified logs**

- Files: `internal/logs/logs.go` (JSON-lines file logger replacing pino
  multistream: stdout + `${KAMEHADB_DATA_DIR}/logs/app.log`),
  `internal/api/logs.go`, `logs-page.tsx` + `lib/app-logs.ts` rewire
- Interfaces: bound `ReadAppLogs` returning a merged snapshot of
  `frontend.log` + `app.log`; frontend errors still forwarded via a bound
  `AppendFrontendLog`.
- Change: port `app_logs.rs` read/merge semantics to Go; two producer
  files (`frontend.log`, `app.log`) since the Tauri producer is gone.
- Verify: UAT — trigger a frontend error and a backend action, open Logs
  page, both entries present with level parsing.

### Phase 6 — MCP

**Task 25 — MCP runtime + tools + adapter-manager**

- Files: `internal/mcp/runtime.go` (loopback listener `127.0.0.1`,
  `/mcp`, port from `mcp_settings` default 13979, bearer auth,
  constant-time compare, status `listening|unavailable|stopped`),
  `internal/mcp/tools.go` (ten read-only tools),
  `internal/mcp/errors.go` (stable taxonomy incl. `QUERY_TIMEOUT`,
  `TIMEOUT_UNAVAILABLE`, `BUSY`), `internal/mcp/adapters.go`
  (per-profile adapter manager, managed-credential-only access,
  concurrency cap 4, 30s budget, row limits, Mongo `$out`/`$merge`
  rejection, database-argument scoping), tests
- Interfaces: consumes `internal/store` (settings, managed accounts,
  vault — Tasks 3–4), `internal/engines` adapters, `sqlsafety` (Task 7);
  produces a runtime started by `app.go` alongside Wails.
- Change: port `mcp/runtime.ts`, `tools.ts`, `adapter-manager.ts`,
  `adapters/factory.ts` + per-engine MCP adapters, `errors.ts`; keep
  Streamable HTTP JSON-RPC POST semantics and error codes (404/405/401/ 400) exactly.
- Verify: `go test ./internal/mcp` — auth, tool list, query bounds,
  BUSY cap, timeout mapping; manual `curl -X POST /mcp` JSON-RPC call
  against docker postgres.

**Task 26 — MCP account provisioning + mcp-settings service**

- Files: `internal/mcp/provisioner.go` (port `account-provisioner.ts` —
  generated principal naming, PG CONNECT/USAGE/SELECT, MySQL/MariaDB
  SELECT, MSSQL `db_datareader`, Mongo `read` role, Mongo auth-required
  probe, `prepared`/`recovery_required`/`revoke_failed` lifecycle),
  `internal/api/mcp.go` (settings get/patch/retry/rotate-token, accounts
  list, prepare/provision/revoke — port `routes/mcp-settings.ts` +
  `connections.patch('/:id/mcp')` guard rules: profile-edit/delete
  rejection while account exists), `mcp-settings-section.tsx` +
  `use-mcp-settings.ts` rewire
- Interfaces: consumes runtime + adapter-manager (Task 25) and vault
  (Task 4); SQLite profiles need no account (read-only worker
  equivalent).
- Change: port the full managed-account flow and settings UI wiring.
- Verify: `go test` provisioner naming/state machine; UAT — prepare →
  provision → enable → MCP client query works; Revoke drops the
  principal and clears state; recovery states retry correctly.

### Phase 7 — Frontend cleanup + editor

**Task 27 — Remove dropped surface + frontend kinds module**

- Files: delete `components/tigerbeetle-explorer.tsx`,
  `components/qdrant-*.tsx`, `components/postgres-vector-*.tsx`,
  federated/vector hooks if any; new `src/lib/kinds.ts` (KIND, ALL_KINDS,
  SQL_KINDS, NOSQL_KINDS, DEFAULT_PORTS, PROTOCOL_ALIASES, kind helpers —
  copied constants for frontend use); sweep remaining `api-client.ts`,
  `tauri.ts`, `monaco-loader.ts` references
- Change: delete dropped features; update every import of removed kinds
  to `lib/kinds.ts`; remove `three`, `@xyflow?` — keep xyflow (ERD
  stays), remove `three`, tigerbeetle/qdrant client deps.
- Verify: `pnpm --filter @kamehadb/desktop typecheck` + `vitest run`
  pass; no import resolves to removed modules.

**Task 28 — CodeMirror 6 swap**

- Files: `components/sql-editor.tsx`, `redis-query.tsx`,
  `mongo-query.tsx`, `federated-query-canvas.tsx`,
  `lib/sql-autocomplete.ts` (adapt to CodeMirror completion source),
  `lib/monaco-loader.ts` (delete), `sql-editor.test.ts` (rewrite),
  `package.json` (remove `monaco-editor`, `@monaco-editor/react`; add
  `codemirror`, `@codemirror/lang-sql`, `lang-javascript`, `@codemirror/
autocomplete`, `view`, `state`, theme packages)
- Interfaces: each editor keeps its existing component props/behavior:
  SQL + federated use `lang-sql`, Mongo uses `lang-javascript`, Redis
  plain text; completion sources reuse the schema completion data
  already fetched by `api.ts`.
- Change: swap Monaco for CodeMirror 6 preserving run-query keymap,
  schema completions, and theme.
- Verify: `vitest run` rewritten editor tests; UAT — autocomplete, run
  (keymap), multi-statement editing in each editor.

### Phase 8 — Cutover + release

**Task 29 — Cutover: delete old stack**

- Files: delete `apps/sidecar/`, `apps/desktop/src-tauri/`, backend parts
  of `packages/shared` (keep only what frontend still imports, or fold
  into `lib/`); root `package.json` (`dev` → `wails dev` wrapper,
  `build` → `wails build`; drop sidecar scripts); prune deps
  (`hono`, `better-sqlite3`, `node-pty`, engine client libs,
  `@tauri-apps/*`, `monaco-editor`, `three`); `pnpm-workspace.yaml`;
  `CHANGELOG.md` `[Unreleased]`; `AGENTS.md`, `README.md` stack/docs;
  `.github/workflows/ci*` scripts that referenced sidecar/cargo.
- Change: the Wails binary is the only runtime; workspace shrinks to the
  frontend package(s).
- Verify: `pnpm install` clean; `pnpm --filter @kamehadb/desktop
typecheck` + `vitest run`; `wails build` succeeds; `wails dev` UAT
  smoke across each engine + features.

**Task 30 — Packaging + release CI**

- Files: `.github/workflows/release.yml`, packaging scripts/config
  (`nfpm` or equivalent for `.deb`/`.rpm`/`.AppImage`; macOS `.app` +
  `.dmg`; Windows NSIS via `wails build -nsis` producing `.exe`; note
  `.msi` needs WiX — decide per release requirement, matching the
  workflow's expected assets `.dmg .exe .msi .deb .AppImage .rpm`)
- Change: replace `tauri build` matrix with `wails build` on per-OS
  runners (Linux installs webkit2gtk deps); bundle `libduckdb` with the
  app; keep tag-trigger + draft-release + asset-upload shape.
- Verify: `wails build` on Linux runner produces binary; nfpm package
  step produces `.deb` locally; full matrix verified on a release-candidate
  tag (CI check, mirrors existing workflow verification style).

## Approval Gate

Required: yes
Reason: replaces the entire public API boundary, build system,
dependencies, CI, and touches most files in the repo
Status: approved

## Decision Log

### D1 — Reuse over duplication

Decision: Port existing logic and keep single shared implementations for
every mechanism (terminal manager, adapter registry, store accessors,
kind constants, generated types); no parallel modules or re-inventions.
Non-material — restates the design's port-the-behavior intent and repo
rules; approval stands.
Confirmed by user: 2026-10-12
