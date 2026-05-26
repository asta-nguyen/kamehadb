# Plan.md: Local Database Admin App

## Summary

Build a local-first desktop database admin tool similar to Adminer/TablePlus, using:

```text
Tauri + React + TypeScript + Node sidecar
Tailwind CSS + shadcn/ui
TanStack Query + TanStack Table + TanStack Store
Monaco Editor
```

The app will support common databases in phases: PostgreSQL and SQLite first, then MySQL/MariaDB, then Redis. MVP is read-only by default to avoid accidental destructive operations.

## Product Goals

Create a desktop app for developers to inspect and query local or private databases without exposing DB credentials to a hosted service.

Core goals:

- Manage database connection profiles.
- Browse schemas, tables, columns, indexes, and constraints.
- Preview table data with pagination.
- Run SQL queries safely.
- Browse Redis keys in a later phase.
- Store credentials securely using OS keychain.
- Keep the app local-first and cross-platform.

Non-goals for MVP:

- Multi-user web dashboard.
- Team RBAC.
- Cloud sync.
- Full TablePlus/DataGrip replacement.
- AI assistant in first release.
- Write/edit/delete data by default.

## Tech Stack

Desktop:

```text
Tauri v2
Rust shell for desktop packaging and native commands
```

Frontend:

```text
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
lucide-react
```

State and data:

```text
TanStack Query: server/cache state from sidecar APIs
TanStack Table: result grids and table previews
TanStack Store: local UI/client state
React Hook Form: forms
Zod: validation and shared schemas
```

Editor:

```text
Monaco Editor
SQL syntax highlighting
Future autocomplete support
```

Sidecar:

```text
Node.js
TypeScript
Fastify or Hono
pino logging
zod request/response validation
```

Database drivers:

```text
PostgreSQL: pg
SQLite: better-sqlite3 for full support, or sql.js for easier read-only fallback
MySQL/MariaDB: mysql2
Redis: ioredis
```

Local metadata:

```text
SQLite database in app data directory
```

Secrets:

```text
Tauri keychain plugin or keytar
macOS Keychain
Windows Credential Manager
Linux Secret Service
```

Testing:

```text
Vitest
Playwright
Testcontainers for PostgreSQL/MySQL/Redis integration tests
SQLite fixture files
```

Package manager:

```text
pnpm
```

## Project Structure

Use a monorepo layout:

```text
apps/desktop
apps/sidecar
packages/shared
packages/ui
```

Responsibilities:

```text
apps/desktop:
Tauri app, React UI, routes, layouts, webview integration

apps/sidecar:
Local Node API server, DB adapters, connection lifecycle, query execution

packages/shared:
Shared TypeScript types, zod schemas, adapter contracts, API DTOs

packages/ui:
Optional shared UI wrappers around shadcn/ui components
```

Recommended scripts:

```json
{
  "dev": "run desktop and sidecar together",
  "dev:desktop": "run Tauri/Vite desktop app",
  "dev:sidecar": "run Node sidecar",
  "build": "build desktop app and sidecar",
  "typecheck": "run TypeScript checks",
  "test": "run unit tests",
  "test:integration": "run DB integration tests",
  "e2e": "run Playwright tests",
  "lint": "run lint checks"
}
```

## Architecture

Runtime flow:

```text
React UI
→ TanStack Query calls local sidecar API
→ Node sidecar validates request
→ DB adapter executes database operation
→ Adapter normalizes result
→ Sidecar returns typed response
→ UI renders result grid/table/schema tree
```

Tauri responsibilities:

- Start and stop Node sidecar.
- Provide app data directory.
- Provide secure secret storage bridge if needed.
- Package app for macOS, Windows, and Linux.
- Keep app local-only by default.

Node sidecar responsibilities:

- Bind only to `127.0.0.1`.
- Select a random available port.
- Expose typed local API.
- Manage connection pools.
- Normalize database metadata.
- Apply query timeout and safety guards.
- Redact secrets from logs.
- Never expose DB APIs publicly.

Frontend responsibilities:

- Manage workspace layout.
- Display connection tree.
- Display table metadata and preview data.
- Provide SQL editor and query result grid.
- Store local UI state using TanStack Store.
- Fetch async data using TanStack Query.

## State Management

Use TanStack Query for remote/server state:

```text
connection list
database list
schema tree
table metadata
preview rows
query result
Redis key scan result
```

Use TanStack Store for local UI state:

```text
active connection id
active database/schema/table
opened tabs
active tab id
sidebar collapsed state
selected result grid cell
SQL editor draft per tab
theme/density preference
recently used connection id
```

Example store shape:

