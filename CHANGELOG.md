# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

- v1.3 Adding MCP server

### Changed

- Table action columns in the row browser, Mongo document table, and Qdrant points table now pin to the left edge and stay visible during horizontal scroll.

---

## [v1.2.0] — 2026-06-12

### Added

#### Database Support

- Added SQL Server, Oracle, ClickHouse, DuckDB, and TigerBeetle adapters. ([@JoeJoeflyn])
- Added Docker Compose services and seed tooling for DuckDB and TigerBeetle. ([@JoeJoeflyn])

#### Schema & Queries

- Added a Migration Assistant that compares schema snapshots and generates migration DDL. ([@JoeJoeflyn])
- Added a schema change timeline for tracking table, column, index, and type changes. ([@JoeJoeflyn])
- Added persistent query history with favorites, text search, and performance grouping. ([@JoeJoeflyn])
- Added a global search palette (`Ctrl+K`) for connections, schema objects, tabs, and quick actions. ([@JoeJoeflyn])
- Added result-table snapshot copying as tab-separated text. ([@JoeJoeflyn])

#### UI & UX

- Added connection health badges, connection detail tooltips, and pinned connections.
- Added workspace tab persistence, engine-specific database icons, and a time-aware welcome screen.

### Changed

- SQL and Mongo data tables now support horizontal scrolling, field visibility controls, resizable columns, and explicit row actions.
- Desktop forms and data tables now use shared UI components for more consistent behavior and styling. ([@JoeJoeflyn])
- AI provider settings now use a single active-provider model.
- Qdrant vector maps now persist color and camera state across tab switches.
- Project license changed from MIT to Apache-2.0.

### Fixed

- Fixed field visibility so newly discovered SQL and Mongo fields remain visible unless explicitly hidden.
- Fixed JSON record rendering and AI chat code-language highlighting. ([@JoeJoeflyn])
- Fixed AI chat loading indicators, code highlighting, and concurrent streams updating the wrong assistant message.
- Fixed stale Redis key lists and TigerBeetle account, transfer, and balance views after mutations.
- Fixed TigerBeetle seed retries creating duplicate saved connections.
- Fixed the SQL editor incorrectly blocking writes after read-only mode was disabled.
- Fixed sidebar connection-name and Mongo document-value alignment.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.1.0] — 2026-06-04

### Added

#### AI & Vector Search

- **Qdrant v1.13.6** integration — new vector database dependency added to `docker-compose.yml`, exposed on ports `6333` (HTTP) and `6334` (gRPC) with a persistent `qdrant_data` volume. Start with `docker compose up -d qdrant` or `docker compose up -d` for the full stack. Sidecar connects via `QDRANT_URL` (default: `http://127.0.0.1:6333`).
- **`QdrantSchemaStore`** (`apps/sidecar/src/ai/qdrant-store.ts`) — handles collection creation, DDL embedding upsert, and similarity search. Falls back to full-DDL injection if Qdrant is unreachable, so chat remains functional.
- **Semantic schema retrieval** — sidecar now embeds each table's DDL into Qdrant on first use and retrieves only relevant tables per query via vector similarity, replacing full-schema injection in the system prompt.
- **Proactive schema indexing at startup** — enriched embedding text (column purpose, table purpose, DDL), hash-based incremental sync, and orphan cleanup on startup. ([@JoeJoeflyn])
- **AI chat streaming** via `@tanstack/ai` — `POST /ai/chat` now streams SSE events; client uses `useChat()` for real-time response rendering with stop/cancel support. ([@JoeJoeflyn])
- **Smart term expansion** — canonical expansions for countries, US states, currencies, languages, and common abbreviations (e.g. `"germany"` → `DE`, `"CA"` → California/Canada) injected as data the assistant must consume verbatim in `WHERE` filters. Implemented as `expandTerms` / `renderExpansionsForPrompt` in `@kamehadb/shared`.
- **Case-insensitive fuzzy matching in system prompt** — assistant now splits user terms on non-alphanumeric characters and ORs unanchored and prefix-anchored variants, preventing silent empty result sets when stored values differ from user phrasing (e.g. punctuation, plurals, codes vs. names across PostgreSQL, MySQL, SQLite, MongoDB, and Redis).
- **Server-side schema search** for PostgreSQL, MySQL, and SQLite using `ILIKE`/`LIKE` queries. ([@JoeJoeflyn])
- **Client-side fuzzy table name filtering** in the schema tree (`fuzzyMatch` utility). ([@JoeJoeflyn])

#### UI & UX

- **Configurable row limit dropdown** (10–500 rows) in the table data view. ([@JoeJoeflyn])
- **Read-only toggle** in the connection dialog — enables write statements (`CREATE`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, etc.) per connection without editing the metadata DB directly. ([@asta-nguyen])
- **Custom color picker** in the connection dialog — native `<input type="color">` alongside the 8 preset badge colors. ([@asta-nguyen])

#### Qdrant improvements

