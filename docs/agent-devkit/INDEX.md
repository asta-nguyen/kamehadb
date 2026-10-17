# Agent DevKit Index

## Changes

- [Runtime footprint and large-table browsing](changes/2026-10-13-footprint-and-large-tables/tasks.md) — all-engine performance revision approved; partial checkpoint authorized, 8/12 tasks recorded done, implementation still open. [Interim sorting/RAM benchmark](changes/2026-10-13-footprint-and-large-tables/benchmark.md).

## Archived changes

- [Review feedback hardening](changes/archive/2026-10-16-review-feedback-hardening/tasks.md) — AI chat no longer runs generated SQL, PostgreSQL TLS verification, atomic file backup/restore, encrypted stored credentials, least-privilege release workflow, loopback Docker ports. All 7 tasks verified.
- [Connection Root CA and TLS Mode](changes/archive/2026-10-16-connection-root-ca/design.md) — local Root CA verification for PostgreSQL, MySQL/MariaDB, and SQL Server; all 9 implementation tasks passed final review.

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
