# AGENTS.md

This file provides guidance for coding agents working in this repository.

## Project Overview

KamehaDB is a local-first database GUI centered on a Tauri desktop app plus a local Node sidecar. The current app supports PostgreSQL, MySQL, SQLite, MongoDB, Redis, Qdrant, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB, and TigerBeetle. It includes schema browsing, a Monaco SQL editor, query history, PostgreSQL stats views, schema timeline/diff workflows, Redis/Mongo/Qdrant/TigerBeetle explorers, embedded PostgreSQL and Mongo shells, PostgreSQL backup/restore flows, pgvector exploration tools, an in-app logs viewer, and an AI chat panel with schema-aware context.

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
- Most root scripts target the pnpm workspace only. Do not assume they affect `landing/` unless they explicitly use `npm --prefix landing`.
- Landing site image generation: use `node scripts/capture-images.mjs` to update the AI Compare panel screenshots in `public/images/`.

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

# Landing site
npm --prefix landing run dev
npm --prefix landing run build
npm --prefix landing run lint
node landing/scripts/capture-images.mjs # Regenerate AI compare panels
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
- Runtime logs are also written under `${KAMEHADB_DATA_DIR}/logs/` when the app data dir is available
- The sidecar prints `KAMEHADB_SIDECAR_PORT=<port>` on startup

Current route groups:

- `/connections` for saved connection profiles and connection health checks
- `/sql` for SQL metadata, query execution, preview rows, autocomplete, and PostgreSQL stats
- `/query-history` for saved SQL history and favorites
- `/mongo` for MongoDB databases, collections, documents, stats, update/delete
- `/redis` for key scanning, value lookup, TTL lookup, and connection testing
- `/qdrant` for vector collections, point browsing, search, recommend, and stats
- `/tigerbeetle` for accounts, balances, and transfers
- `/ai` for provider settings, chat, schema cache, and chat history

Important sidecar internals:

- `apps/sidecar/src/db/metadata-store.ts` persists connections, AI settings, and chat history
- `apps/sidecar/src/lib/cache.ts` caches schema and metadata results
- `apps/sidecar/src/lib/sql-safety.ts` contains SQL safety helpers used by the backend
- `apps/sidecar/src/lib/mongosh.ts` resolves a local `mongosh` binary or installs an app-managed copy under the app data directory
- `apps/sidecar/src/lib/logger.ts` exports the shared pino logger (`log`) for the entire sidecar. All sidecar code must import `log` from this module instead of using `console.log`.
- `apps/sidecar/src/ai/` contains provider abstraction and schema-context generation

### Desktop app

`apps/desktop/src/App.tsx` drives the top-level app views (`workspace`, `api-settings`, `logs`) and the tabbed workspace.

Main areas:

- `components/sidebar.tsx` for connection and schema navigation
- `components/workspace-screen.tsx`, `components/workspace-tab-bar.tsx`, and `components/workspace-content.tsx` for tab orchestration
- `components/sql-editor.tsx` for Monaco query editing and execution
- `components/table-view.tsx` for SQL table browsing
- `components/schema-graph.tsx` for ER diagrams
- `components/schema-timeline.tsx`, `components/schema-diff-view.tsx`, and `components/migration-assistant.tsx` for schema change workflows
- `components/database-stats.tsx` and `components/table-stats.tsx` for PostgreSQL metrics
- `components/postgres-psql-tab.tsx`, `components/postgres-backup-dialog.tsx`, and `components/postgres-restore-dialog.tsx` for PostgreSQL maintenance workflows
- `components/postgres-vector-query.tsx` and `components/postgres-vector-map.tsx` for pgvector search and map views
- `components/mongo-view.tsx`, `components/mongo-shell.tsx`, `components/redis-view.tsx`, `components/qdrant-view.tsx`, `components/qdrant-query.tsx`, `components/qdrant-vector-map.tsx`, `components/qdrant-stats.tsx`, and `components/tigerbeetle-explorer.tsx` for non-SQL engines
- `components/query-history-panel.tsx` for saved SQL history/favorites
- `components/logs-page.tsx` for viewing frontend, Tauri, and sidecar logs inside the app
- `components/ai-chat-panel.tsx` and `components/api-settings-page.tsx` for AI

