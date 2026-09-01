# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed

- **Workspace query tab colors** — query tabs now use the same connection badge color as the sidebar.

---

## [v1.5.0] — 2026-08-12

### Added

- **Tab context menu** — right-click workspace tabs to close, pin, or duplicate; pinned tabs persist across reloads.
- **Table view editing** — double-click cells to edit inline, toggle between view and edit modes.
- **Landing dashboard milestone** — interactive engine matrix, read-only schema graph demo, and animated hero canvas.
- **AI chat** — active provider shown in the chat panel header; providers with sufficient config auto-enable.

### Changed

- **Desktop UI consistency overhaul** — unified explorer toolbars, structured vector filters, nested JSON rendering, accessible loading/error states, semantic vector-map colors, and notification styling.
- **Vector search UI unification** — shared input heights and states across pgvector/Qdrant/sqlite-vec, migrated Qdrant map to VectorMap3D.
- **Design token foundation** — status colors, shadow tokens, and shared component patterns (EmptyState, LoadingState, ErrorState, ExplorerToolbar, FilterBar).
- **AI chat performance** — optimized re-renders with useMemo/useCallback and cached color conversions in 3D vector map.

### Fixed

- **Sidecar authentication** — packaged sidecar requires a per-session token, CSP enforced, and SQL table-sort identifiers validated against schema metadata.
- **Query safety** — strip SQL comments and string literals before destructive-keyword checks, block SELECT INTO, prevent semicolon-separated batch execution, and stop auto-running AI-generated writes.
- **SAST security fixes** — SQL injection via string concatenation, NoSQL injection, and file inclusion attack.
- **Health check SSE leak** — evict timed-out probes and support immediate abort on SSE cancel.
- **MongoDB autocomplete** — limit concurrent collection sampling to 8 queries to prevent connection overload.
- **Foreign key resolution** — improved resolution logic for schema graph and AI schema context.
- **Chat hook reset** — atomically clear messages and ref on connection switch.
- **Dollar-quoted strings** — ensure delimiters match in SQL safety checks to prevent false positives.

---

## [v1.4.7] — 2026-07-09

### Fixed

- **Windows sidecar startup (EISDIR)** — use `current_dir` + relative `index.js` instead of absolute path with drive letter, avoiding Node.js `realpathSync` bug that caused `EISDIR: illegal operation on a directory, lstat 'C:'`.
- **Linux sidecar startup** — skip `MAX_SUPPORTED_NODE_MAJOR` check when bundled node ABI matches; ensure bundled node binary is executable (`chmod 0o755`).
- **pnpm v10 compatibility** — added `force-legacy-deploy=true` to `.npmrc` so `pnpm deploy` works without `--legacy` flag.
- **Node 24 compatibility** — `rmSync` now uses `recursive: true` for symlink-to-directory removal; `prebuild-install` failure is non-fatal.
- **Max supported Node.js** — raised from 22 to 24 for dev fallback.

---

## [v1.4.6] — 2026-07-06

### Fixed

- **PostgreSQL SSL connections** — added SSL toggle to connection dialog and fixed `ssl` flag not being passed through connection test and health check endpoints.

---

## [v1.4.5] — 2026-07-03

### Fixed

- **Windows sidecar startup** — bundled Node.js binary now resolves with `.exe` extension on Windows, and sidecar path uses forward slashes to prevent `realpathSync` truncation.

---

## [v1.4.4] — 2026-07-03

### Fixed

