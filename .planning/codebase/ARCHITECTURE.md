---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: arch
---

# Architecture

## Pattern

KamehaDB follows a **client-sidecar** architecture: a Tauri v2 desktop app (React frontend + Rust native layer) communicates with a local Node.js HTTP sidecar (Hono). The sidecar houses all database adapters and metadata persistence. The frontend never touches databases directly.

```
┌─────────────────────────────────────────────────┐
│                 Tauri Desktop App                │
│  ┌───────────────┐  ┌────────────────────────┐  │
│  │  React 19 UI  │  │  Rust Native Commands  │  │
│  │  (Vite build) │  │  (psql, logs, PTY,     │  │
│  │               │  │   backup/restore)      │  │
│  └──────┬────────┘  └──────────┬─────────────┘  │
│         │ HTTP (127.0.0.1:3170) │ IPC            │
└─────────┼──────────────────────┼────────────────┘
          │                      │
          ▼                      ▼
┌─────────────────────┐  ┌──────────────────┐
│   Hono Sidecar      │  │  OS Keyring      │
│   (Node.js)         │  │  (credentials)   │
│                     │  └──────────────────┘
│  ┌───────────────┐  │
│  │  Route Layer  │  │
│  │  (Hono routers)│  │
│  └──────┬────────┘  │
│         │           │
│  ┌──────▼────────┐  │
│  │  Adapter      │  │
│  │  Factory      │  │
│  └──────┬────────┘  │
│         │           │
│  ┌──────▼────────┐  │
│  │  DB Adapters  │  │
│  │  (12 engines) │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │  SQLite Meta  │  │
│  │  (better-sqlite3)│
│  └───────────────┘  │
└─────────────────────┘
```

## Layers

### 1. Shared Contract (`packages/shared/src/`)

The single source of truth for cross-package types. Both the sidecar and desktop import from `@kamehadb/shared`.

- `schemas.ts` — Zod schemas for connection profiles, AI settings, SQL types
- `types.ts` — Shared TypeScript types (WorkspaceTab, AppStoreState, SqlAdapter contract, etc.)
- `schema-tools.ts` — Schema diff/term expansion utilities
- `constants.ts` — Shared constants (DB kinds, etc.)
- `term-expansion.ts` — SQL term expansion logic

**Rule:** If frontend and backend disagree on data shape, fix `packages/shared` first.

### 2. Sidecar Backend (`apps/sidecar/src/`)

#### Entry Point (`index.ts`)

- Creates Hono app with CORS and request logging middleware
- Mounts route groups: `/connections`, `/sql`, `/mongo`, `/redis`, `/qdrant`, `/tigerbeetle`, `/ai`, `/query-history`
- Initializes metadata SQLite store
- Starts server on `127.0.0.1:3170` (configurable via `PORT` env)
- Prints `KAMEHADB_SIDECAR_PORT=<port>` for Tauri to parse
- Background schema indexing on startup

#### Route Layer (`routes/`)

Each route file defines a Hono router with Zod validation:

| File               | Routes                                                                 | Key Responsibilities                                |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `connections.ts`   | CRUD connections, health checks, file DB backup/restore                | Profile persistence, password retrieval via keyring |
| `sql.ts`           | Query execution, schema browsing, preview rows, autocomplete, PG stats | Delegates to adapter factory                        |
| `sql-schema.ts`    | Schema timeline, diff, migration                                       | Snapshot management                                 |
| `mongo.ts`         | MongoDB CRUD, stats, shell management                                  | mongosh lifecycle                                   |
| `redis.ts`         | Key scanning, value lookup, TTL                                        | Redis adapter                                       |
| `qdrant.ts`        | Collections, points, search, recommend, stats                          | Qdrant adapter                                      |
| `tigerbeetle.ts`   | Accounts, balances, transfers                                          | TigerBeetle adapter                                 |
| `ai.ts`            | AI settings, chat, schema cache, history                               | Provider abstraction                                |
| `query-history.ts` | Saved SQL history and favorites                                        | Metadata store                                      |

#### Adapter Factory (`adapters/factory.ts`)

