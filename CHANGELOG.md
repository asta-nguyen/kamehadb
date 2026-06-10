# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **Migration Assistant** — compare two schema snapshots (before/after) and generate the DDL migration SQL to go from one to the other (`CREATE TABLE`, `ALTER TABLE`, `CREATE/DROP INDEX`, etc.). Accessed via the connection dropdown menu. ([@opencode])
- **Query history performance panel** — history is now grouped by normalized query pattern (literals stripped) with duration per group, favorites filter, and text search. ([@opencode])
- **Copy result table as snapshot** — "Copy table" button in the result toolbar copies the result grid as tab-separated text to clipboard for quick sharing. ([@opencode])
- **Global search palette** (`Ctrl+K`) — fuzzy-search across connections, schema tables/columns, open tabs, and quick actions (New Query, Graph, DB Stats, AI Chat). Uses cmdk with keyboard navigation. Search button visible in the header for non-keyboard users. ([@opencode])
- **Connection health badges** — status dot now shows connected/green, slow/yellow (≥500ms latency), reconnecting/pulsing, or offline/red. Tooltip displays latency in ms. Reconnecting state has a 5-second grace period before settling on disconnected.
- **Schema change timeline** — capture schema snapshots (tables, columns, indexes) on demand and view a chronological changelog of additions, removals, and type changes. Accessed via the connection dropdown menu. ([@opencode])
- **Time-aware welcome screen** — greetings change by time of day (morning/afternoon/evening/night) with a pool of curated messages, last-shown tracking, and returning-visitor prompt rotation.
- **Connection hover tooltip** — hover connection name to see kind, host:port, database, status with latency, and last-updated timestamp.
- **Pin connections to top** — "Pin to top"/"Unpin" in connection dropdown. Pinned connections appear in a separate "Pinned" section at the top of the sidebar. State persisted to localStorage.
- **Workspace tabs memory** — open tabs and active tab are saved to localStorage and restored on page load, so sessions survive refresh.
- **Sidebar database icons** — replaced generic Lucide `Database` icon with engine-specific `DbIcon` (PostgreSQL, MySQL, MongoDB, Redis, SQL Server, Oracle, ClickHouse, MariaDB) and local SVG logos (DuckDB, SQLite, TigerBeetle, Qdrant).
- TigerBeetle seed script (`seed:tigerbeetle`) added to sidecar package.json. ([@opencode])
- **DuckDB adapter** — connect to local `.duckdb` files for embedded analytical queries. ([@JoeJoeflyn])
- **TigerBeetle adapter** — connect to TigerBeetle distributed ledger clusters with built-in connection pooling. ([@JoeJoeflyn])
- **Docker compose services for DuckDB and TigerBeetle** — add `docker-compose.yml` entries for DuckDB (CLI + HTTP) and TigerBeetle. Start with `docker compose up -d duckdb tigerbeetle`.

- **SQL Server adapter** — connect to Microsoft SQL Server databases via the existing SQL adapter path. ([@JoeJoeflyn])
- **Oracle adapter** — connect to Oracle databases with schema browsing, query execution, and metadata support. ([@JoeJoeflyn])
- **ClickHouse adapter** — connect to ClickHouse for columnar analytics workloads, including query execution and schema inspection. ([@JoeJoeflyn])
- **Query history with favorites** — persistent, connection-scoped query history (`useQueryHistory` hook + `POST /query-history`) allowing users to save, recall, and favorite previously executed SQL. ([@JoeJoeflyn])