- **Qdrant named vector support** — `QdrantSearchInput` and `RecommendInput` accept `using?: string` to select a named vector, and `QdrantSearchInput.vector` accepts `number[] | Record<string, number[]>`. The sidecar forwards `using` to the Qdrant client (via a `SearchRequestWithUsing` type alias bridging the gap in the 1.18.0 client types). ([@asta-nguyen])
- **`QdrantStats.vectorsCount` populated** — `getStats()` now sets `vectorsCount` from `info.points_count` with a fallback to `info.indexed_vectors_count`, so the explorer can display total vectors alongside `indexedVectorsCount`. ([@asta-nguyen])
- **US state name → abbreviation reverse lookup** — `expandTerms()` now resolves full state names like "california" back to "ca" via a reverse map built from `US_STATE_ALIASES`, so both directions resolve canonical variants. ([@asta-nguyen])
- **2-letter token exemption from term-expansion stop-word filter** — `expandTerms()` now checks `STOP_WORDS` only when `lookup()` returns no expansion, so short tokens like `us`, `in`, `me` can still resolve to country/state/boolean canonical variants. ([@asta-nguyen])

### Fixed

- Landing changelog page now resolves release data from the repository root `CHANGELOG.md` in both root and `landing/` build contexts.
- **SQL editor ignored read-only setting** — duplicate client-side safety check in `useRunQuery` used a stale cache and shadowed the server enforcement. Redundant check removed; server remains the single source of truth. ([@asta-nguyen])
- **Stale Qdrant filter on invalid JSON** — the filter builder's "Advanced JSON" mode now clears the parent filter as soon as parsing fails, instead of leaving the previously valid filter in place while the UI shows an error. ([@asta-nguyen])
- **Stale Qdrant query results on context change** — switching the collection or search mode now clears the previous result table and status messages so old hits are not shown for the new context. ([@asta-nguyen])
- **Qdrant collection load failures shown as "No matches"** — the explorer now checks `useQdrantCollections`'s error state and renders an explicit error message when the connection fails, instead of falling through to the empty-state branch. ([@asta-nguyen])
- **Qdrant vector map picked an arbitrary named vector** — `toNumericVector` now accepts an explicit `vectorName` and looks up the embedding by that key, with a single-key fallback when the name is omitted. Previously it always used `Object.values(vector)[0]`, which ran PCA on the wrong embedding for collections with multiple named vectors. ([@asta-nguyen])
- **Qdrant filter builder accepted non-numeric range values** — range operators (`gt`/`gte`/`lt`/`lte`) now skip rows whose value is not a finite number instead of sending `NaN` to Qdrant. The combined filter is dropped when no valid conditions remain, matching the existing empty-state behavior. ([@asta-nguyen])
- **Stale Qdrant stats after editing a connection** — the stats cache key now includes the connection profile's `updatedAt`, so updating host/port or any other connection field correctly evicts the previous result instead of returning stats from the old endpoint. ([@asta-nguyen])
- **Unbounded Qdrant page jumps hammered the sidecar** — the "Go" page input is now capped at 50 pages per click; the cursor walk is clamped to `offsetStack.length + 50`, so the previous input (e.g. 10000) no longer triggers thousands of serial `scrollPoints` calls. ([@asta-nguyen])
- **Clear button left the Qdrant filter builder's draft state intact** — clearing an applied filter now also resets the builder (via a remount) and the parent's draft filter, so a stale draft cannot be re-applied with a single click. ([@asta-nguyen])
- **Refresh connection did not invalidate Qdrant queries** — `useRefreshConnection` now invalidates each query key separately (the previous `qc.invalidateQueries({ queryKey: keysToInvalidate })` was treating the array as a single key, so most entries were never invalidated) and includes `['qdrant-collections', id]` in `keysToInvalidate` and `refetchable` so the Qdrant explorer refreshes on reload. ([@asta-nguyen])
- **MySQL `getActiveConnections` violated `ConnectionInfo` contract** — `clientAddr` and `query` now preserve `null` instead of being coerced to `''`; `queryStart` is set to `null` (PROCESSLIST has no query-start time); `backendStart` is set to the inspection timestamp with a comment noting it's approximate. ([@asta-nguyen])
- **Qdrant sidebar tab lost numeric point IDs on serialization** — `WorkspaceTab`'s `qdrant-search.pointId` and the `openQdrantSearchTab` opts now accept `string | number` to match `QdrantPoint.id` / `RecommendInput.pointId`. Removed the `String(p.id)` coercion at the call sites so numeric IDs round-trip through persisted tabs. ([@asta-nguyen])
- **`/ai/embed` skipped provider config validation** — the embedding route now mirrors `/ai/chat`: it returns 400 `AI_CONFIG_ERROR` when the provider config is missing, disabled, or fails `validateProviderConfig`, instead of bubbling a 500 from the embed call. ([@asta-nguyen])
- **Qdrant search/recommend mutations crashed with unclear error when `connectionId` was null** — `useQdrantSearch` and `useQdrantRecommend` now check `connectionId` inside `mutationFn` and `Promise.reject(new Error('No connectionId'))` so callers receive a clear error. ([@asta-nguyen])
- **AI streaming reader crashed when response body was null** — `provider.ts` now guards `res.body` with an explicit check before calling `getReader()` and throws `Missing response body` instead of letting the non-null assertion fail. ([@asta-nguyen])
- **Schema tree fuzzy match false negative on whitespace** — `filteredTables` now uses a trimmed `q` for both the emptiness check and `fuzzyMatch`, so trailing/leading whitespace no longer causes tables to drop out of the results. ([@asta-nguyen])
- **`/sql/search-schema` passed `NaN` to the adapter** — the route now validates the `limit` query param to a finite integer in `[0, 1000]`, falling back to `undefined` if invalid, instead of forwarding `NaN` to `adapter.searchSchema`. ([@asta-nguyen])
- **`useColumnResize` returned stale widths when `columnCount` changed** — added a `useEffect` that reconciles the widths array to the current `columnCount`, preserving existing widths and filling new indices with `defaultWidth`; also added an explicit return type. ([@asta-nguyen])

