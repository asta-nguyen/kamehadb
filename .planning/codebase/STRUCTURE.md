---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: arch
---

# Directory Structure

## Root Layout

```
kamehadb/
├── apps/
│   ├── desktop/              # Tauri v2 + React 19 desktop app
│   ├── sidecar/              # Hono HTTP server + DB adapters
│   └── mcp-server/           # MCP server (dist + node_modules only)
├── packages/
│   ├── shared/               # Shared Zod schemas, types, contracts
│   └── ui/                   # Shared UI utilities (empty)
├── landing/                  # Separate Next.js marketing site
├── docker-init/              # Seed SQL/JS for dev databases
├── .github/workflows/        # CI (ci.yml, release.yml)
├── .husky/                   # Git hooks
├── .vscode/                  # Editor config
├── .windsurf/                # GSD Core workflows + agents (local install)
├── plans/                    # Project plan files
├── docker-compose.yml        # Local dev databases
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # Workspace definition
├── pnpm-lock.yaml            # Lockfile
├── .nvmrc                    # Node v22
├── .prettierrc               # Formatting
├── .prettierignore
├── commitlint.config.cjs     # Conventional commits
├── AGENTS.md                 # Agent instructions
├── CLAUDE.md                 # Claude-specific instructions
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── LICENSE                   # Apache-2.0
```

## Sidecar (`apps/sidecar/src/`)

```
src/
├── index.ts                  # Hono app setup, route mounting, server start
├── adapters/
│   ├── factory.ts            # Adapter factory (kind → adapter)
│   ├── postgres.ts           # PostgreSQL adapter (largest, 27KB)
│   ├── mysql.ts              # MySQL/MariaDB adapter
│   ├── sqlite.ts             # SQLite adapter
│   ├── sqlserver.ts          # SQL Server adapter
│   ├── oracle.ts             # Oracle adapter
│   ├── clickhouse.ts         # ClickHouse adapter
│   ├── duckdb.ts             # DuckDB adapter
│   ├── mongodb.ts            # MongoDB adapter
│   ├── redis.ts              # Redis adapter
│   ├── qdrant.ts             # Qdrant adapter
│   └── tigerbeetle.ts        # TigerBeetle adapter
├── routes/
│   ├── connections.ts        # Connection CRUD, health, file DB backup/restore
│   ├── sql.ts                # SQL query, schema, preview, autocomplete (33KB)
│   ├── sql-schema.ts         # Schema timeline, diff, migration
│   ├── mongo.ts              # MongoDB routes + mongosh lifecycle
│   ├── redis.ts              # Redis routes
│   ├── qdrant.ts             # Qdrant routes
│   ├── tigerbeetle.ts        # TigerBeetle routes
│   ├── ai.ts                 # AI settings, chat, schema cache (23KB)
│   └── query-history.ts      # Saved SQL history/favorites
├── ai/
│   ├── provider.ts           # AI provider abstraction
│   ├── schema-context.ts     # Schema-aware context generation
│   ├── indexer.ts            # Proactive schema indexing
│   └── vec-store.ts          # sqlite-vec vector store
├── db/
│   └── metadata-store.ts     # SQLite metadata persistence
├── lib/
│   ├── logger.ts             # Pino logger (shared)
│   ├── cache.ts              # LRU cache
│   ├── constants.ts          # Sidecar constants
│   ├── mongosh.ts            # mongosh binary resolver/installer
│   ├── route-utils.ts        # Shared route helpers
│   ├── schema-diff.ts        # Schema diff computation
│   ├── schema-migration.ts   # Migration SQL generation
│   ├── postgres-vector-sql.ts # pgvector SQL helpers
│   ├── file-database-maintenance.ts # SQLite/DuckDB backup/restore
│   └── sql-safety.ts         # SQL safety helpers
└── scripts/
    └── seed-tigerbeetle.ts   # TigerBeetle seed script
```

## Desktop (`apps/desktop/src/`)

