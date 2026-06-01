# Changelog

All notable changes to KamehaDB will be documented in this file.

## [Unreleased]

### Added

- Qdrant vector database support: connect, browse collections, and inspect points
- Qdrant search with three modes: semantic text search (embeds text via the configured AI provider), find-similar by point ID, and raw-vector (advanced)
- Qdrant payload filtering in the point browser and a per-point "find similar" action
- Qdrant point browser pagination controls: adjustable page size and jump-to-page
- Qdrant visual filter builder (field/condition/value rows) with payload field-name suggestions and an advanced-JSON escape hatch, replacing raw JSON filter input
- Qdrant 3D vector map: PCA projection of embeddings into an interactive Three.js point cloud (rotate/zoom/pan), color and label points by payload field, hover for details, click to find similar; theme-aware background, lazy-loaded so Three.js stays out of the initial bundle
- Persistent AI chat with connection-scoped history and improved UX
- AI chat stop generation, message timestamps, copy button, and suggestion prompts
- AI chat markdown rendering, token tracking, and schema caching
- MongoDB database-scoped AI chat with improved UI and navigation
- Run button that auto-executes SQL queries from the editor
- Landing page v2 with demo video, Lucide icons, and motion animations
- Landing page dark mode support with theme toggle
- Changelog page with timeline UI and Keep a Changelog format
- SEO metadata, Open Graph, Twitter cards, JSON-LD, robots.txt, and sitemap
- Landing page migrated from npm to pnpm

### Fixed

- Platform-specific build instructions and Redis memory metric
- Chat message timestamp migration and history limit validation
- Landing page dark/light mode toggle now switches correctly across pages

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
