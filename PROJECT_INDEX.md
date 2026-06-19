# Project Index: KamehaDB

Generated: 2026-06-17

## Project Structure

```
kamehadb/                           # pnpm workspace monorepo
├── apps/
│   ├── desktop/                    # Tauri v2 + React 19 desktop app (Vite)
│   │   ├── src/                    # 81 TSX/TS source files
│   │   │   ├── components/         # 45 React components (UI + feature modules)
│   │   │   ├── hooks/              # 16 custom hooks (TanStack Query)
│   │   │   ├── lib/                # 17 utility modules + __tests__/
│   │   │   ├── store/              # TanStack Store state management
│   │   │   ├── App.tsx             # Root app component
│   │   │   └── main.tsx            # Vite entry point
│   │   └── src-tauri/              # 10 Rust source files
│   │       └── src/                # Tauri commands, PTY, PSQL
│   └── sidecar/                    # Hono HTTP server (Node.js)
│       └── src/
│           ├── adapters/           # 9 DB adapters (PostgreSQL, MySQL, etc.)
│           ├── ai/                 # AI provider, schema indexing, Qdrant store
│           ├── db/                 # SQLite metadata store (better-sqlite3)
│           ├── lib/                # Cache, schema diff, migrations, vector SQL
│           ├── routes/             # 9 route modules (connections, SQL, mongo, redis, etc.)
│           └── index.ts            # Server entry point (port 3170)
├── packages/
│   ├── shared/                     # Shared Zod schemas, types, utils
│   └── ui/                         # Shared UI utilities (tailwind-merge + clsx)
├── landing/                        # Next.js marketing site (separate npm project)
│   └── src/
│       ├── app/                    # Pages + layout with OG/Twitter metadata
│       └── components/             # Home view, panels, UI primitives
├── docker-compose.yml              # Dev databases (10 services)
├── docker-init/                    # Seed SQL for PostgreSQL, MySQL, MariaDB
└── scripts/                        # (empty, no indexable files found)
```

## Entry Points

- **Desktop app**: `apps/desktop/src/main.tsx` — Vite + React entry, mounts `<App />` with TanStack Query client
- **Desktop (Tauri)**: `apps/desktop/src-tauri/src/main.rs` — `lib.rs` starts sidecar process, exposes `start_sidecar`, `get_app_data_dir`, Tauri PTY/PSQL/tool commands
- **Sidecar API server**: `apps/sidecar/src/index.ts` — Hono server on `127.0.0.1:3170`, prints `KAMEHADB_SIDECAR_PORT=<port>` on startup
- **Shared contract**: `packages/shared/src/index.ts` — single-file source of truth for connection profiles, DB kinds, query types, AI types, adapter contracts
- **Landing site**: `landing/src/app/page.tsx` → `home-view.tsx` — hero, feature cards, Compare panel screenshots

## Core Modules

### apps/desktop — Frontend

- **`src/App.tsx`**: Root component — tabbed workspace routing, sidecar health polling, connection-level render delegation
- **`src/components/sidebar.tsx`**: Connection tree, schema browser, DB icon grouping, pin/favorite
- **`src/components/sql-editor.tsx`**: Monaco editor with autocomplete, query execution, results grid
- **`src/components/table-view.tsx`**: Row browser with column sorting, pagination, cell editing
- **`src/components/data-table.tsx`**: Generic virtualized data grid used by SQL, Mongo, Qdrant
- **`src/components/schema-graph.tsx`**: ER diagram renderer (React Flow + dagre)
- **`src/components/schema-tree.tsx`**: Tree view of schema objects (tables, views, indexes)
- **`src/components/schema-diff-view.tsx`**: Schema snapshot diff comparison UI
- **`src/components/schema-timeline.tsx`**: Schema change history timeline
- **`src/components/mongo-view.tsx`**: MongoDB explorer — collections, documents, indexes
- **`src/components/redis-view.tsx`**: Redis key browser with value inspection
- **`src/components/qdrant-view.tsx`**: Qdrant collection browser with vector search
- **`src/components/tigerbeetle-explorer.tsx`**: TigerBeetle accounts/transfers browser
- **`src/components/ai-chat-panel.tsx`**: AI chat with schema-aware context, provider selection
- **`src/components/database-stats.tsx`**: PostgreSQL database-level statistics
- **`src/components/table-stats.tsx`**: PostgreSQL table-level statistics and tuning
- **`src/components/postgres-vector-query.tsx`**: pgvector embedding search UI
- **`src/components/connection-dialog.tsx`**: Connection create/edit form with per-engine fields
- **`src/components/global-search.tsx`**: Cross-connection schema/table search
- **`src/components/terminal-pane.tsx`**: Tauri PTY terminal for mongosh, psql
- **`src/store/index.ts`** → `state.ts`, `ui-preferences.ts`, `workspace-tabs.ts`: TanStack Store app state
- **`src/hooks/`**: TanStack Query hooks — connections, schema, query execution, chat, mongo, redis, Qdrant, TigerBeetle, terminal sessions
- **`src/lib/api.ts`**: Sidecar API client functions
- **`src/lib/api-client.ts`**: Base HTTP client with JSON handling and error parsing
- **`src/lib/sql-autocomplete.ts`**: Monaco completion provider (keywords, schema objects, functions)
- **`src/lib/tauri.ts`**: Tauri invoke wrapper with error handling
- **`src/lib/constants.ts`**: DB engine categories, icon map, defaults — re-exports `SQL_KINDS`/`isSqlKind` from `@kamehadb/shared`