```
src/
├── main.tsx                  # React root
├── App.tsx                   # Top-level app shell
├── App.css                   # App-level styles
├── index.css                 # Global styles (Tailwind)
├── vite-env.d.ts             # Vite type declarations
├── store/
│   ├── index.ts              # Re-exports
│   ├── state.ts              # TanStack Store (AppStoreState)
│   ├── workspace-tabs.ts     # Tab lifecycle management
│   └── ui-preferences.ts     # UI preference state
├── hooks/                    # TanStack Query hooks (19 files)
│   ├── use-connections.ts
│   ├── use-query.ts
│   ├── use-schema.ts
│   ├── use-mongo.ts
│   ├── use-redis.ts
│   ├── use-qdrant.ts
│   ├── use-tigerbeetle.ts
│   ├── use-chat.ts
│   ├── use-ai-chat.ts
│   ├── use-query-history.ts
│   ├── use-postgres-tool-job.ts
│   ├── use-postgres-vector.ts
│   ├── use-sqlite-vec.ts
│   ├── use-terminal-session.ts
│   ├── use-column-resize.ts
│   ├── use-field-visibility.ts
│   ├── use-file-database-maintenance.ts
│   ├── use-redis-command.ts
│   └── use-schema-changelog.ts
├── lib/                      # Utilities and API (22 files)
│   ├── api.ts                # Typed API methods
│   ├── api-client.ts         # Fetch wrapper
│   ├── query-keys.ts         # TanStack Query keys
│   ├── tauri.ts              # Tauri IPC bridge
│   ├── app-logs.ts           # Frontend → Tauri log forwarding
│   ├── types.ts              # WorkspaceTab + local types
│   ├── constants.ts          # DB kind metadata, SQL helpers
│   ├── utils.ts              # General utilities
│   ├── sql-autocomplete.ts   # SQL completion
│   ├── mongo-autocomplete.ts # MongoDB completion
│   ├── export.ts             # Data export
│   ├── format-json.tsx       # JSON formatting
│   ├── postgres-maintenance.ts
│   ├── postgres-psql.ts
│   ├── postgres-vector.ts
│   ├── file-database-maintenance.ts
│   ├── table-editability.ts
│   ├── ai-chat-helpers.ts
│   ├── mongo-autocomplete.ts
│   ├── pca3d.ts              # 3D PCA for vector maps
│   ├── simple-embed.ts       # Simple embedding
│   ├── terminal-session.ts
│   └── terminal-session-state.ts
├── components/               # 88 component files + ui/
│   ├── ui/                   # shadcn/ui primitives (20 files)
│   ├── sidebar.tsx           # Connection + schema navigation
│   ├── workspace-screen.tsx  # Main layout
│   ├── workspace-tab-bar.tsx # Tab bar
│   ├── workspace-content.tsx # Tab content router
│   ├── sql-editor.tsx        # Monaco SQL editor (38KB)
│   ├── table-view.tsx        # Table data browser
│   ├── data-table.tsx        # Reusable data table
│   ├── chart-view.tsx        # Chart visualization
│   ├── schema-tree.tsx       # Schema tree in sidebar
│   ├── schema-graph.tsx      # ER diagram (xyflow)
│   ├── schema-timeline.tsx   # Schema change timeline
│   ├── schema-diff-view.tsx  # Schema diff comparison
│   ├── migration-assistant.tsx
│   ├── database-stats.tsx    # PostgreSQL DB stats
│   ├── table-stats.tsx       # PostgreSQL table stats
│   ├── postgres-psql-tab.tsx # Embedded psql
│   ├── postgres-backup-dialog.tsx
│   ├── postgres-restore-dialog.tsx
│   ├── postgres-vector-map.tsx
│   ├── vector-query.tsx      # pgvector search
│   ├── vector-map-3d.tsx     # 3D vector visualization
│   ├── mongo-view.tsx        # MongoDB explorer
│   ├── mongo-query.tsx       # MongoDB aggregation
│   ├── mongo-shell.tsx       # Embedded mongosh
│   ├── redis-view.tsx        # Redis explorer
│   ├── redis-query.tsx       # Redis command runner
│   ├── qdrant-view.tsx       # Qdrant explorer
│   ├── qdrant-query.tsx      # Qdrant search
│   ├── qdrant-vector-map.tsx # 3D Qdrant map
│   ├── qdrant-stats.tsx
│   ├── tigerbeetle-explorer.tsx
│   ├── ai-chat-panel.tsx     # AI chat (25KB)
│   ├── api-settings-page.tsx # AI provider settings
│   ├── logs-page.tsx         # In-app log viewer
│   ├── query-history-panel.tsx
│   ├── global-search.tsx
│   ├── shortcuts-dialog.tsx
│   ├── error-boundary.tsx
│   ├── terminal-pane.tsx     # xterm.js terminal
│   └── ... (sidebar sub-components, dialogs, etc.)
└── src-tauri/                # Rust native layer
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── src/
    │   ├── main.rs           # Entry
    │   ├── lib.rs            # Command registration, sidecar management
    │   ├── app_logs.rs       # Log management
    │   ├── postgres_psql/    # psql shell management
    │   ├── postgres_tools/   # Backup/restore jobs
    │   └── terminal_sessions/ # PTY sessions
    └── icons/
```

## Shared (`packages/shared/src/`)

```
src/
├── index.ts                  # Re-exports all
├── schemas.ts                # Zod schemas (connections, AI, SQL)
├── types.ts                  # Shared TypeScript types
├── schema-tools.ts           # Schema diff utilities
├── term-expansion.ts         # SQL term expansion (15KB)
└── constants.ts              # Shared constants
```

## Landing (`landing/src/`)

```
src/
├── app/                      # Next.js app router (9 items)
├── components/               # Marketing components (5 items)
└── lib/                      # Utilities (2 items)
```

## Docker Init (`docker-init/`)

```
docker-init/
├── postgres/                 # Seed SQL
├── mysql/                    # Seed SQL
├── mariadb/                  # Seed SQL
├── mongodb/                  # Seed JS
├── redis/                    # Seed data
├── clickhouse/               # Seed SQL
└── duckdb/                   # Seed SQL
```

## Naming Conventions

- **Files:** kebab-case for all `.ts`/`.tsx` files (e.g., `sql-editor.tsx`, `metadata-store.ts`)
- **Components:** PascalCase named exports (e.g., `SqlEditor`, `WorkspaceContent`)
- **Hooks:** `use-*.ts` prefix (e.g., `use-connections.ts`)
- **Adapters:** Engine name in lowercase (e.g., `postgres.ts`, `mongodb.ts`)
- **Routes:** Engine/domain name (e.g., `sql.ts`, `connections.ts`)
- **Rust files:** snake_case (e.g., `app_logs.rs`, `main.rs`)
- **Path alias:** `@/` maps to `apps/desktop/src/` in desktop package