- **Linux release bundles** — temporarily disabled AppImage packaging in CI while `linuxdeploy` is unreliable; Linux releases still publish `.deb` and `.rpm`. Issue tracked in [#14796](https://github.com/tauri-apps/tauri/issues/14796).

---

## [v1.4.3] — 2026-07-03

### Fixed

- **pnpm deploy compatibility** — removed unsupported `--legacy` flag from `pnpm deploy` in bundle script, fixing CI builds on pnpm 9+.
- **Windows bundle script** — `pnpm deploy` now runs with `shell: true` on Windows so `pnpm.cmd` resolves correctly.
- **Linux release bundles** — temporarily disabled AppImage packaging in CI while `linuxdeploy` is unreliable; Linux releases still publish `.deb` and `.rpm`.

---

## [v1.4.0] — 2026-07-03

### Added

- **DeepSeek AI provider** — direct DeepSeek API access for DeepSeek-V3 (`deepseek-chat`) and DeepSeek-R1 (`deepseek-reasoner`) models via OpenAI-compatible endpoint.
- **Gemini AI provider** — Google AI Studio API access for Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`, etc.) via OpenAI-compatible endpoint.
- **Bundled sidecar** — sidecar `dist/`, production `node_modules/`, and Node.js runtime are bundled into the Tauri app. The sidecar auto-starts on launch and is cleaned up on exit — no manual `pnpm dev:sidecar` needed.
- **Shared package build** — `@kamehadb/shared` compiles to JS so the sidecar resolves it at runtime.
- **Sidecar loading screen** — spinner while the sidecar starts, with an error screen if Node.js is missing or startup fails.

### Fixed

- **Sidecar port detection** — `start_sidecar` reads the runtime port from stdout instead of hardcoding 3170; Tauri allocates a concrete port before spawning instead of `PORT=0`.
- **Packaged sidecar stability** — stdout/stderr are drained after port detection, pnpm symlinks are materialized before bundling, and stale sidecar handles are discarded before restart.
- **Frontend query gating** — TanStack Query waits for the sidecar to be ready before firing requests, preventing "Load failed" errors on app launch.
- **Landing Engine Matrix** — the landing page now includes an interactive engine matrix section with 12 engine cards. Each card shows a type badge (SQL / document / cache / vector / ledger), a supported-features checklist, and a one-click "Try in Docker" snippet with copy-to-clipboard. A filter row lets visitors filter engines by type. Engine data is vendored from `packages/shared` (landing is not in the pnpm workspace) and documented as a manual-sync copy.
- **Landing Schema Graph Demo** — the landing page now embeds an interactive read-only ER diagram (ReactFlow + dagre) that loads instantly from bundled static sample data (5-table e-commerce schema). Nodes are draggable but edges cannot be created — a read-only demo of the desktop app's schema visualization feature.
- **Screenshot Refresh CI** — a new GitHub Actions workflow (`.github/workflows/screenshot-refresh.yml`) runs a Playwright-based capture script (`landing/scripts/capture-images.mjs`) on every release tag (`v*`), refreshing the AI Compare panel screenshots in `landing/public/images/` and committing them back to the repo.
- **Slow-Query Insights** — the query history panel now has a "Slow queries" tab showing the top-10 query patterns by p95 duration. Queries are grouped by a normalized pattern (literals stripped, `IN`-lists collapsed) so semantically equivalent queries with different bind values share a hotspot. Each slow-query row exposes "Suggest index" and "Explain" buttons that pre-seed the AI chat panel (reusing the Phase 4 `pendingAiPrompt` flow) with the normalized pattern, a raw query sample, the p95, and the call count. Normalization and p95 live in a new testable `apps/desktop/src/lib/query-normalize.ts` module (15 vitest cases).
- **AI Chat Schema-Tree Actions** — right-click a table in the schema tree to trigger AI actions: "Explain this schema", "Generate test data", and "Suggest index". Each action opens the AI chat panel with a pre-seeded prompt scoped to the right-clicked table. The sidecar builds table-scoped DDL (via `buildTableSchemaContext`) instead of full-schema DDL for token-efficient, focused AI responses.
- **MCP server** — v1.4.

## [v1.3.4] — 2026-06-28

### Changed

- **Sidecar SQL routes** — split `sql.ts` (975 lines) into focused sub-routers: `sql-vector-pg.ts` for pgvector routes and `sql-vector-sqlite.ts` for sqlite-vec routes, matching the existing `sql-schema.ts` pattern.
- **Shared filter parser** — extracted duplicated filter parsing logic from `postgres-vector-sql.ts` and `sqlite-vector-sql.ts` into `filter-parser.ts`, leaving only engine-specific SQL generation (`$N` vs `?`, `t.` prefix) in each file.

### Fixed

- **TigerBeetle limit validation** — `safeLimit()` helper rejects non-numeric, NaN, zero, and negative values, falling back to default 100 (capped at 1000). Applied to both `/accounts` and `/transfers/:accountId` routes.
- **Redis password propagation** — `getAdapter` now fetches the saved password from `metadataStore.getProfilePassword()` instead of always passing `undefined` to `createRedisDbAdapter`.
- **pgvector sample validation** — `/vectors/sample` now validates table/column existence and vector type before querying, matching the search endpoint's validation.
- **pgvector composite PK** — primary-key selection uses `ctid` fallback for composite primary keys instead of taking only the first column (which is not unique).
- **sqlite-vec sample validation** — both `/sqlite-vec/sample` and `/sqlite-vec/vectors/sample` now validate vec0 table and column existence via shared `validateVec0Table()` helper before querying.
- **sqlite-vec vec0 detection** — replaced fragile `includes('vec0')` substring match with case-insensitive `USING vec0(` regex, preventing false positives/negatives.
- **sqlite-vec column escaping** — `selectCols` now uses `quoteSqlIdentifier()` instead of raw `"${n}"` interpolation.
- **sqlite-vec rowid in search** — `SELECT *` replaced with `SELECT rowid, *` so `SqliteVecSearchHit.id` is always populated.
- **sqlite-vec ILIKE support** — `ILIKE` operator translated to `LIKE ... COLLATE NOCASE` for SQLite compatibility.
- **ClickHouse escaping** — `getTableColumns()` and `getCompletions()` now use `escapeClickHouseVal()` instead of raw string interpolation, matching other catalog queries.
- **MongoDB table cell editing** — `editCell` stores document `_id` instead of row index, preventing wrong-document saves after sorting or refetching.
- **MongoDB field edit guard** — `docId` check changed from falsy (`!docId`) to explicit `null/undefined` check, allowing valid falsy `_id` values (`0`, `false`).
- **MongoDB update matchedCount** — `saveFieldEdit` now checks `result.matchedCount` before calling `onUpdate()`, returning `false` when no document was matched.
- **TanStack Query error logging** — unhandled `QueryCache` and `MutationCache` errors now log to the frontend Logs page via `appendFrontendLog`.
- **MutationCache.onError signature** — fixed parameter order to match TanStack Query v5 (`error, variables, onMutateResult, mutation`), so `mutation.meta` is correctly accessible.

## [v1.3.3] — 2026-06-25

### Added

- **Logs page controls** — clear frontend, Tauri, and sidecar logs directly from the desktop app.

### Fixed

- **MySQL/MariaDB connection validation** — password is now required for MySQL, MariaDB, SQL Server, and Oracle (previously only PostgreSQL was checked).
- **MongoDB default port** — corrected to 27017 so auto-generated connection defaults are valid.
- **Connection URL parsing** — supports protocol aliases like `postgresql://`, `rediss://`, `mongodb+srv://`, and `mssql://`.
- **Username validation** — no longer blocks connection tests for databases that don't need an explicit username.
- **Frontend crash handling** — runtime failures are captured in the app logs and now fall back to an in-app recovery screen instead of failing silently.
- **UI consistency** — buttons, inputs, and textareas now use Shadcn components throughout the desktop app.

### Changed

- **Logs pipeline** — efficient file tailing, no more self-generated poll errors, and sidecar HTTP access logs included.
- **Log security** — deeper secret redaction, sanitized paths, and resilient error normalization in logged output.
- **Linting setup** — shared ESLint rules and package-local hooks/configs now keep desktop and sidecar checks aligned.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.3.2] — 2026-06-23

### Added

- **sqlite-vec 3D vector map** — PCA projection of up to 500 vectors with Three.js scatter plot, hover tooltips, click-to-search, and camera persistence.
- **sqlite-vec bulk sample endpoint** (`/sqlite-vec/sample-bulk`) — discovers vec0 columns and returns vectors with metadata payloads.
- **sqlite-vec structured filter builder** — column/operator/value dropdowns from vec0 metadata, replacing raw SQL filter input.
- **"Map" button** in sqlite-vec search toolbar to open 3D visualization without running a search.
- **Thin scrollbar styling** across all table scroll containers.

### Fixed

- **SQLite "Failed to load sizes"** — vec0 virtual tables filtered from `getDatabaseSizes()` and `searchSchema()`.
- **Table hover color** on prefix/suffix cells — `bg-inherit` for uniform hover.
- **Table scrollbar overlap** — removed redundant `overflow-x-auto` from DataTable inner container.
- **Table rows stretching** with few records — `max-h-full` to shrink to content.
- **Long values breaking layout** — cells truncate with ellipsis and `title` tooltips.
- **Tab bar scrollbar visibility** — hidden while preserving scroll.

### Changed

- **MongoDB cell editing simplified** — inline Input with Enter/Esc/blur, no Save/Cancel buttons.
- **Removed dead "Vector / Raw SQL" toggle** from pgvector and sqlite-vec search UIs.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.3.1] — 2026-06-23

