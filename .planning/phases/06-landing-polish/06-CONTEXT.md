# Phase 6: Landing Polish - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase elevates the landing site (`landing/`) with three interactive showcases: an engine matrix with status badges and Docker snippets, a screenshot refresh CI workflow keyed off release tags, and a read-only sample ER diagram demo using ReactFlow + dagre with bundled static data.

Scope: `landing/` (Next.js marketing site, npm-managed, NOT in pnpm workspace) and `.github/workflows/` (new CI workflow). No desktop app, sidecar, or `packages/shared` changes are required.

Out of scope: live database connections from the landing site, editable schema graphs, server-side screenshot rendering, and changes to the desktop app's schema-graph component.

</domain>

<system>
## Relevant Codebase

### Landing site — `landing/`

- Next.js 16 app-router project, managed with npm (separate `package-lock.json`).
- `landing/src/components/home-view.tsx` — the single-page landing component (1001 lines). Contains hero, engine carousel, demo video, AI Compare panel, features grid, install section, CTA, footer.
- `landing/src/app/page.tsx` — server component that fetches GitHub stars and renders `<HomeView>`.
- `landing/src/app/layout.tsx` — metadata, JSON-LD, fonts.
- `landing/src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge).
- `landing/src/components/ui/compare.tsx` — before/after image slider used for AI Compare panels.
- `landing/public/images/` — `chat-panel.png`, `sql-panel.png`, `tigerbeetle.svg`.
- Landing uses `lucide-react` (v1.17.0), `motion` (framer-motion successor), `thesvg` for brand logos, `next-themes` for dark mode.
- Tailwind v4 with `@theme inline` custom properties (`--color-canvas`, `--color-surface-strong`, `--color-ink`, `--color-body`, `--color-muted`, `--color-border`, amber/rose brand colors).

### Canonical engine list — `packages/shared/src/schemas.ts`

- `KIND` object: postgres, sqlite, mysql, redis, mongodb, qdrant, sqlserver, oracle, clickhouse, mariadb, duckdb, tigerbeetle (12 engines).
- `ALL_KINDS`, `SQL_KINDS`, `NOSQL_KINDS` arrays.
- `DEFAULT_PORTS` record.
- `isSqlKind()`, `isNoSqlKind()`, `isFileDatabaseKind()` helpers.
- **Constraint:** `landing/` is NOT in the pnpm workspace and cannot import `@kamehadb/shared`. The engine list must be vendored into the landing project as a static data file, kept in sync manually (documented).

### Desktop schema graph — `apps/desktop/src/components/schema-graph.tsx`

- Uses `@xyflow/react` (ReactFlow v12) + `dagre` for ER diagram layout.
- `buildGraph(data)` converts a `CompletionsData` shape (tables with columns, PK/FK) into ReactFlow nodes/edges via dagre layout.
- `TableNode` renders a card with column list, PK/FK indicators.
- The landing demo will replicate this pattern with a bundled static sample schema (no API call).

### Existing CI workflows — `.github/workflows/`

- `ci.yml` — runs on push/PR to main: typecheck, lint, test, build, tauri build.
- `release.yml` — runs on `v*` tag push: creates draft release, builds platform bundles, uploads assets.
- No screenshot capture workflow exists yet.
- `landing/scripts/capture-images.mjs` does NOT exist yet (referenced in AGENTS.md but never created).

### AGENTS.md public-surface drift prevention

When adding landing features, sync these five surfaces:

1. `landing/src/components/home-view.tsx`
2. `landing/src/app/layout.tsx`
3. `landing/public/og-image.svg`
4. `landing/public/images/`
5. `README.md`

</system>

<decisions>
## Implementation Decisions

### Engine Matrix (06-01)

- **D-01:** The engine matrix is a new section in `home-view.tsx` placed between the "Why KamehaDB" section and the "AI Query Generation" section. It renders a responsive grid of cards, one per engine (12 engines). Each card shows: engine name, a type badge (SQL / document / cache / vector / ledger), a supported-features checklist, and a "Try in Docker" snippet with a copy button.
- **D-02:** The engine data is vendored into `landing/src/lib/engines.ts` as a static typed array. It mirrors the canonical `KIND` / `ALL_KINDS` / `SQL_KINDS` / `NOSQL_KINDS` from `packages/shared`. A comment documents that this is a manual-sync vendored copy (landing is not in the pnpm workspace). The file exports `ENGINES` (array of engine objects), `ENGINE_TYPES` (badge type union), and helper functions.
- **D-03:** Each engine card has a type badge with a color scheme: SQL = blue, document = green, cache = red, vector = purple, ledger = amber. The badge uses the existing Tailwind color classes pattern from `whyKamehadb` providers. Features are shown as a compact checklist with check/cross icons. The "Try in Docker" snippet is a `<pre>` block with a copy-to-clipboard button (using `navigator.clipboard.writeText`). File-based engines (SQLite, DuckDB) show a file-path snippet instead of a Docker command.
- **D-04:** The matrix is interactive: clicking a card expands/collapses the Docker snippet section. A filter row at the top lets visitors filter by type badge (All / SQL / Document / Cache / Vector / Ledger). This satisfies "interactive engine matrix."

### Screenshot CI (06-02)

- **D-05:** A new `landing/scripts/capture-images.mjs` script uses Playwright (already a devDependency in landing) to start the landing dev server, navigate to the AI Compare section, and screenshot `chat-panel.png` and `sql-panel.png` into `landing/public/images/`. The script is idempotent and can run locally (`node landing/scripts/capture-images.mjs`) or in CI.
- **D-06:** A new `.github/workflows/screenshot-refresh.yml` workflow triggers on `v*` tag push (same trigger as release.yml). It checks out the repo, sets up Node, installs landing deps via npm, runs the capture script, and commits updated images back to the release tag using `stefanzweifel/git-auto-commit-action`. The workflow has `permissions: contents: write`. This satisfies "runs on every release tag and commits updated images."

### Schema Graph Demo (06-03)

- **D-07:** Install `@xyflow/react` and `dagre` (+ `@types/dagre`) as dependencies in the landing project via npm. These are the same packages used by the desktop app's schema-graph component, ensuring visual consistency.
- **D-08:** A bundled static sample schema is created at `landing/src/lib/sample-schema.ts`. It exports a `CompletionsData`-shaped object (matching the desktop's shape: tables with name, schema, columns with name/type/primaryKey/foreignKey) representing a small e-commerce schema (users, orders, products, reviews, categories — 5 tables with FK relationships). This loads instantly with no API call.
- **D-09:** A new `landing/src/components/schema-graph-demo.tsx` client component renders a read-only ReactFlow graph using the bundled sample schema. It reuses the dagre layout pattern from the desktop `schema-graph.tsx` (buildGraph → nodes/edges → ReactFlow with Background, Controls, MiniMap). Nodes are not clickable (no `openTab`), edges are styled identically. `nodesDraggable` is kept true (visitors can rearrange) but `nodesConnectable={false}` and `elementsSelectable` — read-only, no edge creation. The demo is embedded in a new section in `home-view.tsx` between the features grid and the install section.
- **D-10:** The schema graph demo section includes a heading ("See your schema, visualized") and a short subtitle explaining that this is a live read-only ER diagram rendered from bundled sample data. The ReactFlow canvas is wrapped in a themed container matching the landing's dark/light mode.

</decisions>

<constraints>
## Constraints

- `landing/` is NOT in the pnpm workspace — use `npm --prefix landing` for all landing operations.
- `pnpm -r typecheck` covers workspace packages only; landing typecheck is `npm --prefix landing run build` (Next.js build includes type checking) or `npx --prefix landing tsc --noEmit`.
- AGENTS.md public-surface drift: update `home-view.tsx`, `layout.tsx` (if metadata changes), `README.md` (if engine list changes), and `public/images/` (via the new capture script).
- No magic strings: engine kind values in the vendored `engines.ts` must match the canonical `KIND` values from `packages/shared/src/schemas.ts` exactly.
- Surgical changes: only `landing/` files, `.github/workflows/`, `CHANGELOG.md`, `README.md`, and `.planning/` files are touched. No desktop or sidecar changes.
- Commit messages must NOT include "Co-Authored-By" or "Generated with Devin".
- Run typecheck before committing.

</constraints>
