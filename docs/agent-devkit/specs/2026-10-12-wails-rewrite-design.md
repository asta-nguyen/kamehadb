# KamehaDB Wails + Go rewrite

## Goal

Replace the Tauri (Rust) shell and the Node.js/Hono sidecar with a single
Wails v2 + Go binary, replace Monaco Editor with CodeMirror 6, and migrate
existing user data — while keeping feature parity for everything except
TigerBeetle, Qdrant, and vector tooling, which are removed.

## Scope

### Engines (10)

PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB,
MongoDB, Redis.

### Features kept

Connection profiles, schema browsing, SQL editor + results, query history,
schema timeline/diff + migration assistant, PostgreSQL stats views,
engine-specific explorers (Mongo, Redis), embedded `psql` and `mongosh`
terminals, PostgreSQL and file-database backup/restore, AI chat with schema
context, the read-only MCP server, the in-app Logs page, MCP settings UI.

### Removed

TigerBeetle, Qdrant, and all vector tooling (`sql-vector-*` routes,
`postgres-vector-*`, `qdrant-*`, `tigerbeetle-explorer`, `three.js`). The
`landing/` site is untouched.

## Design

### Repository layout

Wails project at the repository root:

```text
go.mod, main.go, app.go, wails.json     # frontend:dir -> apps/desktop
internal/
  store/        # SQLite metadata (modernc.org/sqlite, pure Go) + migrations
  engines/      # adapter interface + 10 driver implementations
  api/          # Wails-bound services replacing the Hono route groups
  terminal/     # creack/pty sessions for psql + mongosh
  maintenance/  # pg_dump/pg_restore + file-database backup/restore jobs
  ai/           # provider client, schema context, embeddings indexer
  mcp/          # read-only MCP server (loopback listener)
  logs/         # file logger + unified read for the Logs page
apps/desktop/   # React 19 + Vite frontend, unchanged location
```

`apps/sidecar`, `apps/desktop/src-tauri`, and the backend-facing parts of
`packages/shared` are deleted at cutover. The pnpm workspace keeps
`apps/desktop` (and `packages/ui`/`packages/shared` only for what the
frontend still needs); Go modules are independent of pnpm.

### IPC

- All request/response calls use Wails-generated bindings (`wailsjs/go/...`)
  produced from Go structs and bound methods; the frontend imports the
  generated typed clients.
- `apps/desktop/src/lib/api.ts` is rewritten as a thin wrapper over the
  generated bindings, preserving its exported call names where practical so
  feature components change minimally.
- `lib/api-client.ts` (fetch, base URL, sidecar token) is deleted. The
  loopback bearer token survives only inside the MCP listener.
- Streaming uses Wails events (`EventsEmit`/`EventsOn`) with an explicit
  per-session protocol (session id + `output`/`input`/`resize`/`exit`
  messages) for: PTY terminals, AI chat tokens, and maintenance job
  progress. Query cancellation uses explicit bound `cancel` methods —
  Wails calls do not abort like fetch.

### Metadata store and migration

- `internal/store` opens the existing `kamehadb.db` (same resolution rules:
  `KAMEHADB_DATA_DIR` override, otherwise the app data dir) and applies the
  current schema: `connection_profiles`, `mcp_managed_accounts`,
  `ai_settings`, `ai_provider_configs`, `chat_messages`, `query_history`,
  `schema_snapshots`, `schema_watchers`, `schema_embeddings`, `mcp_settings`.
- Hard requirement: the MCP credential vault stays byte-compatible —
  AES-256-GCM ciphertext rows plus the 32-byte key file at
  `<dbPath>.mcp.key` with owner-only permissions — so existing managed
  accounts decrypt identically in Go. Any other cipher/encoding breaks
  migration.
- Migration is verified against a copy of a real pre-rewrite `kamehadb.db`.

### Engine drivers

| Engine          | Go driver                     | Notes                                                                            |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| PostgreSQL      | `jackc/pgx/v5`                | richest surface: stats, timeline, psql, pg_dump                                  |
| MySQL / MariaDB | `go-sql-driver/mysql`         | one driver, both kinds                                                           |
| SQLite          | `modernc.org/sqlite`          | pure Go, doubles as metadata store                                               |
| SQL Server      | `microsoft/go-mssqldb`        |                                                                                  |
| Oracle          | `sijms/go-ora/v2`             | pure Go, no Oracle client libs — verify feature parity vs `oracledb` during port |
| ClickHouse      | `ClickHouse/clickhouse-go/v2` |                                                                                  |
| DuckDB          | `marcboeker/go-duckdb`        | **cgo** — binds native libduckdb; build/packaging must link it                   |
| MongoDB         | `mongo-driver/v2`             |                                                                                  |
| Redis           | `redis/go-redis/v9`           |                                                                                  |

