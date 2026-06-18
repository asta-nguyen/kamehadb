# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- PostgreSQL schema diff workflow for comparing captured schema snapshots in a dedicated diff view, with grouped table/column/index changes and direct snapshot capture from the compare screen.
- MCP server support.
- **PostgreSQL pgvector guided search** — PostgreSQL connections with pgvector now expose a dedicated `Vector Search` flow with capability detection, text/raw/similar query modes, filter support, distance metrics, row details, and row-level `Find similar` actions.
- **PostgreSQL pgvector map** — pgvector search results can open a sampled PCA map tab to inspect vector neighborhoods visually.
- **PostgreSQL vector metadata in the UI** — schema browsing and PostgreSQL stats now mark vector columns and surface pgvector index methods/operators.

### Added

- Embedded mongosh terminal — open an interactive mongosh session directly inside the Mongo explorer tab. Supports full PTY (node-pty), ANSI colors, terminal resize, and session persistence across tab navigation. ([@JoeJoeflyn])
- Add base OpenCode agent instructions (`.opencode/AGENTS.md`) and repository AGENTS.md.
- **PostgreSQL psql tool** — open an interactive psql session for any PostgreSQL connection (Tauri only). Supports full PTY via node-pty, ANSI colors, resize, and session persistence across tab navigation.
- **PostgreSQL backup & restore** — `pg_dump`/`pg_restore`/`psql`-based backup/restore flow with scope (database, schema, table), format (plain, custom, tar), and clean restore support (Tauri only). Spawned jobs stream stdout/stderr to a log panel with start/finish/fail/cancel events.
- `@kamehadb/shared` packages is now the single source of truth for Zod schemas, app state types, adapter contracts.
- Add `zod` to shared package and derive types from schemas with `z.infer`.
- `packages/ui` has been dismantled; shared UI utilities now live directly in `apps/desktop/src/lib/utils.ts`.
- **PostgreSQL pgvector guided search** — PostgreSQL connections with pgvector now expose a dedicated `Vector Search` flow with capability detection, text/raw/similar query modes, filter support, distance metrics, row details, and row-level `Find similar` actions.
- **PostgreSQL pgvector map** — pgvector search results can open a sampled PCA map tab to inspect vector neighborhoods visually.
- **PostgreSQL vector metadata in the UI** — schema browsing and PostgreSQL stats now surface vector column and index information.

### Changed

- Desktop dependencies upgraded: React 19, Tailwind CSS v4, Vite 7, Vitest 4, TypeScript ~5.8.3, shadcn/ui v4. Config files updated accordingly.
- `apps/desktop/tsconfig.json`, `vite.config.ts`, and `postcss.config.js` updated for React 19 + Tailwind v4.
- The `apps/desktop/src/copilot/` directory has been removed and the AI chat panel now works exclusively via the sidecar `/ai` routes.
- CSS migrated from `tailwind.config.ts` + PostCSS to `@tailwindcss/vite` plugin with `@import "tailwindcss"` in `index.css`.
- `global.css` → merged into `index.css` and updated for Tailwind v4 theme variables.
- Monaco editor worker (ts.worker) now loaded from the Vite-built bundle instead of `node_modules`.
- `base-button.tsx` removed — all callers migrated to shadcn `Button`.
- Landing page GitHub stars badge is now server-rendered with static revalidation.
- `CHANGELOG.md` formatting aligned with Keep a Changelog conventions.
- Landing page images updated to reflect new AI Compare panel design.
- All `Loader2` + `animate-spin` replaced with the project's `<Spinner>` component.
- Sidebar context menu extracted into `ConnectionDropdownMenu`, `DeleteConfirmDialog` components.
- PostgreSQL connections moved from inline dropdown to modular `ConnectionToolMenuItems` / `postgres-maintenance-menu`.
- `SchemaGraph` component migrated to lazy import in App.tsx for faster initial load.
- Connection health polling replaced with SSE stream from `/connections/health`.
- `@kamehadb/shared` now exports shared store types (`WorkspaceTab`, `AppView`, `AppStoreState`) used by the new modular store. (`[#schema-diff]`)
- Store refactored into a modular file layout under `apps/desktop/src/store/`: `state.ts`, `ui-preferences.ts`, `workspace-tabs.ts`.

