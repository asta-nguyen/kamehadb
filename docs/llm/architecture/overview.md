# KamehaDB Architecture Overview

## Purpose

KamehaDB is a local-first database workspace built as a Tauri desktop app with a local Node sidecar. The desktop shell provides the workspace and settings views; the sidecar exposes database APIs; `packages/shared` owns database kinds, validation schemas, and shared contracts. The supported database kinds are defined in the shared schemas.

## Runtime entry points

- **Desktop:** `apps/desktop/src/App.tsx` waits for the sidecar and selects the workspace, API Settings, or Logs view. `Sidebar` exposes connections and engine-specific navigation; `WorkspaceContent` renders the active workspace tab.
- **Sidecar:** `apps/sidecar/src/index.ts` initializes the local metadata store, mounts the internal API route groups, starts the MCP runtime, and binds the Hono server to loopback. Its default internal port is `3170` and can be overridden by `PORT`.
- **Shared contract:** `packages/shared/src/index.ts` re-exports the Zod schemas and shared types used by the desktop and sidecar.
- **Local state:** `apps/sidecar/src/db/metadata-store.ts` persists connection profiles and application metadata in SQLite.

## Domain map

| Domain                             | User-visible scope                                                                                                                   | Main entry points                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connections and workspace          | Create and manage profiles, inspect connection health, navigate database objects, and open workspace tabs.                           | `components/sidebar.tsx`, `components/workspace-content.tsx`, `/connections`                                                                            |
| SQL and schema exploration         | Edit and run SQL, browse tables and metadata, view database/table statistics, and use engine-specific vector workflows.              | `components/sql-editor.tsx`, `components/schema-tree.tsx`, `/sql`                                                                                       |
| Schema lifecycle                   | Capture schema snapshots, watch changes, compare snapshots, and generate migration SQL.                                              | `components/schema-timeline.tsx`, `components/schema-diff-view.tsx`, `/sql` schema routes                                                               |
| Engine-specific explorers          | Browse MongoDB documents, Redis keys, Qdrant collections/points, and TigerBeetle accounts/transfers.                                 | `components/mongo-view.tsx`, `components/redis-view.tsx`, `components/qdrant-view.tsx`, `components/tigerbeetle-explorer.tsx`; dedicated sidecar routes |
| AI and client integrations         | Configure AI providers and chat with schema context; expose opted-in profiles to local MCP clients through the read-only MCP server. | `components/api-settings-page.tsx`, `/ai`, [[integrations/read-only-mcp]]                                                                               |
| Query history                      | Revisit saved queries, manage favorites, and inspect slow query patterns.                                                            | `components/query-history-panel.tsx`, `/query-history`                                                                                                  |
| Diagnostics and native maintenance | View combined app logs and use Tauri-backed PostgreSQL or file-database maintenance workflows.                                       | `components/logs-page.tsx`, `apps/desktop/src-tauri` commands                                                                                           |

## Cross-domain dependencies

- The desktop API client talks to the sidecar and uses shared contracts for request and response shapes.
- Sidecar route handlers use the metadata store and engine adapters. Connection profile IDs tie together database operations, query history, AI context, and MCP access.
- The MCP server uses its own read-only adapter manager rather than reusing the UI SQL adapter cache; its flow and constraints are documented in [[integrations/read-only-mcp|Read-only MCP server]].
- Tauri supplies desktop lifecycle and native commands; the sidecar remains the database API boundary for the React frontend.

## Sources

- `README.md`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/sidebar.tsx`
- `apps/desktop/src/components/workspace-content.tsx`
- `apps/desktop/src/components/sql-editor.tsx`
- `apps/desktop/src/components/schema-tree.tsx`
- `apps/desktop/src/components/schema-timeline.tsx`
- `apps/desktop/src/components/schema-diff-view.tsx`
- `apps/desktop/src/components/mongo-view.tsx`
- `apps/desktop/src/components/redis-view.tsx`
- `apps/desktop/src/components/qdrant-view.tsx`
- `apps/desktop/src/components/tigerbeetle-explorer.tsx`
- `apps/desktop/src/components/api-settings-page.tsx`
- `apps/desktop/src/components/mcp-settings-section.tsx`
- `apps/desktop/src/components/query-history-panel.tsx`
- `apps/desktop/src/components/logs-page.tsx`
- `apps/desktop/src/components/postgres-psql-tab.tsx`
- `apps/desktop/src/components/postgres-backup-dialog.tsx`
- `apps/desktop/src/components/postgres-restore-dialog.tsx`
- `apps/desktop/src/components/file-database-backup-dialog.tsx`
- `apps/desktop/src/components/file-database-restore-dialog.tsx`
- `apps/desktop/src/lib/api.ts`
- `apps/desktop/src/lib/api-client.ts`
- `apps/sidecar/src/index.ts`
- `apps/sidecar/src/db/metadata-store.ts`
- `apps/sidecar/src/lib/schema-watcher.ts`
- `apps/sidecar/src/lib/file-database-maintenance.ts`
- `apps/sidecar/src/routes/connections.ts`
- `apps/sidecar/src/routes/sql.ts`
- `apps/sidecar/src/routes/sql-schema.ts`
- `apps/sidecar/src/routes/sql-vector-pg.ts`
- `apps/sidecar/src/routes/sql-vector-sqlite.ts`
- `apps/sidecar/src/routes/mongo.ts`
- `apps/sidecar/src/routes/redis.ts`
- `apps/sidecar/src/routes/qdrant.ts`
- `apps/sidecar/src/routes/tigerbeetle.ts`
- `apps/sidecar/src/routes/ai.ts`
- `apps/sidecar/src/routes/query-history.ts`
- `apps/sidecar/src/routes/mcp-settings.ts`
- `apps/sidecar/src/mcp/runtime.ts`
- `apps/sidecar/src/mcp/tools.ts`
- `apps/sidecar/src/mcp/adapter-manager.ts`
- `apps/sidecar/src/mcp/adapters/factory.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.ts`
- `apps/desktop/src-tauri/src/app_logs.rs`
- `apps/desktop/src-tauri/src/postgres_psql/mod.rs`
- `apps/desktop/src-tauri/src/postgres_tools/mod.rs`