The adapter interface ports the `SqlAdapter` contract plus the dedicated
Mongo/Redis flows; engine parity is judged against current route behavior,
not the letter of the TS types.

### Terminals and maintenance

- `internal/terminal` uses `creack/pty` for both `psql` and `mongosh`,
  unifying today's two mechanisms (Rust PTY for psql, `node-pty` in the
  sidecar for mongosh). Binary resolution port: app-managed `mongosh`
  download under the app data dir; `psql`/pg tooling resolution ported from
  the current config.
- `internal/maintenance` runs `pg_dump`/`pg_restore` and file-database
  backup/restore via `os/exec`, reporting progress and logs through events.

### MCP server

- `internal/mcp` keeps the loopback-only Streamable HTTP JSON-RPC listener
  at `/mcp`, default port `13979`, bearer-token auth from `mcp_settings`,
  and the same ten read-only tools and guardrails (`isQuerySafe` port,
  managed-account requirement, per-profile allowlist, concurrency cap,
  query timeouts, stable error taxonomy, `recovery_required` /
  `revoke_failed` lifecycle).
- MCP account provisioning ports the per-engine grant flows (Postgres
  CONNECT/USAGE/SELECT, MySQL/MariaDB SELECT, SQL Server `db_datareader`,
  Mongo `read` role, SQLite read-only worker equivalent).

### AI

- `internal/ai` ports provider settings, model listing, schema context +
  embeddings indexer (`schema_embeddings` table), and chat history;
  assistant responses stream to the frontend as events.

### Frontend changes

- `api.ts` → bindings wrapper; `api-client.ts` deleted; the
  `invokeTauri`/`listenTauri` wrappers in `lib/tauri.ts` and their ~11
  consuming modules move to bindings/events; `lib/tauri.ts` is removed.
- CodeMirror 6 replaces Monaco in `sql-editor.tsx`, `redis-query.tsx`,
  `mongo-query.tsx`, `federated-query-canvas.tsx`: `@codemirror/lang-sql`
  for SQL and federated editing, `lang-javascript` for Mongo, plain text
  for Redis (no Redis language package exists; keep the current feature
  set — highlighting, completion, keymaps). `monaco-editor`,
  `@monaco-editor/react`, `monaco-loader.ts` deleted.
- Removed components/routes: `tigerbeetle-explorer`, `qdrant-*`,
  `postgres-vector-*`, `three.js`, `sql-vector-*` sidecar routes.
- A small hand-maintained frontend module keeps `KIND`-style string unions
  (generated Wails models do not preserve TS string-union ergonomics).
- Desktop tests: untouched components keep their vitest suite; editor tests
  are rewritten for CodeMirror; Rust-side `cargo test` coverage dies with
  `src-tauri` — store, vault, MCP, and SQL-safety logic get Go tests.

### Build, dev, release

- `wails dev` replaces `pnpm dev`; a root `pnpm dev` script may wrap it.
  Node remains build-time tooling only (Vite) — runtime has zero Node.
- Release CI keeps a per-OS runner matrix. `wails build` produces binaries
  (+ NSIS on Windows); `.dmg`, `.deb`, `.rpm`, `.AppImage` need
  nfpm/scripts — a known packaging regression vs `tauri build`, handled as
  a plan task.

### Build order (one continuous effort, single cutover)

1. Wails skeleton + `internal/store` with DB migration + connections + Postgres slice
2. Remaining SQL engines → Mongo + Redis
3. `api.ts` rewiring per feature area
4. Feature ports: query history, schema timeline/diff, stats, AI chat, maintenance, terminals, MCP, logs
5. CodeMirror swap
6. Cutover: delete `apps/sidecar`, `src-tauri`, stale shared code; packaging CI; `document-wiki` refresh

Tasks land as PRs into a long-lived `wails-rewrite` integration branch;
the final cutover PR targets the main branch. The app is not expected to be
releasable from the integration branch mid-rewrite.

## Impact map

