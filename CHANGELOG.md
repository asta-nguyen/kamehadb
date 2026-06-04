# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- v1.2 Adding MCP server

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

### Fixed

- **SQL editor ignored read-only setting** — duplicate client-side safety check in `useRunQuery` used a stale cache and shadowed the server enforcement. Redundant check removed; server remains the single source of truth. ([@asta-nguyen])
- **Stale Qdrant filter on invalid JSON** — the filter builder's "Advanced JSON" mode now clears the parent filter as soon as parsing fails, instead of leaving the previously valid filter in place while the UI shows an error. ([@asta-nguyen])
- **Stale Qdrant query results on context change** — switching the collection or search mode now clears the previous result table and status messages so old hits are not shown for the new context. ([@asta-nguyen])
- **Qdrant vector map picked an arbitrary named vector** — `toNumericVector` now accepts an explicit `vectorName` and looks up the embedding by that key, with a single-key fallback when the name is omitted. Previously it always used `Object.values(vector)[0]`, which ran PCA on the wrong embedding for collections with multiple named vectors. ([@asta-nguyen])

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
