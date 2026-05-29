# AGENTS.md

This file provides guidance for coding agents working in this repository.

## Project Overview

KamehaDB is a local-first database GUI centered on a Tauri desktop app plus a local Node sidecar. The current app supports PostgreSQL, MySQL, SQLite, MongoDB, and Redis. It includes schema browsing, a Monaco SQL editor, PostgreSQL stats views, Redis and Mongo explorers, and an AI chat panel with schema-aware context.

There is also a separate marketing/docs site in `landing/`, but it is not part of the pnpm workspace used by the desktop app and sidecar.

## Repository Layout

```text
├── apps/
│   ├── desktop/          # Tauri v2 + React 19 desktop app
│   └── sidecar/          # Hono HTTP server + DB adapters + metadata SQLite
├── packages/
│   ├── shared/           # Shared Zod schemas, app state types, adapter contracts
│   └── ui/               # Shared UI utilities/components
├── landing/              # Separate Next.js marketing site (not in pnpm workspace)
├── docker-compose.yml    # Local dev databases
└── docker-init/          # Seed SQL for Postgres/MySQL/MariaDB
```

## Workspace And Package Boundaries

- The pnpm workspace includes only `apps/*` and `packages/*`.
- `landing/` has its own `package-lock.json` and is managed separately with npm.
- Root scripts target the pnpm workspace only. Do not assume they affect `landing/`.

## Commands

### Workspace root

```bash
# Install workspace dependencies
pnpm install

# Start dev databases
docker compose up -d

# Run sidecar + desktop together
pnpm dev

# Run only the desktop app
pnpm dev:desktop

# Run only the sidecar
pnpm dev:sidecar

# Build shared -> sidecar -> desktop
pnpm build

# Typecheck all workspace packages
pnpm typecheck

# Lint all workspace packages that expose a lint script
pnpm lint

# Run all workspace package tests that expose a test script
pnpm test

# Run Tauri CLI in the desktop package
pnpm tauri
```

### Important package-level scripts

```bash
# Desktop app
pnpm --filter @kamehadb/desktop dev
pnpm --filter @kamehadb/desktop build
pnpm --filter @kamehadb/desktop test
pnpm --filter @kamehadb/desktop tauri build

# Sidecar
pnpm --filter @kamehadb/sidecar dev
pnpm --filter @kamehadb/sidecar build
pnpm --filter @kamehadb/sidecar start

# Landing site (separate project)
cd landing
npm install
npm run dev
npm run build
npm run lint
```

## Current Architecture

### Shared contract

`packages/shared/src/index.ts` is the source of truth for:

- Connection profile schemas and validation
- SQL, Redis, MongoDB, and AI-related types
- App store state and workspace tab types
- `SqlAdapter` and related contracts

If frontend and backend disagree on data shape, fix `packages/shared` first.

### Sidecar

`apps/sidecar/src/index.ts` starts a Hono server on `127.0.0.1`, default port `3170`.

Key details:

- Metadata is stored in a local SQLite database via `better-sqlite3`
- Default metadata DB path is `./kamehadb.db`
- If `KAMEHADB_DATA_DIR` is set, the DB path becomes `${KAMEHADB_DATA_DIR}/kamehadb.db`
- The sidecar prints `KAMEHADB_SIDECAR_PORT=<port>` on startup

Current route groups:

- `/connections` for saved connection profiles and connection health checks
- `/sql` for SQL metadata, query execution, preview rows, autocomplete, and PostgreSQL stats
- `/mongo` for MongoDB databases, collections, documents, stats, update/delete
- `/redis` for key scanning, value lookup, TTL lookup, and connection testing
- `/ai` for provider settings, chat, schema cache, and chat history

Important sidecar internals:

- `apps/sidecar/src/db/metadata-store.ts` persists connections, AI settings, and chat history
- `apps/sidecar/src/lib/cache.ts` caches schema and metadata results
- `apps/sidecar/src/lib/sql-safety.ts` contains SQL safety helpers used by the backend
- `apps/sidecar/src/ai/` contains provider abstraction and schema-context generation

### Desktop app

`apps/desktop/src/App.tsx` drives a tabbed workspace with connection-specific views.

Main areas:

- `components/sidebar.tsx` for connection and schema navigation
- `components/sql-editor.tsx` for Monaco query editing and execution
- `components/table-view.tsx` for SQL table browsing
- `components/schema-graph.tsx` for ER diagrams
- `components/database-stats.tsx` and `components/table-stats.tsx` for PostgreSQL metrics
- `components/mongo-view.tsx` and `components/redis-view.tsx` for non-SQL engines
- `components/ai-chat-panel.tsx` and `components/api-settings-page.tsx` for AI

State and data flow:

- `apps/desktop/src/store/index.ts` uses TanStack Store for workspace state
- `apps/desktop/src/hooks/` contains TanStack Query-based data hooks
- `apps/desktop/src/lib/api.ts` talks to the sidecar at `http://127.0.0.1:3170` by default
- `apps/desktop/src/lib/sql-autocomplete.ts` contains client-side SQL completion logic

## Database Support

Supported now:

- PostgreSQL
- MySQL
- SQLite
- MongoDB
- Redis

Notes:

- PostgreSQL has the richest stats support
- MySQL and SQLite go through the SQL adapter path
- MongoDB uses a dedicated route and adapter flow
- Redis uses a dedicated route and adapter flow, not the SQL route

## Connection Defaults For Docker

| Engine     | Port | User   | Password | Database |
| ---------- | ---- | ------ | -------- | -------- |
| PostgreSQL | 5432 | kameha | kameha   | kamehadb |
| MySQL      | 3306 | kameha | kameha   | kamehadb |
| MariaDB    | 3307 | kameha | kameha   | kamehadb |
| Redis      | 6379 | —      | —        | —        |

## Testing And Verification

- `pnpm test` currently depends mainly on workspace packages that expose a `test` script
- The desktop package uses `vitest run`
- CI currently runs `pnpm typecheck`, `pnpm --filter @kamehadb/desktop test`, `pnpm build`, and a full `tauri build`
- When changing sidecar contracts, verify both `packages/shared` types and desktop usage
- When changing desktop UI behavior, prefer running the desktop tests and a targeted app build

## Release Workflow

The checked-in GitHub workflow is `.github/workflows/release.yml`.

Key facts:

- Releases are triggered by tags matching `v*`
- `workflow_dispatch` expects an existing tag input
- The workflow creates a draft GitHub release, then builds platform bundles, then uploads assets
- Expected uploaded assets are `.dmg`, `.exe`, `.msi`, `.deb`, `.AppImage`, and `.rpm`
- GitHub still adds source archives automatically; those are not the installable app bundles

Typical release flow:

```bash
git push origin <branch>
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

If a release is missing app bundles, inspect `.github/workflows/release.yml` and verify the tag points at the intended commit.

## Agent Notes

- Prefer `rg` for search and `pnpm --filter ...` for targeted package commands.
- Do not assume `landing/` is part of the pnpm workspace.
- Do not assume the sidecar runs on `localhost:3001`; the current default is `127.0.0.1:3170`.
- Keep shared type changes in `packages/shared` synchronized with both sidecar routes and desktop hooks/components.
- Redis and MongoDB are already implemented; do not treat them as future work unless the specific feature is actually missing.