State and data flow:

- `apps/desktop/src/store/index.ts` uses TanStack Store for workspace state
- `apps/desktop/src/hooks/` contains TanStack Query-based data hooks
- `apps/desktop/src/lib/api.ts` talks to the sidecar at `http://127.0.0.1:3170` by default
- `apps/desktop/src/lib/sql-autocomplete.ts` contains client-side SQL completion logic
- `apps/desktop/src/lib/app-logs.ts` sends frontend errors to Tauri and reads the combined log snapshot for the Logs page
- `apps/desktop/src-tauri/src/` contains native commands for app logs, PostgreSQL `psql`, and PostgreSQL backup/restore jobs

## Database Support

Supported now:

- PostgreSQL
- MySQL
- SQLite
- MongoDB
- Redis
- Qdrant
- SQL Server
- Oracle
- ClickHouse
- DuckDB
- TigerBeetle
- MariaDB

Notes:

- PostgreSQL has the richest stats support.
- PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, and DuckDB use the SQL adapter path.
- MongoDB uses a dedicated route and adapter flow.
- Redis uses a dedicated route and adapter flow, not the SQL route.
- Qdrant uses a dedicated route and adapter flow for collections, points, similarity search, recommend, and stats.
- DuckDB connects to local .duckdb files (file-based).
- TigerBeetle uses a dedicated adapter and connects to a local or remote TigerBeetle cluster.
- PostgreSQL also has app-managed `psql`, backup, restore, schema diff/timeline, and pgvector workflows on the desktop side.
- MongoDB can open an embedded `mongosh` session; if `mongosh` is missing locally, the sidecar can install an app-managed copy without modifying the user's global installation.

## Connection Defaults For Docker

| Engine      | Port | User    | Password | Database |
| ----------- | ---- | ------- | -------- | -------- |
| PostgreSQL  | 5432 | kameha  | kameha   | kamehadb |
| MySQL       | 3306 | kameha  | kameha   | kamehadb |
| MariaDB     | 3307 | kameha  | kameha   | kamehadb |
| Redis       | 6379 | —       | —        | —        |
| SQL Server  | 1433 | sa      | Kameha1! | kamehadb |
| Oracle      | 1521 | SYS     | oracle   | ORCLPDB1 |
| ClickHouse  | 8123 | default | default  | kamehadb |
| DuckDB      | 5432 | —       | —        | —        |
| TigerBeetle | 3001 | —       | —        | —        |

### TigerBeetle Initialization

TigerBeetle requires a one-time `format` step before first start. The docker-compose entrypoint auto-detects missing data files and runs format automatically.

To seed sample data (accounts + transfers):

```bash
docker compose up -d tigerbeetle     # Start (auto-formats if first run)
pnpm seed:tigerbeetle                # Create sample accounts + transfers
```

Or from the sidecar package:

```bash
pnpm --filter @kamehadb/sidecar seed:tigerbeetle
```

Override connection with env vars: `TB_HOST`, `TB_PORT`, `TB_CLUSTER_ID`.

## Testing And Verification

- `pnpm test` currently depends mainly on workspace packages that expose a `test` script
- The desktop package uses `vitest run`
- Native desktop changes should also be verified with `cargo test --quiet` in `apps/desktop/src-tauri` when they touch Tauri commands or Rust-side process management
- CI currently runs `pnpm typecheck`, `pnpm --filter @kamehadb/desktop test`, `pnpm build`, and a full `tauri build`
- When changing sidecar contracts, verify both `packages/shared` types and desktop usage
- When changing desktop UI behavior, prefer running the desktop tests and a targeted app build

## Logs And Diagnostics

