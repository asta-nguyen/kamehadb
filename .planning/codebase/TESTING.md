---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: quality
---

# Testing

## Current State

**No test files exist in the project.** The testing infrastructure is configured but no tests have been written.

## Testing Infrastructure

### Desktop (`apps/desktop/`)

- **Framework:** Vitest ^4.1.7
- **Config:** `apps/desktop/vite.config.ts` — `test: { include: ['src/**/*.test.ts'] }`
- **Script:** `pnpm --filter @kamehadb/desktop test` → `vitest run`
- **CI:** `.github/workflows/ci.yml` runs `pnpm --filter @kamehadb/desktop test` in the `test` job

### Landing (`landing/`)

- **Framework:** Playwright ^1.60.0
- **Script:** No explicit test script in `package.json` (Playwright is a devDependency)
- **Image capture:** `node scripts/capture-images.mjs` for AI Compare panel screenshots

### Sidecar (`apps/sidecar/`)

- **No test framework configured** — no `test` script in `package.json`
- No test dependencies installed

### Shared (`packages/shared/`)

- **No test framework configured** — no `test` script in `package.json`

## CI Testing Pipeline

From `.github/workflows/ci.yml`:

```
test job:
  1. pnpm install --frozen-lockfile
  2. pnpm typecheck
  3. pnpm lint
  4. pnpm --filter @kamehadb/desktop test  ← runs vitest (currently 0 tests)

build-check job:
  1. pnpm install --frozen-lockfile
  2. pnpm build
  3. pnpm --filter @kamehadb/desktop tauri build
```

## Rust Testing

- **Framework:** Rust built-in (`cargo test`)
- **Location:** `apps/desktop/src-tauri/`
- **CI:** Not explicitly run in CI, but AGENTS.md recommends `cargo test --quiet` for native changes
- **Command:** `cargo test --quiet` (from `apps/desktop/src-tauri/`)

## Test File Location Convention

Based on Vitest config:

- Desktop tests: `apps/desktop/src/**/*.test.ts`
- Test files should be co-located with source files (e.g., `table-editability.test.ts` next to `table-editability.ts`)

## What Should Be Tested (Gaps)

### Sidecar

- **Adapter tests:** Each of the 12 DB adapters (`adapters/*.ts`) should have integration tests
- **Route tests:** Hono route handlers should have HTTP-level tests
- **Metadata store:** SQLite persistence layer (`db/metadata-store.ts`)
- **Schema diff/migration:** `lib/schema-diff.ts`, `lib/schema-migration.ts`
- **AI provider:** `ai/provider.ts`, `ai/vec-store.ts`

### Desktop

- **Utility functions:** `lib/export.ts`, `lib/sql-autocomplete.ts`, `lib/mongo-autocomplete.ts`, `lib/table-editability.ts`
- **Store logic:** `store/workspace-tabs.ts` tab lifecycle
- **Constants/helpers:** `lib/constants.ts`, `lib/types.ts`

### Shared

- **Zod schemas:** `schemas.ts` validation
- **Schema tools:** `schema-tools.ts`, `term-expansion.ts`

## Mocking Strategy (Not Yet Established)

No mocking infrastructure exists. When tests are added:

- **Sidecar:** Mock DB drivers (pg, mysql2, mongodb, etc.) at the adapter level
- **Desktop:** Mock `api-client.ts` fetch calls, mock Tauri IPC (`lib/tauri.ts`)
- **Shared:** Pure functions, no mocking needed

## Coverage

- **No coverage tooling configured** (no `@vitest/coverage-*` package)
- **No coverage thresholds** in CI