### apps/desktop/src-tauri — Tauri Rust Backend

- **`src/lib.rs`**: Sidecar lifecycle management, password storage (keyring), PSQL Tauri commands
- **`src/main.rs`**: Tauri app bootstrap
- **`src/mongo_pty.rs`**: Embedded mongosh via node-pty
- **`src/terminal_sessions/`**: Generic PTY session management
- **`src/postgres_psql/`**: Embedded psql via node-pty
- **`src/postgres_tools/`**: PostgreSQL backup/restore/maintenance job executor

### apps/sidecar — API Server

- **`src/index.ts`**: Hono app setup, CORS, error handling, route registration, metadata store init
- **`src/routes/connections.ts`**: CRUD for saved connection profiles, health checks
- **`src/routes/sql.ts`**: SQL query execution, preview rows, autocomplete, metadata queries
- **`src/routes/sql-schema.ts`**: Schema introspection (tables, columns, indexes, foreign keys, DDL)
- **`src/routes/mongo.ts`**: MongoDB database/collection listing, CRUD, stats, aggregation pipeline
- **`src/routes/redis.ts`**: Redis key scanning, value get/set, TTL, server info
- **`src/routes/ai.ts`**: AI provider CRUD, chat streaming, schema cache, chat history
- **`src/routes/qdrant.ts`**: Qdrant collection browsing, point CRUD, vector search
- **`src/routes/tigerbeetle.ts`**: Account/transfer lookup, balance queries
- **`src/routes/postgres-vector.ts`**: pgvector embedding storage and similarity search
- **`src/routes/query-history.ts`**: Query history CRUD
- **`src/adapters/factory.ts`**: Database adapter factory dispatching by `DbKind`
- **`src/adapters/postgres.ts`**, `mysql.ts`, `sqlite.ts`, `sqlserver.ts`, `oracle.ts`, `clickhouse.ts`, `duckdb.ts`, `mongodb.ts`, `redis.ts`, `qdrant.ts`, `tigerbeetle.ts`: DB-specific adapters
- **`src/ai/provider.ts`**: AI provider abstraction (OpenAI, Anthropic, etc.)
- **`src/ai/indexer.ts`**: Background schema indexing for AI context
- **`src/ai/qdrant-store.ts`**: Vector store (Qdrant) for schema embeddings
- **`src/ai/schema-context.ts`**: Generate schema context strings for AI prompts
- **`src/db/metadata-store.ts`**: SQLite persistence for connections, AI settings, chat history (better-sqlite3)
- **`src/lib/cache.ts`**: LRU cache for schema/metadata (lru-cache)
- **`src/lib/schema-diff.ts`**: Schema snapshot comparison logic
- **`src/lib/schema-migration.ts`**: Migration SQL generation from schema diffs

### packages/shared — Types & Contracts

- **`src/index.ts`** (695 lines, 77 symbols): All shared Zod schemas (`ConnectionProfileSchema`, `CreateConnectionProfileSchema`, query types, AI types), `DbKind` union, `SqlAdapter`/`RedisAdapter`/`QdrantAdapter` interfaces, `SQL_KINDS`, `isSqlKind` type guard, `isQuerySafe` guard
- **`src/schema-tools.ts`**: Schema snapshot types and comparison utilities
- **`src/term-expansion.ts`**: Terminal expansion utilities
- **`src/workspace-tabs.ts`**: Workspace tab discriminated union + `AppStoreState` type

### packages/ui — UI Primitives

- **`src/utils.ts`**: `cn()` — tailwind-merge + clsx utility
- **`src/index.ts`**: Re-exports

### landing — Marketing Site

- **`src/components/home-view.tsx`**: Hero section, engine carousel, feature cards, AI Compare panel
- **`src/components/panels.tsx`**: SQL/Chat/Qdrant panel screenshots display
- **`src/app/layout.tsx`**: Root layout with metadata, OG/Twitter tags

## Configuration

