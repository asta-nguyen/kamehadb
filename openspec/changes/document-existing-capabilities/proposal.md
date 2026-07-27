## Why

KamehaDB has 14 major capabilities built over time without formal specifications. Creating baseline specs captures the current behavior as a reference point, making future changes safer and more predictable. Specs also serve as living documentation that stays in sync with the codebase through the OpenSpec change workflow.

## What Changes

This change introduces 14 new capability spec files under `openspec/specs/`. Each spec documents the requirements and scenarios for an existing capability as it behaves today. No application code is modified — this is purely documentation capture.

## Capabilities

### New Capabilities

- `connection-management`: Connection profile CRUD, health checks, password storage, sidebar navigation, adapter factory routing for 12 database engines
- `sql-query`: Monaco SQL editor, query execution with safety checks, autocomplete, query history, favorites, result display
- `schema-browse`: Schema tree navigation, ERD graph, table/column/index browsing, preview rows with filtering/sorting, global schema search
- `schema-evolution`: Schema timeline tracking, schema diff view, migration assistant generation
- `postgres-stats`: PostgreSQL database size stats, table stats (bloat, vacuum, analyze), index stats, active connection monitoring
- `postgres-tools`: Embedded psql shell, backup (pg_dump), restore (pg_restore), tool job lifecycle management
- `vector-search`: pgvector and sqlite-vec similarity search, sample point extraction, 3D PCA visualization, vector map views
- `mongodb`: Database/collection browsing, document CRUD, aggregation pipeline, embedded mongosh shell, collection stats
- `redis`: Key scanning with pattern matching, value viewer by type, TTL lookup, command runner, server stats
- `qdrant`: Collection browsing, point scroll, similarity search, recommend, filter builder, vector map, collection stats
- `tigerbeetle`: Account listing and creation, balance lookup, transfer listing and creation, account/transfer stats
- `ai-chat`: Multi-provider AI chat (Ollama, OpenAI, DeepSeek, Gemini, 9Router), schema-aware context injection, chat history persistence, vector-based schema search
- `logs-viewer`: Merged frontend, Tauri, and sidecar log viewing in-app with severity filtering and source filtering
- `file-db-maintenance`: DuckDB and SQLite file backup and restore operations

### Modified Capabilities

(none — all specs are new baseline documents)

## Impact

- **New files only**: `openspec/specs/<capability>/spec.md` for 14 capabilities
- **No code changes**: Application code, routes, adapters, and UI components remain untouched
- **No dependency changes**: No new packages or build steps
- **Future changes**: Each spec serves as a baseline for future change proposals targeting that capability