### Changed

- **`useSchemaSearch` had no explicit return type** — now returns `UseQueryResult<SchemaSearchMatch[], Error>` so the contract is stable. ([@asta-nguyen])
- **`Switch` component used an inline prop intersection** — extracted to a named `SwitchProps` interface for clarity. ([@asta-nguyen])

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.0.0] — 2026-06-01

First stable release of KamehaDB — a local-first database GUI for PostgreSQL, MySQL, SQLite, MongoDB, and Redis.

### Highlights

- **AI Chat** — schema-aware assistant with persistent history, multi-provider support, markdown rendering, token tracking, and a Run button to execute SQL from the editor. ([@asta-nguyen], [@JoeJoeflyn])
- **Landing page v2** — demo video, dark mode, motion animations, SEO, and a dedicated documentation site. ([@asta-nguyen], [@JoeJoeflyn])
- **SQLite & MySQL parity** — table search, file picker, Browse button, and full database stats matching Postgres. ([@JoeJoeflyn])
- **MongoDB & Redis UX** — collection filtering, debounced queries, copy actions, and improved navigation. ([@JoeJoeflyn])

### Added

#### Qdrant

- Connect to Qdrant and browse collections and points.
- Three search modes: semantic text search (embeds via the configured AI provider), find-similar by point ID, and raw-vector (advanced).
- Payload filtering in the point browser with a per-point "find similar" action.
- Visual filter builder (field/condition/value rows) with payload field-name suggestions and an advanced-JSON escape hatch.
- Pagination controls with adjustable page size and jump-to-page.
- **3D vector map** — PCA projection of embeddings into an interactive Three.js point cloud (rotate/zoom/pan). Color and label points by payload field, hover for details, click to find similar. Theme-aware background, lazy-loaded to keep Three.js out of the initial bundle.

#### AI Chat

- Persistent connection-scoped history with timestamps and a copy button. ([@asta-nguyen])
- Markdown rendering, token tracking, and schema caching. ([@asta-nguyen])
- Database-scoped context for MongoDB. ([@asta-nguyen])
- Run button that auto-executes SQL queries from the editor. ([@JoeJoeflyn])

#### Database Support

- SQLite file selection with Browse button and auto-fill connection name. ([@JoeJoeflyn])
- MySQL database stats (tables, indexes, sizes). ([@JoeJoeflyn])
- Search filtering for SQLite table browsing. ([@asta-nguyen])

#### UI & Site

- Landing page v2 with demo video, dark mode, and motion animations. ([@asta-nguyen])
- Changelog page with timeline UI in Keep a Changelog format. ([@asta-nguyen])
- SEO metadata, Open Graph, Twitter cards, JSON-LD, `robots.txt`, and sitemap. ([@asta-nguyen])
- Sidebar quick actions for schema graph and database stats. ([@asta-nguyen])
- Custom color badges for connection profiles.
- Theme toggle: light / dark / system.
- SQL autocomplete with context-aware suggestions for tables, columns, functions, and keywords.
- Interactive schema graph visualization with dagre layout and ReactFlow.
- Connection URL parsing, pagination, row detail viewer with JSON export.
- Connection editing, deletion, and improved error handling.
- Database and table analytics: size explorer, connection monitoring.
- MongoDB: collection filtering, debounced queries, copy functionality.
- Test infrastructure with Vitest and comprehensive test coverage.
- Code quality tooling: Husky, Prettier, Commitlint.
- GitHub Actions CI/CD workflows.
- MIT license and comprehensive README.

### Fixed

- Dark/light mode toggle now switches correctly across landing pages. ([@asta-nguyen])
- Landing site removed from the root pnpm workspace. ([@asta-nguyen])
- Landing page responsive layout and overflow issues. ([@JoeJoeflyn])
- Platform-specific build instructions and Redis memory metric. ([@asta-nguyen])
- SQLite connection test and health check missing `await`. ([@JoeJoeflyn])
- SQLite index stats query returning incorrect results. ([@JoeJoeflyn])
- Duplicate auto-run effect causing SQL queries to execute twice. ([@asta-nguyen])
- Existing table tab not switching to workspace view on sidebar click. ([@asta-nguyen])
- Chat message timestamp migration and history limit validation. ([@asta-nguyen])

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