- The desktop app exposes a built-in Logs page that reads frontend, Tauri, and sidecar logs from one place.
- Frontend runtime errors are forwarded through `apps/desktop/src/lib/app-logs.ts` into the Tauri log store.
- Sidecar logs are produced by pino via `apps/sidecar/src/lib/logger.ts` and persisted to `${KAMEHADB_DATA_DIR}/logs/sidecar.log` (or `<workspace>/logs/sidecar.log` in dev mode when `KAMEHADB_DATA_DIR` is unset).
- Tauri logs are written by Rust code via `append_tauri_log()` in `apps/desktop/src-tauri/src/app_logs.rs` to `${app_data_dir}/logs/tauri.log`.
- The Tauri command `read_app_logs` in `app_logs.rs` reads all three log files (`frontend.log`, `tauri.log`, `sidecar.log`) from `${app_data_dir}/logs/` and merges them into a single snapshot.
- In dev mode (`pnpm dev`, Vite browser without Tauri runtime), `readAppLogs()` falls back to localStorage and only frontend logs are visible. Tauri and sidecar logs require the built Tauri app.
- If a bundled workflow fails only in the built app, check the in-app Logs page first, then inspect `${KAMEHADB_DATA_DIR}/logs/` if you need the raw files.

### Sidecar Logger Usage

- **Never use `console.log` in sidecar code.** ESLint enforces this via `local/no-restricted-syntax`.
- Import the shared pino logger: `import { log } from '../lib/logger.js';`
- Use `log.info()`, `log.warn()`, `log.error()`, `log.debug()` instead of `console.log()` / `console.warn()` / `console.error()`.
- The only exception is `console.log('KAMEHADB_SIDECAR_PORT=...')` in `index.ts` which is intentionally stdout for Tauri to parse the port — it has an inline `eslint-disable` comment.
- Pino writes to both stdout and `${KAMEHADB_DATA_DIR}/logs/sidecar.log` via multistream.
- The Tauri Rust side parses pino's JSON output from `sidecar.log` (see `parse_sidecar_log_line` in `app_logs.rs`).

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

## Behavioral Guidelines

These guidelines prioritize caution and precision over speed.

### 1. Think Before Coding

- **No Assumptions**: Surface tradeoffs explicitly. If uncertain or multiple interpretations exist, ask before picking.
- **Push Back**: If a simpler approach exists or the requested path is flawed, suggest an alternative.
- **Clarify First**: If a request is unclear, stop and name the specific confusion.

### 2. Simplicity First

- **Minimum Viable Code**: Implement only what is asked. No speculative features or "future-proofing."
- **No Over-Abstraction**: Avoid abstractions for single-use code.
- **Surgical Error Handling**: Do not add error handling for impossible scenarios.
- **Aggressive Simplification**: If a solution is overcomplicated, rewrite it to be simpler.

### 3. Surgical Changes

- **Zero Collateral Damage**: Do not "improve" adjacent code, comments, or formatting.
- **Style Match**: Match the existing codebase style strictly, even if you prefer another pattern.
- **Orphan Cleanup**: Remove imports/variables that YOUR changes made unused. Do not touch pre-existing dead code unless asked.
- **Traceability**: Every changed line must trace directly back to the user's request.

### 4. Goal-Driven Execution

- **Verifiable Goals**: Transform "fix bug" into "write reproducing test $\rightarrow$ make it pass."
- **Structured Plans**: For multi-step tasks, define: `[Step] $\rightarrow$ verify: [check]`.
- **Verification Gate**: No task is "done" until success criteria are verified via tool output.

### 5. Always Use shadcn Components

- **Rule**: ALWAYS use the shadcn UI components from `apps/desktop/src/components/ui/` instead of raw HTML elements when an equivalent exists.
- **Available components** (in `ui/`): `Button`, `Input`, `Textarea`, `Label`, `Select` (+ parts), `Table` (+ parts), `Card`, `Badge`, `Dialog`, `Sheet`, `DropdownMenu`, `Tabs`, `Tooltip`, `ScrollArea`, `Progress`, `Separator`, `Command`, `Sonner` toaster.
- **Mapping**:
  - `<input>` → `<Input>`
  - `<textarea>` → `<Textarea>`
  - `<label>` → `<Label>`
  - `<button>` → `<Button>` (use `variant`/`size` props, not bespoke className hacks)
  - `<select>` → `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` + `<SelectValue>`
  - `<table>/<thead>/<tbody>/<tr>/<th>/<td>` → `<Table>/<TableHeader>/<TableBody>/<TableRow>/<TableHead>/<TableCell>`
