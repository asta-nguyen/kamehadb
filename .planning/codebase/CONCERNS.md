---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: concerns
---

# Technical Debt, Issues & Concerns

## No Tests

**Severity: High**

The entire project has **zero test files**. Vitest is configured for the desktop package (`vite.config.ts` has `test: { include: ['src/**/*.test.ts'] }`), but no `.test.ts` files exist anywhere. CI runs `pnpm --filter @kamehadb/desktop test` which executes vitest with 0 test files.

- No unit tests for any of the 12 DB adapters
- No integration tests for any Hono route handlers
- No tests for shared Zod schemas or utility functions
- No tests for desktop hooks, store logic, or utility functions
- No coverage tooling configured
- The sidecar and shared packages have no test framework or script at all

**Risk:** Regressions in query execution, schema browsing, AI chat, or data export can go undetected. The 12 database adapters are particularly critical — a bug in any adapter could corrupt or expose user data.

## Large Files

**Severity: Medium**

Several files are disproportionately large, making them hard to maintain and review:

| File                                                | Size | Concern                                                                                                       |
| --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| `apps/sidecar/src/routes/sql.ts`                    | 33KB | Single route file handles query execution, schema browsing, preview, autocomplete, PG stats — should be split |
| `apps/desktop/src/components/sql-editor.tsx`        | 38KB | Monaco editor component with embedded test logic, autocomplete, export, chart integration                     |
| `apps/sidecar/src/adapters/postgres.ts`             | 27KB | Largest adapter — PostgreSQL has richest feature set (stats, vector, schema timeline)                         |
| `apps/desktop/src/components/ai-chat-panel.tsx`     | 25KB | AI chat UI with streaming, history, context                                                                   |
| `apps/desktop/src/components/mongo-query.tsx`       | 22KB | MongoDB aggregation pipeline builder                                                                          |
| `apps/sidecar/src/routes/ai.ts`                     | 23KB | AI route handling settings, chat, schema cache, history                                                       |
| `apps/desktop/src/components/table-view.tsx`        | 25KB | Table data browser with editing, export, chart                                                                |
| `apps/desktop/src/components/api-settings-page.tsx` | 20KB | AI provider settings UI                                                                                       |
| `apps/desktop/src/components/database-stats.tsx`    | 20KB | PostgreSQL stats dashboard                                                                                    |

## Type Safety Issues

**Severity: Medium**

### `handleError` uses `any` parameter

`apps/sidecar/src/lib/route-utils.ts:29` — `handleError(c: any, err: unknown, context: string)` uses `any` for the Hono context parameter. Should use `import type { Context } from 'hono'`.

### `as unknown as` casts

5 instances of `as unknown as` across the codebase — these bypass type checking:

- `apps/desktop/src/components/ai-chat-panel.tsx`
- `apps/desktop/src/components/data-table.tsx`
- `apps/desktop/src/components/sql-editor.tsx`
- `apps/sidecar/src/adapters/mysql.ts`
- `apps/sidecar/src/adapters/tigerbeetle.ts`

### `: any` type annotations

6 instances of explicit `: any` annotations:

- `apps/desktop/src/lib/constants.ts` (2 matches)
- `apps/desktop/src/components/chart-view.tsx`
- `apps/sidecar/src/adapters/mysql.ts`
- `apps/sidecar/src/adapters/postgres.ts`
- `apps/sidecar/src/lib/route-utils.ts`

## ESLint Disable Directives

**Severity: Low**

4 `eslint-disable` directives, all with justifications:

- `apps/sidecar/src/index.ts:111` — `console.log` for `KAMEHADB_SIDECAR_PORT` stdout (intentional, for Tauri port parsing)
- `apps/desktop/src/components/connection-dialog-fields.tsx:200` — raw `<label>` for custom color picker (no shadcn equivalent)
- `apps/desktop/src/components/connection-dialog-fields.tsx:210` — raw `<input type="color">` (no shadcn equivalent)
- `apps/desktop/src/components/schema-graph.tsx:262` — raw `<button>` for ReactFlow controls (custom integration)

## Error Handling Patterns

**Severity: Medium**

### Inconsistent error handling across routes

107 `catch` blocks across 26 sidecar files. While `handleError()` exists in `route-utils.ts`, not all routes use it consistently. Some routes have inline try/catch with manual error responses.

### Silent catch blocks

Some catch blocks in `apps/sidecar/src/lib/logger.ts` and `apps/sidecar/src/lib/mongosh.ts` silently swallow errors (empty catch or only debug logging). If the logs directory can't be created or mongosh install fails, the user may not understand why features don't work.

## Security Concerns

**Severity: Low-Medium**

### CORS allows all origins

`apps/sidecar/src/index.ts:65` — `cors({ origin: '*' })` allows any origin. While the sidecar binds to `127.0.0.1` only, a malicious local process could still make requests. Consider restricting to known origins (`localhost:1420`, `localhost:5173`, `file://`).