### Fixed

- `apps/desktop/package.json` — pnpm workspace protocol for `@kamehadb/shared`.

### Removed

- `packages/ui` has been dismantled; shared UI utilities now live directly in `apps/desktop/src/lib/utils.ts`.

### Added

- **Query history performance panel** — history is now grouped by normalized query pattern (literals stripped) with duration per group, favorites filter, and text search. ([@opencode])
- **Copy result table as snapshot** — "Copy table" button in the result toolbar copies the result grid as tab-separated text to clipboard for quick sharing. ([@opencode])
- **Global search palette (`Ctrl+K`)** — fuzzy-search across connections, schema tables/columns, open tabs, and quick actions (New Query, Graph, DB Stats, AI Chat). Uses cmdk with keyboard navigation. Search button visible in the header for non-keyboard users. ([@opencode])
- **Connection health badges** — status dot now shows:
  - connected/green
  - slow/yellow (≥500ms latency)
  - reconnecting/pulsing
  - offline/red  
    Tooltip displays latency in ms. Reconnecting state has a 5-second grace period before marking disconnected.
- **Time-aware welcome screen** — greetings change by time of day (morning/afternoon/evening/night) with curated messages, last-shown tracking, and returning-visitor prompt rotation.
- **Connection hover tooltip** — shows connection details:
  - kind
  - host:port
  - database
  - status + latency
  - last-updated timestamp
- **Pin connections to top** — "Pin to top"/"Unpin" in connection dropdown. Pinned connections appear in a dedicated "Pinned" section in sidebar. Stored in localStorage.
- **Workspace tabs memory** — open tabs and active tab are saved and restored on reload.
- **Sidebar database icons** — engine-specific icons added:
  - PostgreSQL
  - MySQL
  - MongoDB
  - Redis
  - SQL Server
  - Oracle
  - ClickHouse
  - MariaDB  
    Plus local SVGs for DuckDB, SQLite, TigerBeetle, Qdrant.
- TigerBeetle seed script (`seed:tigerbeetle`) added to sidecar package.json. ([@opencode])
- **DuckDB adapter** — connect to local `.duckdb` files for embedded analytical queries. ([@JoeJoeflyn])
- **TigerBeetle adapter** — connect to TigerBeetle distributed ledger clusters with built-in connection pooling. ([@JoeJoeflyn])
- **Docker compose services for DuckDB and TigerBeetle** — add `docker-compose.yml` entries for DuckDB (CLI + HTTP) and TigerBeetle. Start with `docker compose up -d duckdb tigerbeetle`.
- Landing page GitHub stars badge is now server-rendered with static revalidation, so the initial HTML includes the count when available.
- **Embedded mongosh terminal** — interactive mongosh session with full PTY, ANSI colors, resize, and persistence across tab navigation.
- **SQL Server adapter** — connect to Microsoft SQL Server databases via existing SQL adapter path. ([@JoeJoeflyn])
- **Oracle adapter** — schema browsing, query execution, metadata support. ([@JoeJoeflyn])
- **ClickHouse adapter** — columnar analytics support, schema inspection, query execution. ([@JoeJoeflyn])
- **PostgreSQL adapter** — schema browsing, query execution, metadata support. Enhanced with connection health checks, table/index statistics, and database size tracking. ([@JoeJoeflyn] + [@opencode])
- **PostgreSQL pgvector guided search** — PostgreSQL connections with pgvector now expose a dedicated `Vector Search` flow with capability detection, text/raw/similar query modes, filter support, distance metrics, row details, and row-level `Find similar` actions.
- **PostgreSQL pgvector map** — pgvector search results can open a sampled PCA map tab to inspect vector neighborhoods visually.
- **PostgreSQL vector metadata in the UI** — schema browsing and PostgreSQL stats now mark vector columns and surface pgvector index methods/operators.
- **Slack connector MCP server** — integrated MCP server to search Slack channels and messages via `#search` from the AI panel. ([@JoeJoeflyn])