### Fixed

- **Table view in-cell editing** — disable editing for views and show an informational banner when no primary key is present to prevent ambiguous row updates.
- **SQL editor** — trim trailing semicolons before appending LIMIT clause to SQL queries

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen

## [v1.3.0] — 2026-06-21

### Added

- **Schema timeline + diff + migration assistant** — capture schema snapshots on demand, compare two states with per-table change cards, and generate migration SQL from the selected snapshots.
- **PostgreSQL pgvector workflows** — detect vector columns and indexes, run guided vector search, inspect nearest-neighbor results, and open a PCA-based vector map with camera state persistence.
- **Embedded mongosh terminal** — open an interactive MongoDB shell inside the desktop app with PTY support, ANSI colors, resize handling, and session persistence across tab switches. Auto-installs `mongosh` into the app data dir when missing locally.
- **Embedded PostgreSQL PSQL terminal** — open a local `psql` session for any PostgreSQL connection directly inside the desktop app.
- **PostgreSQL backup & restore** — run local `pg_dump`, `pg_restore`, and `psql` workflows from the app with streamed job output.
- **In-app Logs viewer** — unified view for frontend, Tauri, and sidecar logs with source/level filtering, search, and copy support. Frontend errors are forwarded to the Tauri log store; sidecar logs are persisted to `${KAMEHADB_DATA_DIR}/logs/sidecar.log` via pino multistream.