```ts
type AppStoreState = {
  activeConnectionId: string | null;
  activeDatabaseId: string | null;
  activeSchemaId: string | null;
  activeTableId: string | null;
  openedTabs: WorkspaceTab[];
  activeTabId: string | null;
  sidebarCollapsed: boolean;
  density: 'compact' | 'comfortable';
};
```

Decision:

```text
Do not use Zustand.
Use TanStack Store for local client state so the app keeps a consistent TanStack ecosystem.
```

## Core Types

Database kind:

```ts
type DbKind = 'postgres' | 'sqlite' | 'mysql' | 'redis';
```

Connection profile:

```ts
type ConnectionProfile = {
  id: string;
  name: string;
  kind: DbKind;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  ssl?: boolean;
  filePath?: string;
  readonly: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Credential reference:

```ts
type CredentialRef = {
  connectionId: string;
  secretKey: string;
};
```

Query result:

```ts
type QueryResult = {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
};
```

SQL adapter contract:

```ts
interface SqlAdapter {
  testConnection(): Promise<TestConnectionResult>;
  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database?: string): Promise<SchemaInfo[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  getTableColumns(tableId: string): Promise<ColumnInfo[]>;
  getTableIndexes(tableId: string): Promise<IndexInfo[]>;
  previewRows(input: PreviewRowsInput): Promise<QueryResult>;
  runQuery(input: RunQueryInput): Promise<QueryResult>;
}
```

Redis adapter contract:

```ts
interface RedisAdapter {
  testConnection(): Promise<TestConnectionResult>;
  scanKeys(input: ScanKeysInput): Promise<KeyPage>;
  getKey(input: GetKeyInput): Promise<RedisValue>;
  getTtl(input: GetTtlInput): Promise<number>;
}
```

## Sidecar API

Connection APIs:

```text
GET    /connections
POST   /connections
PATCH  /connections/:id
DELETE /connections/:id
POST   /connections/test
```

SQL APIs:

```text
GET  /sql/:connectionId/databases
GET  /sql/:connectionId/schemas
GET  /sql/:connectionId/tables
GET  /sql/:connectionId/tables/:tableId/columns
GET  /sql/:connectionId/tables/:tableId/indexes
POST /sql/:connectionId/preview
POST /sql/:connectionId/query
```

Redis APIs:

```text
POST /redis/:connectionId/scan
GET  /redis/:connectionId/key
GET  /redis/:connectionId/ttl
```

Health API:

```text
GET /health
```

Default API behavior:

- Validate every request with Zod.
- Return structured errors.
- Redact passwords and tokens.
- Enforce timeout on every DB operation.
- Enforce read-only mode for destructive SQL in MVP.

## MVP Features

Connection management:

- Create connection profile.
- Edit connection profile.
- Delete connection profile.
- Test connection.
- Store profile metadata locally.
- Store password securely in OS keychain.
- Mark connection as read-only by default.

PostgreSQL support:

- Connect using host, port, database, username, password, SSL toggle.
- List schemas.
- List tables.
- List columns.
- List indexes.
- Preview table rows.
- Run read-only SQL query.

SQLite support:

- Connect using local `.sqlite`, `.sqlite3`, or `.db` file path.
- List tables.
- List columns.
- List indexes.
- Preview table rows.
- Run read-only SQL query.

Database browser:

- Sidebar tree with connections.
- Expand database/schema/table.
- Refresh connection tree.
- Show connection status.
- Open table in workspace tab.

Table view:

- Columns panel.
- Indexes panel.
- Data preview grid.
- Pagination.
- Sort by column.
- Basic filter.
- Export visible result to CSV/JSON.

SQL editor:

- Monaco editor.
- Run query command.
- Query timeout.
- Query result grid.
- Query duration display.
- Query error display.
- Query history.

Safety:

- Read-only mode enabled by default.
- Block dangerous SQL in MVP.
- Warn before running non-SELECT queries.
- Limit result set display.
- Redact secrets in logs.

## Later Features

v0.2 MySQL/MariaDB:

- Add MySQL adapter with `mysql2`.
- Normalize MySQL metadata into shared schema model.
- Support preview rows and query editor.
- Handle MySQL-specific types and errors.

v0.3 Redis:

- Add Redis connection profile.
- Key scanner with pattern search.
- Display key type, TTL, and size estimate.
- View values for string, hash, list, set, zset, and stream.
- Keep Redis read-only in first Redis release.

v0.4 Editing:

- Enable row insert/update/delete only when connection is not read-only.
- Generate parameterized SQL for edits.
- Confirm destructive actions.
- Add transaction wrapper for supported DBs.
- Show before/after change preview.

v0.5 Productivity:

- Multi-tab SQL editor.
- Saved queries.
- Bookmarks.
- Import CSV.
- SSH tunnel.
- Query explain plan.
- Keyboard shortcuts.
- Command palette.

v0.6 AI:

- Explain selected table/schema.
- Generate SQL from natural language.
- Explain query result.
- Suggest indexes.
- Detect possible PII columns.
- Summarize database structure.

## UI Plan

Main layout:

```text
Left sidebar:
Connection list and database tree