Central factory that maps `ConnectionProfile.kind` → concrete adapter:

- `createSqlAdapter()` — returns `SqlAdapter` for SQL engines (postgres, mysql, mariadb, sqlite, sqlserver, oracle, clickhouse, duckdb)
- `createMongoDbAdapter()` — returns MongoDB adapter
- `createRedisDbAdapter()` — returns Redis adapter
- `createQdrantDbAdapter()` — returns Qdrant adapter
- `createTigerBeetleDbAdapter()` — returns TigerBeetle adapter

Each adapter implements the `SqlAdapter` or dedicated interface from `@kamehadb/shared`.

#### AI Layer (`ai/`)

- `provider.ts` — Provider abstraction (OpenAI, Anthropic, etc.)
- `schema-context.ts` — Generates schema-aware context for AI chat
- `indexer.ts` — Proactive schema indexing for all SQL connections
- `vec-store.ts` — Vector store using `sqlite-vec` for semantic search

#### Lib (`lib/`)

- `logger.ts` — Shared pino logger (multistream: stdout + file)
- `cache.ts` — LRU cache for schema/metadata results
- `mongosh.ts` — mongosh binary resolver/installer
- `sql-safety.ts` — SQL safety helpers (not found in lib/ but referenced in AGENTS.md)
- `schema-diff.ts` — Schema diff computation
- `schema-migration.ts` — Migration SQL generation
- `postgres-vector-sql.ts` — pgvector SQL helpers
- `file-database-maintenance.ts` — SQLite/DuckDB file backup/restore
- `route-utils.ts` — Shared route helpers
- `constants.ts` — Sidecar constants

### 3. Desktop Frontend (`apps/desktop/src/`)

#### Entry Point (`App.tsx`)

- Top-level view switch: `workspace`, `api-settings`, `logs`
- Theme management (light/dark/system)
- Global search, shortcuts dialog
- Sidebar + main layout

#### State Management (`store/`)

- `state.ts` — TanStack Store with `AppStoreState` (active connection, tabs, theme, sidebar, etc.)
- `workspace-tabs.ts` — Tab lifecycle (open, close, navigate) with localStorage persistence
- `ui-preferences.ts` — UI preference state
- `index.ts` — Re-exports

**Tab types:** `query`, `table`, `graph`, `mongo`, `mongo-query`, `mongo-shell`, `redis`, `redis-query`, `qdrant`, `qdrant-search`, `qdrant-graph`, `qdrant-stats`, `postgres-psql`, `postgres-vector-search`, `postgres-vector-map`, `sqlite-vec-search`, `sqlite-vec-map`, `schema-timeline`, `schema-diff`, `migration`, `database-stats`, `table-stats`, `tigerbeetle`

#### Data Hooks (`hooks/`)

TanStack Query-based hooks for each data domain:

- `use-connections.ts` — Connection CRUD + health
- `use-query.ts` — SQL query execution
- `use-schema.ts` — Schema browsing
- `use-mongo.ts`, `use-redis.ts`, `use-qdrant.ts`, `use-tigerbeetle.ts` — NoSQL engine hooks
- `use-chat.ts`, `use-ai-chat.ts` — AI chat
- `use-query-history.ts` — Saved queries
- `use-postgres-tool-job.ts` — PG backup/restore job tracking
- `use-terminal-session.ts` — xterm.js terminal sessions
- `use-column-resize.ts`, `use-field-visibility.ts` — UI utility hooks

#### API Client (`lib/`)

- `api-client.ts` — Base fetch wrapper with error handling
- `api.ts` — Typed API methods matching sidecar routes
- `query-keys.ts` — TanStack Query key factory
- `tauri.ts` — Tauri IPC bridge
- `app-logs.ts` — Frontend error → Tauri log forwarding
- `sql-autocomplete.ts` — Client-side SQL completion
- `mongo-autocomplete.ts` — Client-side MongoDB completion
- `constants.ts` — Frontend constants (DB kind metadata, SQL helpers)

#### Components (`components/`)

88 component files organized by feature area:

- **Workspace orchestration:** `workspace-screen.tsx`, `workspace-tab-bar.tsx`, `workspace-content.tsx`
- **SQL:** `sql-editor.tsx` (Monaco), `table-view.tsx`, `data-table.tsx`, `chart-view.tsx`
- **Schema:** `schema-tree.tsx`, `schema-graph.tsx`, `schema-timeline.tsx`, `schema-diff-view.tsx`, `migration-assistant.tsx`
- **PostgreSQL tools:** `postgres-psql-tab.tsx`, `postgres-backup-dialog.tsx`, `postgres-restore-dialog.tsx`, `database-stats.tsx`, `table-stats.tsx`, `postgres-vector-map.tsx`, `vector-query.tsx`
- **MongoDB:** `mongo-view.tsx`, `mongo-query.tsx`, `mongo-shell.tsx`, `mongo-explorer.tsx`
- **Redis:** `redis-view.tsx`, `redis-query.tsx`, `redis-explorer.tsx`
- **Qdrant:** `qdrant-view.tsx`, `qdrant-query.tsx`, `qdrant-vector-map.tsx`, `qdrant-stats.tsx`
- **TigerBeetle:** `tigerbeetle-explorer.tsx`
- **AI:** `ai-chat-panel.tsx`, `api-settings-page.tsx`, `chat-input.tsx`
- **Logs:** `logs-page.tsx`
- **Sidebar:** `sidebar.tsx` + sub-components
- **UI primitives:** `ui/` directory (shadcn/ui components)

### 4. Tauri Native Layer (`apps/desktop/src-tauri/src/`)

- `main.rs` — Entry point
- `lib.rs` — Tauri command registration, sidecar process management
- `app_logs.rs` — Log management (`read_app_logs`, `append_tauri_log`, sidecar log parsing)
- `postgres_psql/` — Embedded psql shell
- `postgres_tools/` — Backup/restore job management
- `terminal_sessions/` — PTY session management (for mongo shell, psql)

### 5. Landing Site (`landing/`)

Separate Next.js 16 app, not part of pnpm workspace. Marketing/docs site only.

## Data Flow

### Query Execution Flow

```
User types SQL in Monaco editor
  → use-query.ts (TanStack Query)
  → api.ts → api-client.ts (fetch)
  → POST /sql/execute
  → sql.ts route → adapter factory → postgres adapter
  → pg driver → PostgreSQL
  → Results back through the chain
  → Rendered in data-table.tsx
```

### Schema Browsing Flow

```
User expands connection in sidebar
  → use-schema.ts → GET /sql/schema
  → sql.ts route → adapter.schema()
  → Cached in lib/cache.ts (LRU)
  → Rendered in schema-tree.tsx
```

### AI Chat Flow

```
User sends chat message
  → use-chat.ts → POST /ai/chat
  → ai.ts route → provider.ts
  → schema-context.ts generates context from indexed schemas
  → AI provider API (OpenAI/Anthropic/etc.)
  → Response streamed back
  → Rendered in ai-chat-panel.tsx
  → History persisted in metadata SQLite
```

## Key Abstractions

- **`SqlAdapter`** (in `@kamehadb/shared`) — Common interface for all SQL engines: `query()`, `schema()`, `tablePreview()`, `tableStats()`, etc.
- **`ConnectionProfile`** — Zod-validated connection config, shared between FE and BE
- **`WorkspaceTab`** — Discriminated union for tab types, drives `WorkspaceContent` rendering
- **Adapter Factory** — Single entry point for creating adapters from `ConnectionProfile.kind`

## Entry Points

| Entry Point       | File                                 | Purpose                       |
| ----------------- | ------------------------------------ | ----------------------------- |
| Sidecar server    | `apps/sidecar/src/index.ts`          | HTTP server on 127.0.0.1:3170 |
| Desktop app       | `apps/desktop/src/main.tsx`          | React root                    |
| Desktop app shell | `apps/desktop/src/App.tsx`           | Top-level views + layout      |
| Tauri native      | `apps/desktop/src-tauri/src/main.rs` | Rust entry → `lib.rs`         |
| Landing           | `landing/src/app/`                   | Next.js app router            |