### API key storage in SQLite

AI provider API keys are stored in the metadata SQLite database (`apps/sidecar/src/db/metadata-store.ts` has 37 references to password/secret/token). While the pino logger redacts these from logs, the keys themselves are in plaintext in SQLite. Database connection passwords use the OS keyring via Tauri, but AI API keys may not.

### Password handling in adapters

Connection passwords flow through the adapter factory as plain strings (`_password` parameter in `apps/sidecar/src/adapters/factory.ts`). While this is in-process memory, the password parameter naming (`_password` with underscore prefix) suggests they're intentionally unused in some paths, which could indicate dead code or missing SSL/TLS handling.

## Performance Concerns

**Severity: Medium**

### Limited code splitting

Only 2 lazy-loaded components in `apps/desktop/src/components/workspace-content.tsx`:

- `QdrantVectorMap` (three.js 3D visualization)
- `QdrantStatsPanel`

The rest are eagerly imported, including heavy components like `SqlEditor` (Monaco), `SchemaGraph` (xyflow), `VectorQuery`, `MongoQuery`. The initial bundle includes Monaco editor and all database engine views even if the user only uses one engine.

### No connection pooling

Each request to the sidecar creates a new database connection (or reuses a cached one via `lru-cache`). There's no explicit connection pool management — adapters create connections per-request. For high-frequency query execution, this could be slow.

### Schema indexing on startup

`apps/sidecar/src/index.ts:115` — `indexAllConnections().catch()` runs on sidecar startup, indexing schemas for all SQL connections. With many connections or large schemas, this could delay startup or consume memory.

## Architecture Concerns

**Severity: Low-Medium**

### `packages/ui` is empty

The `packages/ui` directory exists in the pnpm workspace but has no `package.json` or source files. It's a placeholder that was never populated. The desktop app uses its own `components/ui/` directory instead.

### `apps/mcp-server` has no source

The `apps/mcp-server/` directory contains only `dist/` and `node_modules/` — no source code. This appears to be a build artifact from an MCP server that was either removed or is generated elsewhere.

### TigerBeetle tab is a placeholder

`apps/desktop/src/components/workspace-content.tsx:119-123` — The TigerBeetle tab type renders only "TigerBeetle explorer" placeholder text, not the actual `TigerBeetleExplorer` component (which exists at `apps/desktop/src/components/tigerbeetle-explorer.tsx`).

### Landing site is separate from workspace

`landing/` uses npm (not pnpm) and is completely separate from the workspace. This means shared types and utilities can't be imported — any contract changes must be manually synced.

## Dependency Concerns

**Severity: Low**

### Oracle driver (`oracledb`) is heavy

`oracledb` ^7.0.0 requires Oracle Instant Client for full functionality. In CI (Ubuntu), this may need additional system packages. The `pnpm.onlyBuiltDependencies` list includes `oracledb`, indicating it has native build steps.

### `node-pty` native dependency

`node-pty` ^1.1.0 is used for terminal sessions (mongosh, psql). It requires native compilation and can be fragile across platforms. The Tauri Rust side also uses `portable-pty` ^0.9.0 — two different PTY libraries for similar functionality.

### Mixed icon libraries

Desktop uses both `lucide-react` (^0.400.0) and `developer-icons` (^7.0.1). Landing uses `@tabler/icons-react`, `lucide-react`, and `thesvg`. This increases bundle size and creates visual inconsistency.

## Missing Documentation

**Severity: Low**

- No API documentation for sidecar routes (no OpenAPI/Swagger)
- No JSDoc on most exported functions (only a few in `route-utils.ts` and `logger.ts`)
- No architecture decision records (ADRs)
- `packages/ui` has no README explaining its intended purpose
- `apps/mcp-server` has no README explaining its relationship to the project

## Fragile Areas

**Severity: Medium**

### Schema diff/migration pipeline

`apps/sidecar/src/lib/schema-diff.ts` and `schema-migration.ts` implement schema comparison and migration SQL generation. These are complex operations with no tests — a bug could generate incorrect migration SQL that damages production schemas.

### AI provider abstraction

`apps/sidecar/src/ai/provider.ts` (28 references to password/secret/token) handles multiple AI providers. Changes to provider APIs (OpenAI, Anthropic) could break chat functionality with no test coverage to catch regressions.

### Column resize logic

`apps/desktop/src/hooks/use-column-resize.ts` (9KB) implements complex drag-based column resizing with manual DOM manipulation (`r.style.gridTemplateColumns = next`). This is fragile and could break with browser updates or React 19 changes.

### Terminal session management

`apps/desktop/src/hooks/use-terminal-session.ts` manages xterm.js sessions with Tauri PTY. The lifecycle (open/close/restart) is complex and involves both frontend state and Rust-side process management — leaks or crashes here are hard to debug without tests.