### Changed

- **App.tsx refactor** — extracted `TabBar`, `Workspace`, `WelcomePage`, and `MainLayout` into dedicated modules; added `LogsPage` view and frontend error forwarding.
- **Sidecar logger** — replaced `pino-pretty` with `pino.multistream` for dual stdout + file output.
- Table action columns in the row browser, Mongo document table, and Qdrant points table now pin to the left edge and stay visible during horizontal scroll.

### Fixed

- **Duplicate `MainLayout` declaration** — Vite pre-transform error caused by both importing and declaring `MainLayout` in `App.tsx`; local copy removed.
- **Mongosh `posix_spawnp` failure** — when `mongosh` is not on PATH, the sidecar now falls back to running the bundled `mongosh.js` via `node` instead of trying to spawn a non-existent binary.
- **PSQL binary resolution** — `psql` now resolved via `resolve_postgres_program` instead of hardcoded `"psql"`, matching the backup/restore tool pattern.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.2.0] — 2026-06-12

### Added

- **Query history performance panel** — history grouped by normalized query pattern with duration, favorites filter, and text search.
- **Copy result table as snapshot** — "Copy table" button copies result grid as tab-separated text to clipboard.
- **Global search palette (`Ctrl+K`)** — fuzzy-search across connections, schema tables/columns, open tabs, and quick actions.
- **Connection health badges** — status dot shows connected/slow/reconnecting/offline with latency tooltip.
- **Time-aware welcome screen** — greetings by time of day with returning-visitor rotation.
- **Pin connections to top** — "Pin to top"/"Unpin" in connection dropdown, stored in localStorage.
- **Workspace tabs memory** — open tabs and active tab saved and restored on reload.
- **Sidebar database icons** — engine-specific icons for all supported databases.
- **New adapters** — DuckDB, TigerBeetle, SQL Server, Oracle, ClickHouse.
- **Qdrant v1.13.6 integration** — vector DB added to docker-compose, persistent volume.
- AI schema context uses Qdrant vector search instead of full schema injection.
- AI chat streaming via `@tanstack/ai` — SSE streaming with stop/cancel support.
- Server-side schema search for PostgreSQL, MySQL, SQLite using LIKE queries.
- UI overhaul with shadcn components and table grid system.
- v1.2 MCP server added.

### Changed