- **No new shadcn components without a shadcn CLI install** — if a shadcn component does not exist in `ui/`, install it via the shadcn CLI before using it; never hand-roll a parallel component.
- **Acceptable exceptions** (document the reason inline): buttons required by a third-party library (e.g. React Flow's `<Controls>`), elements with required `role` attributes that shadcn doesn't expose (e.g. `role="switch"` toggles).

### 6. No Magic Strings or Numbers

- **Rule**: Never hardcode database kind strings (e.g. `'postgres'`, `'mysql'`), port numbers, timeout values, or cache durations as literals in application code. Always use the shared constants.
- **Use `KIND` from `@kamehadb/shared`**: All database kind comparisons must use `KIND.POSTGRES`, `KIND.MYSQL`, etc. — never raw string literals.
- **Use `DEFAULT_PORTS`**: All port numbers must come from `DEFAULT_PORTS[KIND.X]` — never hardcode `5432`, `3306`, etc.
- **Use timeout constants**: All timeouts, cache durations, and intervals must use named constants from `apps/sidecar/src/lib/constants.ts` or `apps/desktop/src/lib/constants.ts` — never inline `5000`, `30000`, etc.
- **Use `ALL_KINDS`, `SQL_KINDS`, `NOSQL_KINDS`**: When iterating over or validating database kinds, use these arrays — never inline a list of kind strings.
- **Use helper functions**: `isSqlKind()`, `isNoSqlKind()`, `isPasswordRequired()`, `isFileDatabaseKind()` — never write manual `kind === 'postgres' || kind === 'mysql'` chains.
- **Use `PROTOCOL_ALIASES`**: For URL protocol parsing, use the shared `PROTOCOL_ALIASES` map — never hardcode `'postgresql'` or `'rediss'`.
- **Zod enums**: Use `z.enum(ALL_KINDS as [string, ...string[]])` — never inline a list of kind string literals.
- **SQL CHECK constraints**: Generate from `ALL_KINDS` — never inline a list of kind string literals.
- **Exception**: String literals inside SQL query text (e.g. `'mysql' AS applicationName`) are SQL values, not DbKind comparisons — these are acceptable.
- **Exception**: Minor query config values like `retry: 1` are not considered magic numbers.

### 7. Always Comment Non-Trivial Code (How / Why / What)

- **Rule**: Every non-trivial function, hook, or block of logic must carry a short comment that explains the **what** (one line), the **why** (one line of intent / tradeoff), and the **how** only when the mechanism is non-obvious.
- **What is "non-trivial"**: anything that isn't a one-liner that re-states its name. Trivial `return x + 1` lines don't need a comment. A new function, a hook, a state machine, a tricky expression, a side effect, a workaround — these all do.
- **Comment style** (match the existing project style; short, plain prose):
  ```ts
  // Resize a column by direct DOM mutation during the drag for smoothness,
  // then commit the final pixel width to React state on mouseup so re-renders
  // only happen once per drag. (How / Why / What)
  ```
- **Bad**: comments that just repeat the function name (`// Increments counter`), comments that lie, comments without intent ("TODO" without context).
- **Good**: comments that name the tradeoff, call out a workaround, or document a non-obvious invariant.
- **No section-header comment walls** — keep comments tight and attached to the code they describe.

## File Search

For any file search or grep in the current git-indexed directory, use fff tools (`ffgrep`, `fffind`) instead of glob or grep. fff is the MCP server at `~/.local/bin/fff-mcp` — it's faster, supports smart-case with fuzzy fallback, frecency-ranked results, and git-aware annotations.

## Operational Rules

- **Package Manager**: ALWAYS use `pnpm` for this project, except for the `landing/` directory which is managed via `npm`.
- **Changelog**: All user-facing changes must be recorded in `CHANGELOG.md` under `[Unreleased]` before merging.

## Public-Surface Drift Prevention

When a feature wave adds new engines, major workflows, or changes the product descriptor, sync these five surfaces in the same PR so they do not drift:

1. **`landing/src/components/home-view.tsx`** — hero copy, engine carousel, feature cards, Compare panel screenshots
2. **`landing/src/app/layout.tsx`** — `<title>`, `<meta name="description">`, keywords, OG/Twitter metadata
3. **`landing/public/og-image.svg`** — the OG card text (matches the hero headline)
4. **`landing/public/images/`** — Compare panel screenshots (`sql-panel.png`, `chat-panel.png`, plus any new ones)
5. **`README.md`** — one-liner, feature list, engine table, install docs

Run `npm --prefix landing run build` and `pnpm build` after any landing or README change to confirm nothing is broken.

After every material product change, run through this list before merging.

## TypeScript Coding Standards

These rules apply to all TypeScript code in `apps/`, `packages/`, and `landing/`.

### No Code Duplication

- Reuse Zod schemas and types from `packages/shared/src/index.ts` — it is the source of truth
- If the same shape appears in two places, extract it into a shared type or helper
- For logic duplicated across desktop and sidecar, promote it to `packages/shared` or a co-located utility

### Use Types

- Annotate exported functions, public APIs, and component props explicitly
- Use `interface` for object shapes, `type` for unions, mapped types, and utility compositions
- Never use `any` — use `unknown` and narrow with type guards

### Use Union Types

- Prefer string literal unions over enums:

  ```typescript
  type QueryStatus = 'idle' | 'running' | 'success' | 'error';
  ```

- When a value can be one of several shapes, model it as a discriminated union (see below)

### Emit Type When Possible

Derive types from values so runtime and types stay in sync:

```typescript
// typeof for object literals
const ADAPTER_LIMITS = { postgres: 100, mysql: 50 } as const;
type AdapterLimits = typeof ADAPTER_LIMITS;

// ReturnType / Awaited for function and promise return types
type Connection = Awaited<ReturnType<typeof loadConnection>>;

// z.infer for Zod schemas
const connectionSchema = z.object({ host: z.string(), port: z.number() });
type ConnectionInput = z.infer<typeof connectionSchema>;
```

This avoids drift between the schema and the type.

### Discriminated Unions

Use a literal "tag" field so the compiler narrows automatically:

```typescript
type SqlResult =
  | { kind: 'rows'; columns: string[]; rows: unknown[][] }
  | { kind: 'affected'; count: number }
  | { kind: 'error'; message: string };

function format(result: SqlResult): string {
  switch (result.kind) {
    case 'rows':
      return `${result.rows.length} rows`;
    case 'affected':
      return `${result.count} affected`;
    case 'error':
      return result.message;
  }
}
```

- Use `kind`, `type`, or `status` as the discriminator field — pick one and stay consistent
- Use `as const` on values that feed the union so literal types are preserved
- Exhaustive `switch` with a `never` default catches missed branches at compile time

## Code Comments

For code that is long or has moderate-to-high complexity, add clear comments. Trivial code stays uncommented — match the existing density in the file.

### When To Comment

- A function or block runs past ~30 lines
- Logic has non-obvious branches, side effects, or invariants
- Magic numbers, regex, or domain-specific constants appear
- Async, timing, retry, or concurrency behavior is hard to follow
- The reader would have to hold more than 2–3 things in their head at once

### What To Write

- **Why** the code exists or **why** this approach was chosen
- Non-obvious invariants: "this list is always sorted by `createdAt` desc"
- Correctness or performance tradeoffs the code encodes
- Pointer to the ticket, spec, or external constraint that drove the decision

### What To Skip

- Restating what the code does in English
- Section banners like `// ============ Validation ============`
- Comments that just rename a variable or repeat the line below

```typescript
// GOOD: explains the why
// SQLite returns BigInt for INTEGER columns; clamp to MAX_SAFE_INTEGER
// to avoid JSON serialization precision loss above 2^53.
const id = Number(row.id % Number.MAX_SAFE_INTEGER);

// BAD: restates the what
// Convert id to number
const id = Number(row.id);
```

### Style

- One short line per comment is the default; multi-line only when truly needed
- Place the comment above the line it explains, not as a trailing line
- Use full sentences with proper punctuation; no "TODO later" or "fix me" leftovers
