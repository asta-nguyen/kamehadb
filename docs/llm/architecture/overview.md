# KamehaDB Architecture Overview

Verification: [x] Current entry points and domain map checked against the sources below in this run.

## Purpose

KamehaDB is a local-first database workspace built as a single Wails v2 desktop app: a Go backend embedded in the executable plus a React 19 + Vite frontend. There is no external sidecar process or HTTP API — the frontend calls bound Go services through generated Wails bindings. `packages/shared` owns the frontend-facing kind constants, validation schemas, and shared types. The supported database kinds are defined in the shared schemas and mirrored in `internal/engines/kinds.go`.

## Runtime entry points

- **App:** `main.go` opens the SQLite metadata store, constructs the bound services in `internal/api`, starts the MCP runtime, and runs the Wails app. `app.go` holds `main.App` lifecycle hooks and native file-picker bindings.
- **Frontend:** `apps/desktop/src/App.tsx` selects the workspace, API Settings, or Logs view. `Sidebar` exposes connections and engine-specific navigation; `WorkspaceContent` renders the active workspace tab.
- **Shared contract:** `packages/shared/src/index.ts` re-exports the Zod schemas and shared types used by the desktop frontend. `apps/desktop/src/lib/api.ts` wraps the generated bindings in `apps/desktop/wailsjs/`.
- **Local state:** `internal/store/` persists connection profiles, query history, AI settings, MCP state, and the AES-256-GCM credential vault in `kamehadb.db` under the app data dir (`KAMEHADB_DATA_DIR` override).
- **Marketing site:** `landing/` is a separate Next.js app outside the pnpm workspace; it is managed by npm.

## Domain map

| Domain                             | User-visible scope                                                                                                                   | Main entry points                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Connections and workspace          | Create and manage profiles, inspect connection health, navigate database objects, and open workspace tabs.                           | `components/sidebar.tsx`, `components/workspace-content.tsx`, `internal/api/connections.go`                                |
| SQL and schema exploration         | Edit and run SQL, browse tables and metadata, and view database/table statistics.                                                    | `components/sql-editor.tsx`, `components/schema-tree.tsx`, `internal/api/sql.go`, `internal/engines/`                      |
| Schema lifecycle                   | Capture schema snapshots, watch changes, compare snapshots, and generate migration SQL.                                              | `components/schema-timeline.tsx`, `components/schema-diff-view.tsx`, `internal/schema/`, `internal/api/schema.go`          |
| Engine-specific explorers          | Browse MongoDB documents and Redis keys.                                                                                             | `components/mongo-view.tsx`, `components/redis-view.tsx`, `internal/mongo/`, `internal/redis/`, `internal/api/mongo.go`    |
| AI and client integrations         | Configure AI providers and chat with schema context; expose opted-in profiles to local MCP clients through the read-only MCP server. | `components/api-settings-page.tsx`, `internal/api/ai.go`, `internal/ai/`, [[integrations/read-only-mcp]]                   |
| Query history                      | Revisit saved queries, manage favorites, and inspect slow query patterns.                                                            | `components/query-history-panel.tsx`, `internal/api/history.go`                                                            |
| Diagnostics and native maintenance | View combined app logs and use PostgreSQL `psql`/`pg_dump` or file-database maintenance workflows.                                   | `components/logs-page.tsx`, `internal/logs/`, `internal/terminal/`, `internal/maintenance/`, `internal/api/maintenance.go` |
| Marketing and documentation site   | Separate Next.js pages for product information, engine overview, changelog, team/video pages, and generated marketing imagery.       | [Marketing site](../integrations/marketing-site.md), `landing/src/app/`                                                    |

## Cross-domain dependencies

- `apps/desktop/src/lib/api.ts` calls generated Wails bindings; `wailsjs/go/models.ts` mirrors the Go response shapes. Backend→frontend notifications (health ticks, terminal output, AI streaming, tool jobs) use `runtime.EventsEmit`/`EventsOn`.
- SQL, MongoDB, Redis, and federated editors share `apps/desktop/src/lib/code-editor.tsx`, a CodeMirror 6 wrapper; completion logic stays in `lib/sql-autocomplete.ts` and `lib/mongo-autocomplete.ts`.
- Bound services use the metadata store and the engine adapter registry (`internal/engines/registry.go`). Connection profile IDs tie together database operations, query history, AI context, and MCP access.
- The MCP server uses its own read-only adapter manager rather than reusing the UI adapter cache; its flow and constraints are documented in [[integrations/read-only-mcp|Read-only MCP server]].
- Wails supplies the desktop lifecycle and native dialogs; `internal/` is the entire database boundary — no network hop exists between frontend and backend.
- The landing app has a separate npm package and build path and is not part of the pnpm workspace.

## Sources

- `README.md`
- `main.go`
- `app.go`
- `internal/api/connections.go`
- `internal/api/sql.go`
- `internal/api/schema.go`
- `internal/api/mongo.go`
- `internal/api/redis.go`
- `internal/api/ai.go`
- `internal/api/history.go`
- `internal/api/mcp.go`
- `internal/api/maintenance.go`
- `internal/api/terminal.go`
- `internal/store/profiles.go`
- `internal/engines/registry.go`
- `internal/engines/kinds.go`
- `internal/schema/watcher.go`
- `internal/mcp/runtime.go`
- `internal/mcp/tools.go`
- `internal/mcp/manager.go`
- `internal/logs/logs.go`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/sidebar.tsx`
- `apps/desktop/src/components/workspace-content.tsx`
- `apps/desktop/src/components/sql-editor.tsx`
- `apps/desktop/src/lib/code-editor.tsx`
- `apps/desktop/src/components/schema-tree.tsx`
- `apps/desktop/src/components/schema-timeline.tsx`
- `apps/desktop/src/components/schema-diff-view.tsx`
- `apps/desktop/src/components/mongo-view.tsx`
- `apps/desktop/src/components/redis-view.tsx`
- `apps/desktop/src/components/api-settings-page.tsx`
- `apps/desktop/src/components/ai-chat-panel.tsx`
- `apps/desktop/src/components/mcp-settings-section.tsx`
- `apps/desktop/src/components/query-history-panel.tsx`
- `apps/desktop/src/components/logs-page.tsx`
- `apps/desktop/src/components/postgres-psql-tab.tsx`
- `apps/desktop/src/components/postgres-backup-dialog.tsx`
- `apps/desktop/src/components/postgres-restore-dialog.tsx`
- `apps/desktop/src/components/file-database-backup-dialog.tsx`
- `apps/desktop/src/components/file-database-restore-dialog.tsx`
- `apps/desktop/src/lib/api.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.ts`
- `landing/package.json`
- `landing/src/app/page.tsx`
- `landing/src/app/layout.tsx`
