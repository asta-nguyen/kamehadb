# KamehaDB Architecture Overview

Verification: [x] Current entry points and domain map checked against the sources below in this run.

## Purpose

KamehaDB is a local-first database workspace built as a Tauri desktop app with a local Node sidecar. The React desktop app owns the workspace and settings views. The sidecar exposes database APIs on loopback and stores connection profiles and application metadata in SQLite. `packages/shared` exports the database kinds, validation schemas, and contracts used by both packages.

## Runtime entry points

- **Desktop:** `apps/desktop/src/App.tsx` gates saved-connection loading on `useSidecar` readiness and selects the workspace, API Settings, or Logs view.
- **Native shell:** `apps/desktop/src-tauri/src/lib.rs` starts the Node sidecar on launch, exposes `start_sidecar` to the frontend, and stops the managed child on app exit.
- **Sidecar:** `apps/sidecar/src/index.ts` initializes metadata SQLite, mounts database and application route groups, starts the MCP runtime, and binds the Hono API to `127.0.0.1`.
- **Shared contract:** `packages/shared/src/index.ts` re-exports Zod schemas and shared types used by the desktop and sidecar.
- **Marketing site:** `landing/` is a separate Next.js app outside the pnpm workspace; it is managed by npm.

## Domain map

| Domain                                | User-visible scope                                                                                                             | Main entry points                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Connections and workspace             | Create and test profiles, monitor health, reload profile data, navigate schemas, search, and persist open tabs and pins.       | [Connections and workspace](../workflows/connections-and-workspace.md), `apps/desktop/src/components/sidebar.tsx`, `/connections`          |
| SQL workspace                         | Run guarded SQL, inspect tabular results, browse schemas, export results, and open schema graphs.                              | [SQL workspace](../workflows/sql-workspace.md), `apps/desktop/src/components/sql-editor.tsx`, `/sql`                                       |
| Schema lifecycle                      | Capture and watch schema snapshots, compare versions, and generate migration SQL for review.                                   | [Schema lifecycle](../workflows/schema-lifecycle.md), `/sql`                                                                               |
| Engine explorers                      | Browse and operate MongoDB, Redis, Qdrant, and TigerBeetle through dedicated routes and views.                                 | [Engine explorers](../workflows/engine-explorers.md), `apps/desktop/src/components/workspace-content.tsx`                                  |
| Vector workflows                      | Search PostgreSQL pgvector and SQLite vec0 data. Qdrant vector search is documented with its explorer.                         | [Vector search](../workflows/vector-search.md), `/sql/vector`                                                                              |
| Query history and federated queries   | Reopen saved SQL, manage favorites, inspect slow-query patterns, and compare results from multiple SQL profiles.               | [Query history](../workflows/query-history.md), [Federated queries](../workflows/federated-query.md)                                       |
| AI and client integrations            | Configure AI providers, use schema-aware chat, and expose opted-in profiles to local MCP clients.                              | [AI assistant](../integrations/ai-assistant.md), [Read-only MCP server](../integrations/read-only-mcp.md)                                  |
| Diagnostics and maintenance           | Inspect app logs and run PostgreSQL terminal/backup jobs or SQLite/DuckDB file maintenance.                                    | [Diagnostics and maintenance](../operations/diagnostics-and-maintenance.md)                                                                |
| Desktop runtime and sidecar lifecycle | Start the local API sidecar and check it after focus, visibility, or network events.                                           | `apps/desktop/src/hooks/use-sidecar.ts`, `apps/desktop/src-tauri/src/lib.rs`; [recovery workflow](../workflows/sidecar-resume-recovery.md) |
| Marketing and documentation site      | Separate Next.js pages for product information, engine overview, changelog, team/video pages, and generated marketing imagery. | [Marketing site](../integrations/marketing-site.md), `landing/src/app/`                                                                    |

## Cross-domain dependencies

- The desktop calls the sidecar through an authenticated loopback API client and shares request/response contracts through `packages/shared`.
- Sidecar route handlers use the SQLite metadata store and database adapters.
- The desktop workspace and sidecar API support twelve database engines; their SQL adapter path and dedicated engine routes are mapped in [Database support](engine-support.md).
- The MCP server uses its own read-only adapter manager instead of the UI SQL adapter cache; see [Read-only MCP server](../integrations/read-only-mcp.md).
- Tauri manages the Node sidecar process while the sidecar remains the database API boundary for the React frontend. Resume checks and cache invalidation are documented in the [recovery workflow](../workflows/sidecar-resume-recovery.md).
- The landing app has a separate npm package and build path and is not part of the pnpm workspace.

## Sources

- `README.md`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/sidebar.tsx`
- `apps/desktop/src/components/workspace-content.tsx`
- `apps/desktop/src/components/sql-editor.tsx`
- `apps/desktop/src/components/schema-timeline.tsx`
- `apps/desktop/src/components/schema-diff-view.tsx`
- `apps/desktop/src/components/mongo-view.tsx`
- `apps/desktop/src/components/redis-view.tsx`
- `apps/desktop/src/components/qdrant-view.tsx`
- `apps/desktop/src/components/tigerbeetle-explorer.tsx`
- `apps/desktop/src/components/api-settings-page.tsx`
- `apps/desktop/src/components/ai-chat-panel.tsx`
- `apps/desktop/src/components/mcp-settings-section.tsx`
- `apps/desktop/src/components/query-history-panel.tsx`
- `apps/desktop/src/components/logs-page.tsx`
- `apps/desktop/src/hooks/use-connections.ts`
- `apps/desktop/src/hooks/use-sidecar.ts`
- `apps/desktop/src/lib/api-client.ts`
- `apps/desktop/src/lib/query-keys.ts`
- `apps/desktop/src/lib/tauri.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/sidecar/src/index.ts`
- `apps/sidecar/src/db/metadata-store.ts`
- `apps/sidecar/src/routes/connections.ts`
- `apps/sidecar/src/adapters/factory.ts`
- `apps/sidecar/src/routes/sql.ts`
- `apps/sidecar/src/routes/sql-schema.ts`
- `apps/sidecar/src/routes/mongo.ts`
- `apps/sidecar/src/routes/redis.ts`
- `apps/sidecar/src/routes/qdrant.ts`
- `apps/sidecar/src/routes/tigerbeetle.ts`
- `apps/sidecar/src/mcp/adapter-manager.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.ts`
- `landing/package.json`
- `landing/src/app/page.tsx`
- `landing/src/app/layout.tsx`
