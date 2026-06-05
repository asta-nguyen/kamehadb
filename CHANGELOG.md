# Changelog

All notable changes to KamehaDB will be documented in this file.

## [Unreleased]

### Added

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

### Fixed

- SQL editor ignored the connection's read-only setting because of a duplicate client-side safety check in `useRunQuery`; the server already enforces the rule, so the redundant client check (which used a stale cache) has been removed
- AI chat: SQL query results were being rendered with a "MONGODB" language label because the chat panel was collapsing `json`-tagged code fences into the JavaScript bucket. `normalizeCodeLanguage` now keeps `json` as its own label (`json`), so `\`\`\`json`result blocks render as JSON, not MongoDB. Helper extracted to`apps/desktop/src/lib/ai-chat-helpers.ts` with a vitest spec.
- AI chat: "Thinking..." spinner was shown for the full duration of an LLM stream, visually competing with the streaming text. The spinner is now suppressed as soon as the assistant has produced any text, so users see the streamed response land in the assistant bubble without a competing indicator.

## [v1.0.0] - 2026-06-01

First stable release of KamehaDB — a local-first database GUI for PostgreSQL, MySQL, SQLite, MongoDB, and Redis.

### Highlights

- **AI Chat** — schema-aware assistant with persistent history, multi-provider support, markdown rendering, token tracking, and a Run button to execute SQL from the editor ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/1345ac3), [@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/9b30ff2))
- **Landing page v2** — demo video, dark mode, motion animations, SEO, and the dedicated documentation site ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/1345ac3), [@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/9b30ff2))
- **SQLite & MySQL parity** — table search, file picker, Browse button, and full database stats support matching Postgres ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/d0d2841))
- **MongoDB & Redis UX** — collection filtering, debounced queries, copy actions, and improved navigation ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/f618456))

### Added

- Qdrant vector database support: connect, browse collections, and inspect points
- Qdrant search with three modes: semantic text search (embeds text via the configured AI provider), find-similar by point ID, and raw-vector (advanced)
- Qdrant payload filtering in the point browser and a per-point "find similar" action
- Qdrant point browser pagination controls: adjustable page size and jump-to-page
- Qdrant visual filter builder (field/condition/value rows) with payload field-name suggestions and an advanced-JSON escape hatch, replacing raw JSON filter input
- Qdrant 3D vector map: PCA projection of embeddings into an interactive Three.js point cloud (rotate/zoom/pan), color and label points by payload field, hover for details, click to find similar; theme-aware background, lazy-loaded so Three.js stays out of the initial bundle
- AI chat: persistent connection-scoped history, timestamps, and copy button ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/1345ac3))
- AI chat: markdown rendering, token tracking, and schema caching ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/38f64ea))
- AI chat: database-scoped context for MongoDB ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/a318178))
- Run button that auto-executes SQL queries from the editor ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/9b30ff2))
- Landing page v2 with demo video, dark mode, and motion animations ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/092b6a1))
- Changelog page with timeline UI and Keep a Changelog format ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/21f70ca))
- SEO metadata, Open Graph, Twitter cards, JSON-LD, robots.txt, and sitemap ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/092b6a1))
- SQLite file selection with Browse button and auto-fill name ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/d0d2841))
- MySQL database stats support (tables, indexes, sizes) ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/d0d2841))
- Search filtering for SQLite table browsing ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/21029fd))
- Sidebar quick actions for schema graph and database stats ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/18b8a17))

### Fixed

- Landing page dark/light mode toggle now switches correctly across pages ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/21f70ca))
- Landing site no longer participates in the root pnpm workspace ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/ea33a5d))
- Landing page responsive layout and overflow ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/c37b191))
- Platform-specific build instructions and Redis memory metric ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/71bb7f2))
- SQLite connection test and health check missing await ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/d0d2841))
- SQLite index stats query returning incorrect results ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/d0d2841))
- Duplicate auto-run effect causing SQL queries to execute twice ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/3dfcb6a))
- Existing table tab not switching to workspace view on sidebar click ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/3dfcb6a))
- Chat message timestamp migration and history limit validation ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/5737145))

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

## [0.1.4-beta] - 2026-05-28

### Added

- Database stats quick action to sidebar connection items

## [0.1.3-beta] - 2026-05-28

### Changed

- Updated desktop app branding with new logo and title capitalization

### Fixed

- Release workflow to handle nested artifact directories

## [0.1.0-beta.1] - 2026-05-28

### Added

- Graph and database stats quick actions to sidebar
- MongoDB improvements, sidebar state persistence, and code cleanup
- UI component improvements and bug fixes
- Static documentation site with landing page, getting started guide, features, and FAQ

### Fixed

- Release workflow refactored to use artifact upload strategy

## [0.1.0-rc.1] - 2026-05-26

### Added

- AI chat assistant with multi-provider support and API settings management
- SQL autocomplete with context-aware suggestions for tables, columns, functions, and keywords
- Interactive schema graph visualization with dagre layout and ReactFlow
- Connection URL parsing, pagination, and row detail viewer with JSON export
- Connection editing, deletion, and improved error handling
- Database and table analytics with size explorer, connection monitoring
- Theme toggle with light/dark/system modes
- MongoDB collection filtering, debounced queries, and enhanced UX with copy functionality
- Custom color badges for connection profiles
- Test infrastructure with vitest and comprehensive test coverage
- Code quality tooling with husky, prettier, commitlint
- GitHub Actions CI/CD workflows
- MIT license and comprehensive README