Center workspace:
Tabs for table view, SQL editor, Redis key view

Bottom panel:
Query result, logs, errors

Top toolbar:
Connect, refresh, run query, export, read-only status
```

Screens:

- Welcome screen
- New connection dialog
- Connection test result
- Database browser
- Table detail tab
- SQL editor tab
- Query result tab
- Settings screen

shadcn/ui components to use:

```text
Button
Dialog
Sheet
Tabs
DropdownMenu
ContextMenu
Tooltip
Command
Form
Input
Select
Switch
Badge
Separator
Resizable panels
ScrollArea
```

Design defaults:

- Compact desktop UI.
- Dense tables.
- Clear borders.
- Small radius, 6px to 8px.
- No marketing-style layout.
- Read-only state always visible.
- Destructive controls hidden until editing phase.
- Keyboard-friendly interactions.

## Security

Required:

- Sidecar binds to `127.0.0.1` only.
- Use random port per session.
- UI receives sidecar port through Tauri process management.
- No password in app logs.
- No password in local SQLite metadata DB.
- Use OS keychain for secrets.
- Default query timeout: `30s`.
- Default preview limit: `100`.
- Default query display limit: `1000`.
- Read-only mode default: `true`.
- Generated queries must use parameterized values.

SQL safety guard:

- Allow `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN` in read-only mode.
- Block `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `GRANT`, `REVOKE` in read-only mode.
- Return clear error when blocked.

## Testing Plan

Unit tests:

- Zod schema validation.
- Connection profile creation/update validation.
- SQL safety guard.
- Query result normalization.
- TanStack Store reducers/actions.
- Adapter factory selection.
- Redis value parser.

Integration tests:

- PostgreSQL test container.
- MySQL test container.
- Redis test container.
- SQLite fixture DB.
- Verify list schema/table/columns.
- Verify preview rows.
- Verify read-only SQL execution.
- Verify dangerous SQL blocked.

UI tests:

- Open app.
- Create SQLite connection.
- Browse schema tree.
- Open table preview.
- Run safe SQL query.
- See query result grid.
- Verify read-only badge.
- Verify blocked destructive query error.

Manual acceptance:

- App starts sidecar automatically.
- App can connect to PostgreSQL.
- App can open SQLite file.
- User can preview rows without writing data.
- Password is not visible in local metadata.
- Query errors render cleanly.
- App restart keeps connection profiles.

## Development Milestones

Milestone 1: Foundation

- Create monorepo.
- Setup Tauri + React + Vite.
- Setup Node sidecar.
- Setup shared types and Zod schemas.
- Setup Tailwind and shadcn/ui.
- Setup TanStack Query, TanStack Store, TanStack Table.

Milestone 2: Connection System

- Local SQLite metadata store.
- Connection profile CRUD.
- OS keychain credential storage.
- Connection test API.
- Frontend connection dialog.

Milestone 3: SQL Browser MVP

- PostgreSQL adapter.
- SQLite adapter.
- Schema tree UI.
- Table metadata view.
- Table preview grid.

Milestone 4: SQL Editor

- Monaco editor.
- Run query API.
- Result grid.
- Query history.
- SQL safety guard.

Milestone 5: Packaging And QA

- Tauri build config.
- Sidecar bundling.
- Smoke tests.
- Basic installer builds.
- Manual testing on macOS first.

Milestone 6: Expansion

- MySQL adapter.
- Redis adapter.
- Export improvements.
- Saved queries.
- Editing mode.
- AI assistant.

## Acceptance Criteria For MVP

MVP is complete when:

- App runs as a Tauri desktop app.
- Node sidecar starts automatically and only listens locally.
- User can create PostgreSQL and SQLite connections.
- User can securely store credentials.
- User can browse schemas/tables/columns/indexes.
- User can preview table rows.
- User can run safe read-only SQL queries.
- Dangerous SQL is blocked in read-only mode.
- Query results render in a usable table grid.
- Query history persists locally.
- App can be built into a desktop artifact.

## Assumptions

- Project starts from scratch.
- The first target user is a developer.
- The first platform for validation is macOS.
- PostgreSQL and SQLite are the first supported DBs.
- MySQL and Redis are planned after MVP.
- The app is local-first, not hosted.
- No cloud account is required.
- No Tauri account is required.
- App signing is deferred until public distribution.
- TanStack Store replaces Zustand.
- Prisma/Drizzle will not be used as the universal DB access layer.
