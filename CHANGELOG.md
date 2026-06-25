# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

- v1.4 Adding MCP server
- Fixed lint-staged ESLint execution so pre-commit hooks use package-local ESLint configs.
- Improved the in-app Logs pipeline to tail log files efficiently, avoid self-generated poll errors, and include sidecar HTTP access logs.
- Hardened log handling by redacting more nested secrets, sanitizing logged paths, and making global query error logging resilient to non-standard errors.

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
