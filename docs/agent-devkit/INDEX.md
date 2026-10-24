# Agent DevKit Index

## Changes

- [Runtime footprint and large-table browsing](changes/2026-10-13-footprint-and-large-tables/tasks.md) — all-engine performance revision approved; 11/12 tasks recorded done (Task 7 matched benchmark remains open). [Interim sorting/RAM benchmark](changes/2026-10-13-footprint-and-large-tables/benchmark.md).

## Archived changes

- [AI schema indexing on demand](changes/archive/2026-10-12-ai-schema-indexing/tasks.md) — SQL schema indexing deferred from startup to the first general AI chat per connection, with shared in-flight jobs, serialized connections, and fallback retry; all three tasks verified.
- [GUI SQL read-only toggle](changes/archive/2026-10-23-gui-sql-read-only-toggle/tasks.md) — per-profile read-only flag enforced at GUI query/export boundaries; all four tasks verified including UI tests, docs, and the full build suite.
- [Unified provider core review hardening](changes/archive/2026-10-20-110-provider-core-review-hardening/tasks.md) — all five tasks verified; manager races, guarded lookups, app compatibility, documentation, and final checks passed.
- [Unified provider core](changes/archive/2026-10-19-110-unified-provider-core/tasks.md) — all six tasks verified — dbcore contracts/manager, all ten providers relocated, GUI services on the shared internal/database facade, shims removed, external-module validation passed.
- [Review feedback hardening](changes/archive/2026-10-16-review-feedback-hardening/tasks.md) — AI chat no longer runs generated SQL, PostgreSQL TLS verification, atomic file backup/restore, encrypted stored credentials, least-privilege release workflow, loopback Docker ports. All 7 tasks verified.
- [Connection Root CA and TLS Mode](changes/archive/2026-10-16-connection-root-ca/design.md) — local Root CA verification for PostgreSQL, MySQL/MariaDB, and SQL Server; all 9 implementation tasks passed final review.
- [MCP runtime and history audit](changes/archive/mcp-audit/delta.md) — rollback recovery reporting, unavailable-runtime handling, and source-grounded MCP history documentation.

## Research

- [DBX, DBeaver, and TablePlus large-data patterns](research/2026-10-13-db-browser-large-data-patterns.md)
- [Footprint measurements and DBX comparison](research/2026-10-13-footprint-and-dbx-comparison.md)

## Designs

- [MCP Call History](specs/2026-10-08-mcp-call-history-design.md)
- [Read-only Database MCP](specs/2026-09-30-read-only-database-mcp-design.md)
- [MCP-managed read-only database accounts](specs/2026-09-30-mcp-managed-readonly-accounts-design.md)
- [MCP credentials in local SQLite](specs/2026-10-01-mcp-sqlite-credentials-design.md)
- [KamehaDB Wails + Go rewrite](specs/2026-10-12-wails-rewrite-design.md)

## Plans

- [Legacy pointer: Connection Root CA and TLS Mode](plans/2026-10-16-connection-root-ca-plan.md) — redirects to the archived change record.
- [KamehaDB Wails + Go rewrite implementation plan](plans/2026-10-12-wails-rewrite-plan.md)
- [MCP Call History implementation plan](plans/2026-10-08-mcp-call-history-plan.md)
- [Read-only Database MCP implementation plan](plans/2026-09-30-read-only-database-mcp-plan.md)
- [MCP-managed read-only database accounts implementation plan](plans/2026-09-30-mcp-managed-readonly-accounts-plan.md)
- [MCP SQLite credential implementation](plans/2026-10-01-mcp-sqlite-credentials-plan.md)
