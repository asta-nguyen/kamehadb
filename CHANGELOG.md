# Changelog

All notable changes to KamehaDB will be documented in this file.

## [Unreleased]

### Added

- Connection dialog: read-only toggle so users can enable write statements (CREATE, INSERT, UPDATE, DELETE, DROP, etc.) per connection without editing the metadata DB directly
- Connection dialog: custom color picker (native `<input type="color">`) alongside the preset badge colors, so users can pick any color instead of being limited to the 8 presets

### Fixed

- SQL editor ignored the connection's read-only setting because of a duplicate client-side safety check in `useRunQuery`; the server already enforces the rule, so the redundant client check (which used a stale cache) has been removed

## [v1.0.0] - 2026-06-01

First stable release of KamehaDB — a local-first database GUI for PostgreSQL, MySQL, SQLite, MongoDB, and Redis.

### Highlights

- **AI Chat** — schema-aware assistant with persistent history, multi-provider support, markdown rendering, token tracking, and a Run button to execute SQL from the editor ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/1345ac3), [@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/9b30ff2))
- **Landing page v2** — demo video, dark mode, motion animations, SEO, and the dedicated documentation site ([@asta-nguyen](https://github.com/asta-nguyen/kamehadb/commit/1345ac3), [@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/9b30ff2))
- **SQLite & MySQL parity** — table search, file picker, Browse button, and full database stats support matching Postgres ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/d0d2841))
- **MongoDB & Redis UX** — collection filtering, debounced queries, copy actions, and improved navigation ([@JoeJoeflyn](https://github.com/asta-nguyen/kamehadb/commit/f618456))

### Added

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
