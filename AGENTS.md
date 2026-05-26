# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KamehaDB is a local-first, cross-platform database GUI built with Tauri, React, and Node.js. It connects to PostgreSQL, MySQL, SQLite, Redis (planned), and MongoDB — letting you browse schemas, run queries, and visualize relationships in a desktop app.

## Commands

```bash
# Install dependencies
pnpm install

# Run dev services (PostgreSQL, MySQL, MariaDB, Redis)
docker compose up -d

# Run both sidecar and desktop in dev mode
pnpm dev

# Run only desktop (requires sidecar running separately)
pnpm dev:desktop

# Run only sidecar backend
pnpm dev:sidecar

# Build all packages (order: shared → sidecar → desktop)
pnpm build

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run tests
pnpm test

# Build Tauri desktop app
pnpm tauri build
```

## Release Workflow

The GitHub release pipeline builds desktop installers and uploads them to the GitHub Release assets. The default `Source code (zip)` and `Source code (tar.gz)` entries are added by GitHub automatically and are not installable app bundles.

```bash
git tag -d v0.1.0-rc.1
git push origin :refs/tags/v0.1.0-rc.1
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

## Architecture

```
├── apps/
│   ├── desktop/          # Tauri + React frontend (Vite, Tailwind)
│   └── sidecar/          # Node.js backend (Hono + database adapters)
├── packages/
│   ├── shared/           # Zod schemas + TypeScript types for contracts
│   └── ui/               # Shared React UI primitives
└── docker-compose.yml    # Dev databases (Postgres, MySQL, Redis)
```

### Shared Package (`packages/shared/src/index.ts`)

This is the core contract between frontend and backend. It contains:

- Zod schemas for connection profiles and validation
- `SqlAdapter`, `RedisAdapter`, `MongoAdapter` interfaces defining the API contract
- TypeScript types for query results, table metadata, AI chat, etc.

### Sidecar Backend (`apps/sidecar/src`)

Hono-based HTTP server that implements database adapters:

- `adapters/` — Database-specific implementations (postgres.ts, mysql.ts, sqlite.ts, mongodb.ts)
- `routes/` — API endpoints (connections.ts, sql.ts, ai.ts, mongo.ts)
- `db/` — Local SQLite for storing connection profiles and credentials

### Desktop App (`apps/desktop/src`)

React frontend with Tauri shell:

- `components/` — Main UI components (table-view.tsx, sql-editor.tsx, schema-graph.tsx, ai-chat-panel.tsx, etc.)
- `components/ui/` — shadcn/ui component library
- `hooks/` — React hooks for state management
- `store/` — TanStack Store for app state
- `lib/` — Utilities and API client

### Communication Pattern

Desktop communicates with sidecar via fetch to `localhost:3001`:

- TanStack Query for data fetching and caching
- Direct Tauri commands for credential encryption/storage

### Database Adapters

Each adapter implements the `SqlAdapter` interface:

```typescript
interface SqlAdapter {
  testConnection(): Promise<TestConnectionResult>;
  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database?: string): Promise<SchemaInfo[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  getTableColumns(tableId: string): Promise<ColumnInfo[]>;
  getTableIndexes(tableId: string): Promise<IndexInfo[]>;
  previewRows(input: PreviewRowsInput): Promise<QueryResult>;
  runQuery(input: RunQueryInput): Promise<QueryResult>;
  close(): Promise<void>;
}
```

PostgreSQL adapter provides extended stats methods (`getIndexStats`, `getTableStats`, `getDatabaseSizes`, `getActiveConnections`).

## Connection Defaults (Docker)

| Engine     | Port | User   | Password | Database |
| ---------- | ---- | ------ | -------- | -------- |
| PostgreSQL | 5432 | kameha | kameha   | kamehadb |
| MySQL      | 3306 | kameha | kameha   | kamehadb |
| MariaDB    | 3307 | kameha | kameha   | kamehadb |
| Redis      | 6379 | —      | —        | —        |

## Tech Stack

- **Desktop**: Tauri v2, React 19, Vite, Tailwind CSS v4, shadcn/ui, tanstack
- **Editor**: Monaco (via @monaco-editor/react)
- **Sidecar**: Hono, pg, mysql2, better-sqlite3
- **Graph**: ReactFlow + dagre for ER diagrams
- **AI**: Multi-provider abstraction (OpenAI, Ollama, 9Router)