- `package.json` (root): pnpm workspace config, scripts, lint-staged, Prettier
- `tsconfig.json` (root + per-package): TypeScript ~5.8.3 configs
- `docker-compose.yml`: 10 database services for local dev
- `.github/workflows/release.yml`: Draft release → build platform bundles → upload assets
- `apps/desktop/vite.config.ts`: Vite + React + Tailwind v4
- `apps/desktop/src-tauri/Cargo.toml`: Tauri v2 Rust dependencies
- `apps/sidecar/tsconfig.json`: Node target for sidecar
- `landing/next.config.ts`: Next.js config
- `.prettierrc`: Prettier formatting rules
- `commitlint.config.ts`: Conventional commit enforcement

## Documentation

- `README.md`: Project overview, requirements, install guide, engine table
- `AGENTS.md`: Comprehensive dev guidelines — architecture, commands, coding standards
- `CHANGELOG.md`: Release history (Keep a Changelog format)
- `apps/AGENTS.md`: Sub-agent delegation patterns
- `apps/desktop/AGENTS.md`: Desktop-specific patterns
- `apps/sidecar/AGENTS.md`: Sidecar-specific patterns
- `packages/shared/AGENTS.md`: Shared package conventions

## Test Coverage

- **7 test files total** (Vitest):
  - `apps/desktop/src/lib/__tests__/ai-chat-helpers.test.ts`
  - `apps/desktop/src/lib/__tests__/pca3d.test.ts`
  - `apps/desktop/src/lib/__tests__/postgres-vector.test.ts`
  - `apps/desktop/src/lib/__tests__/sql-query-pagination.test.ts`
  - `apps/desktop/src/lib/__tests__/terminal-session-state.test.ts`
  - `apps/desktop/src/lib/__tests__/use-terminal-session.test.ts`
  - `apps/sidecar/src/lib/postgres-vector-sql.test.ts`
- Run with `pnpm test` (Vitest via desktop package)
- No CI-enforced coverage threshold
- No integration/E2E tests

## Key Dependencies

| Dependency                                  | Version      | Purpose                               |
| ------------------------------------------- | ------------ | ------------------------------------- |
| `@tauri-apps/api` / `@tauri-apps/cli`       | ^2           | Tauri v2 desktop framework            |
| `react` / `react-dom`                       | ^19.1        | UI framework                          |
| `hono`                                      | ^4           | HTTP server framework (sidecar)       |
| `@tanstack/react-query`                     | ^5           | Data fetching + caching               |
| `@tanstack/store` + `@tanstack/react-store` | ^0.7         | Reactive state management             |
| `@tanstack/react-table`                     | ^8           | Table/grid component                  |
| `@xyflow/react`                             | ^12          | ER diagram graph rendering            |
| `monaco-editor` / `@monaco-editor/react`    | ^0.52 / ^4.7 | SQL editor                            |
| `better-sqlite3`                            | ^11          | Local metadata SQLite (sidecar)       |
| `zod`                                       | ^3           | Schema validation (shared)            |
| `vitest`                                    | ^4           | Test runner (desktop)                 |
| `vite`                                      | ^7           | Bundler (desktop)                     |
| `tailwindcss` v4                            | ^4           | CSS framework                         |
| `shadcn/ui`                                 | shadcn ^4    | UI component primitives               |
| `lucide-react`                              | ^0.400       | Icons                                 |
| `recharts`                                  | ^3           | Charts                                |
| `ioredis`                                   | ^5           | Redis client (sidecar)                |
| `mongodb`                                   | ^7           | MongoDB driver (sidecar)              |
| `pg`                                        | ^8           | PostgreSQL driver (sidecar)           |
| `mysql2`                                    | ^3           | MySQL driver (sidecar)                |
| `mssql`                                     | ^12          | SQL Server driver (sidecar)           |
| `oracledb`                                  | ^7           | Oracle driver (sidecar)               |
| `duckdb`                                    | ^1.4         | DuckDB driver (sidecar)               |
| `tigerbeetle-node`                          | 0.17.4       | TigerBeetle client (sidecar)          |
| `@qdrant/js-client-rest`                    | ^1.18        | Qdrant client (sidecar + desktop)     |
| `@clickhouse/client`                        | ^1.20        | ClickHouse client (sidecar)           |
| `xterm` / `@xterm/addon-fit`                | ^6 / ^0.11   | Terminal emulator (desktop)           |
| `node-pty`                                  | ^1.1         | PTY for mongosh/psql (sidecar)        |
| `three`                                     | ^0.184       | 3D vector map visualization (desktop) |

## Quick Start

1. **Install**: `pnpm install`
2. **Start databases**: `docker compose up -d`
3. **Run dev**: `pnpm dev` (sidecar + desktop concurrently)
4. **Typecheck**: `pnpm typecheck`
5. **Test**: `pnpm test`
6. **Build**: `pnpm build` (sidecar build → desktop build)
7. **Tauri build**: `pnpm tauri build` (release bundle)
8. **Landing site**: `npm --prefix landing run dev`