- New vector database dependency: **Qdrant v1.13.6** (added to `docker-compose.yml`, exposed on ports `6333` HTTP / `6334` gRPC, persistent volume `qdrant_data`). Required for AI schema retrieval. Start it with `docker compose up -d qdrant` (or `docker compose up -d` to start the full dev stack including Qdrant). The sidecar talks to it via `QDRANT_URL` (defaults to `http://127.0.0.1:6333`).
- AI schema context now uses Qdrant vector search to retrieve only relevant table DDLs instead of injecting the full schema into the system prompt. The sidecar embeds each table's DDL into Qdrant on first use and searches by query similarity on each chat. Adds a new `QdrantSchemaStore` (`apps/sidecar/src/ai/qdrant-store.ts`) that handles collection creation, embedding upsert, and similarity search. If Qdrant is unreachable the sidecar falls back to the previous "send full DDL" path so chat still works, but schema retrieval will be slower and less precise.
- AI chat system prompt now instructs the assistant to use case-insensitive substring matching on user-supplied terms, splitting on non-alphanumeric characters and ORing unanchored and prefix-anchored variants so the assistant handles punctuation, case, codes vs. names ("germany" ↔ "DE"), plurals, and synonyms correctly across PostgreSQL, MySQL, SQLite, MongoDB, and Redis. Prevents the assistant from silently returning empty result sets when stored values differ from the user's phrasing.
- AI chat now also passes canonical term expansions (countries, US states, currencies, languages, common abbreviations) as data the assistant must consume verbatim in its WHERE filters, so user terms like "who lives in germany" reliably match rows stored as `DE` and "users in CA" match either Canada or California. Implemented as `expandTerms` / `renderExpansionsForPrompt` in `@kamehadb/shared` and called from the sidecar's `buildSystemPrompt`.
- Proactive Qdrant schema indexing at startup with enriched embedding text (column purpose, table purpose, DDL), hash-based incremental sync, and orphan cleanup. ([@JoeJoeflyn])
- AI chat streaming via `@tanstack/ai` — server-side `POST /ai/chat` now streams SSE events; client uses `useChat()` for real-time response rendering with stop/cancel support. ([@JoeJoeflyn])
- Server-side schema search for PostgreSQL, MySQL, and SQLite using ILIKE/LIKE queries. ([@JoeJoeflyn])
- Client-side fuzzy table name filtering in the schema tree (`fuzzyMatch` in utils). ([@JoeJoeflyn])
- Configurable row limit dropdown (10–500) in the table data view. ([@JoeJoeflyn])
- Connection dialog: read-only toggle so users can enable write statements (CREATE, INSERT, UPDATE, DELETE, DROP, etc.) per connection without editing the metadata DB directly
- Connection dialog: custom color picker (native `<input type="color">`) alongside the preset badge colors, so users can pick any color instead of being limited to the 8 presets- Replaced native `<input>`, `<textarea>`, `<label>`, `<button>`, and `<select>` elements with shadcn UI components (`Input`, `Textarea`, `Label`, `Button`, `Select`) across the desktop app. ([@opencode])
- Replaced native `<table>` with shadcn `Table` (div-based grid) in the data grid. Column resize hook rewritten to drive `gridTemplateColumns` on rows; resize handles preserved. ([@opencode])
- Qdrant vector map: persist and restore `colorBy` and camera state (position and target) across tab switches.
- v1.2 Adding MCP server

### Fixed

- **JSON record viewer rendered HTML entities instead of characters** — `formatJsonSyntax` was using `escapeHtml()` then matching `&quot;` entities, but React re-escapes text content, causing `&amp;quot;` rendering. Rewritten to tokenize raw JSON with proper quote matching. ([@opencode])
- TigerBeetle seed script now reuses the existing `tigerbeetle` connection instead of creating a fresh `tigerbeetle-seed-*` row on every run, so retries no longer clutter the metadata SQLite database.
- SQL editor ignored the connection's read-only setting because of a duplicate client-side safety check in `useRunQuery`; the server already enforces the rule, so the redundant client check (which used a stale cache) has been removed
- AI chat: SQL query results were being rendered with a "MONGODB" language label because the chat panel was collapsing `json`-tagged code fences into the JavaScript bucket. `normalizeCodeLanguage` now keeps `json` as its own label (`json`), so `\`\`\`json`result blocks render as JSON, not MongoDB. Helper extracted to`apps/desktop/src/lib/ai-chat-helpers.ts` with a vitest spec.
- AI chat: "Thinking..." spinner was shown for the full duration of an LLM stream, visually competing with the streaming text. The spinner is now suppressed as soon as the assistant has produced any text, so users see the streamed response land in the assistant bubble without a competing indicator.
- AI chat: code highlighting no longer reparses `highlight.js` HTML with a regex. The chat panel now renders `highlight.js`'s token tree directly and sanitizes emitted scope names before converting them into React spans, removing the HTML parsing path from AI response rendering.
- AI settings: Provider management has been simplified to a single active-provider model. Providers can now be promoted to activeProvider directly from the settings UI using a dedicated Set active action (instead of only becoming active when the current provider was disabled). Setting a provider active automatically disables other provider configurations, and the active provider is now highlighted more clearly throughout the desktop UI, including the provider list, detail view, and picker.
- Desktop UI: sidebar connection names now align flush-left with their database icons, and MongoDB document-card values now render left-aligned instead of centered in the value column.
- Mongo table view: wide documents now support horizontal scrolling, users can choose which fields stay visible from a field picker, and row details are opened from a sticky right-side action column with an explicit view icon instead of relying on row-click behavior.
- SQL table browser: the shared data grid now mirrors the Mongo table UX with horizontal scrolling for wide rows, a visible-field picker, and a sticky right-side view action so PostgreSQL/MySQL/MariaDB/SQL Server/Oracle/ClickHouse/DuckDB-style tables do not rely on row-click for record details.

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