- SQL Server, Oracle, ClickHouse adapters refined and standardized.
- Data tables: horizontal scrolling, field visibility, resizable columns, row actions.
- AI provider settings switched to single active-provider model.
- Project license changed from MIT → Apache-2.0.

### Fixed

- Fixed field visibility so newly discovered SQL and Mongo fields remain visible unless explicitly hidden.
- Fixed JSON record rendering, AI chat code-language highlighting, and concurrent streams.
- Fixed stale Redis key lists and TigerBeetle views after mutations.
- Fixed SQL editor incorrectly blocking writes after read-only mode was disabled.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.1.0] — 2026-06-04

### Added

- **Qdrant v1.13.6** integration with Docker compose, persistent volume, and `QdrantSchemaStore` for semantic schema retrieval.
- **AI chat streaming** via `@tanstack/ai` with SSE events and stop/cancel support.
- **Smart term expansion** — canonical expansions for countries, states, currencies, languages.
- **Configurable row limit** dropdown (10–500 rows).
- **Read-only toggle** and **custom color picker** in connection dialog.

### Fixed

- SQL editor ignored read-only setting — redundant client-side check removed.
- Multiple Qdrant stability fixes (stale filters, collection load errors, named vectors, page jumps, connection refresh).
- MySQL `getActiveConnections` contract violations and Qdrant serialization issues.
- AI streaming and schema search edge cases.

### Changed

- `useSchemaSearch` explicit return type, `Switch` component prop interface cleanup.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.0.0] — 2026-06-01

First stable release of KamehaDB — a local-first database GUI for PostgreSQL, MySQL, SQLite, MongoDB, and Redis.

### Highlights

- **AI Chat** — schema-aware assistant with persistent history, multi-provider support, markdown rendering, token tracking, and a Run button to execute SQL from the editor.
- **Landing page v2** — demo video, dark mode, motion animations, SEO, and a dedicated documentation site.
- **SQLite & MySQL parity** — table search, file picker, Browse button, and full database stats matching Postgres.
- **MongoDB & Redis UX** — collection filtering, debounced queries, copy actions, and improved navigation.

### Added

- **Qdrant** — vector DB browsing, three search modes, payload filtering, visual filter builder, 3D vector map with PCA projection.
- **AI Chat** — persistent history, markdown rendering, token tracking, schema caching, Run button for SQL execution.
- **Database Support** — SQLite file selection, MySQL database stats, search filtering.
- **UI & Site** — landing page v2, changelog page, SEO metadata, sidebar quick actions, theme toggle, SQL autocomplete, schema graph visualization.
- Test infrastructure with Vitest and code quality tooling (Husky, Prettier, Commitlint).

### Fixed

- Dark/light mode toggle, landing page responsive layout, SQLite connection test, duplicate auto-run effect, existing table tab switching, chat message timestamp migration.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [0.1.4-beta] — 2026-05-28

### Added

- Database stats quick action to sidebar connection items.

---

## [0.1.3-beta] — 2026-05-28

### Changed

- Updated desktop app branding with new logo and title capitalization.

### Fixed

- Release workflow to handle nested artifact directories.

---

## [0.1.0-beta.1] — 2026-05-28

### Added

- Graph and database stats quick actions to sidebar.
- MongoDB improvements, sidebar state persistence, and code cleanup.
- UI component improvements and bug fixes.
- Static documentation site with landing page, getting started guide, features, and FAQ.

### Fixed

- Release workflow refactored to use artifact upload strategy.

---

## [0.1.0-rc.1] — 2026-05-26

### Added

- AI chat assistant with multi-provider support and API settings management.
- SQL autocomplete with context-aware suggestions for tables, columns, functions, and keywords.
- Interactive schema graph visualization with dagre layout and ReactFlow.
- Connection URL parsing, pagination, and row detail viewer with JSON export.
- Connection editing, deletion, and improved error handling.
- Database and table analytics: size explorer, connection monitoring.
- Theme toggle with light / dark / system modes.
- MongoDB: collection filtering, debounced queries, and enhanced UX with copy functionality.
- Custom color badges for connection profiles.
- Test infrastructure with Vitest and comprehensive test coverage.
- Code quality tooling: Husky, Prettier, Commitlint.
- GitHub Actions CI/CD workflows.
- MIT license and comprehensive README.