```text
Entry: apps/desktop/src/lib/api.ts — `request`/`api` (frontend → backend boundary)
Flow: React components/hooks → api.ts request() → Hono routers in
  apps/sidecar/src/routes/*.ts → apps/sidecar/src/adapters/*.ts → external DBs;
  metadata paths → apps/sidecar/src/db/metadata-store.ts → kamehadb.db
State changes: kamehadb.db (10 tables, listed above); <dbPath>.mcp.key;
  app-data logs dir
External effects: outbound DB connections on all 10 engines; AI provider
  HTTP calls; MCP loopback listener; managed-account DB provisioning
Change candidates: apps/desktop/src/lib/api.ts, lib/api-client.ts,
  lib/tauri.ts, all hooks/components consuming api; apps/sidecar/**
  (deleted); packages/shared/src/** (backend contract)
Verification: per-feature UAT in `wails dev`; Go tests for store/vault/MCP;
  vitest for untouched components; migration test on real kamehadb.db copy
Verified at: e83378a2c2dc8e19c0392f32545d433817b8ba8c
```

```text
Entry: apps/desktop/src/lib/tauri.ts — `invoke` call sites (frontend → Rust)
Flow: components → tauri.ts invoke() → Tauri commands in
  apps/desktop/src-tauri/src/{app_logs,postgres_psql,postgres_tools,
  terminal_sessions} → child processes/PTY + Tauri events back to frontend
State changes: app-data logs (frontend.log, tauri.log, sidecar.log);
  psql/pg_dump child processes
External effects: PTY sessions, backup/restore jobs, event emissions
Change candidates: tauri.ts + call sites; src-tauri/** (deleted);
  internal/terminal, internal/maintenance, internal/logs (new)
Verification: terminal I/O and job progress UAT; log page snapshot check
Verified at: e83378a2c2dc8e19c0392f32545d433817b8ba8c
```

```text
Entry: apps/sidecar/src/mcp/runtime.ts — `McpRuntime` (external MCP clients)
Flow: external MCP client → POST 127.0.0.1:13979/mcp (bearer auth) →
  tools.ts → adapter-manager → engine adapters → external DBs
State changes: mcp_settings, mcp_managed_accounts, .mcp.key
External effects: read-only DB queries; account provisioning/revoke
Change candidates: apps/sidecar/src/mcp/** → internal/mcp (new);
  mcp-settings routes + desktop section rewired to bindings
Verification: ported MCP tests (auth, bounds, lifecycle, recovery)
Verified at: e83378a2c2dc8e19c0392f32545d433817b8ba8c
```

## Verification

- Migration: point the Go store at a copy of a real `kamehadb.db`; all
  tables readable, managed MCP accounts decrypt and load, history/settings
  intact.
- Per-slice checks during the build order; manual UAT per feature in
  `wails dev` (connections, query run/cancel, terminals, backup/restore,
  AI chat stream, MCP tool calls, logs page).
- Go unit tests for: schema migration, credential vault compatibility,
  `isQuerySafe` port, MCP auth/lifecycle, SQL-safety helpers.
- `wails build` succeeds per target OS; packaged app launches and runs the
  same UAT smoke path.
- Final `document-wiki` pass: `docs/llm` is stale from the first merged
  task and must be re-verified before the change is done.

## Related context

- [Architecture overview](../../llm/architecture/overview.md)
- [Read-only MCP server](../../llm/integrations/read-only-mcp.md)

## Execution

- [Implementation plan](../plans/2026-10-12-wails-rewrite-plan.md) — created by `plan-feature`

## Decision Log

### D1 — IPC via Wails bindings

Decision: Use generated Go↔TS bindings and Wails events instead of keeping
an embedded HTTP API; `api.ts` is rewritten, not preserved.
Confirmed by user: 2026-10-12

### D2 — Big-bang rewrite

Decision: Single continuous rewrite with one cutover to a releasable app;
tasks still build bottom-up and land on an integration branch.
Confirmed by user: 2026-10-12

### D3 — Feature scope

Decision: All current features survive the port except TigerBeetle, Qdrant,
and vector tooling, which are removed (10 engines).
Confirmed by user: 2026-10-12

### D4 — Data migration

Decision: Migrate the existing `kamehadb.db`, including byte-compatible
AES-256-GCM MCP credential vault and `<dbPath>.mcp.key`.
Confirmed by user: 2026-10-12

### D5 — Repository layout

Decision: Wails project at repo root; React frontend stays at
`apps/desktop` via `frontend:dir`.
Confirmed by user: 2026-10-12

### D6 — Wails version

Decision: Target Wails v2 (stable); v3 remains alpha.
Confirmed by user: 2026-10-12
