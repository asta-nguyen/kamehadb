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

## Operational Rules

- **Package Manager**: ALWAYS use `pnpm` for this project, except for the `landing/` directory which is managed via `npm`.
- **Changelog**: All user-facing changes must be recorded in `CHANGELOG.md` under `[Unreleased]` before merging.

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

<!-- headroom:rtk-instructions -->

# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands

```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules

- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
