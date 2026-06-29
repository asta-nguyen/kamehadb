# KamehaDB

## What This Is

KamehaDB is a local-first database GUI built as a Tauri v2 desktop app with a local Node.js sidecar. It supports 12 database engines (PostgreSQL, MySQL, SQLite, MongoDB, Redis, Qdrant, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB, TigerBeetle) with schema browsing, a Monaco SQL editor, query history, schema timeline/diff workflows, explorers for Redis/Mongo/Qdrant/TigerBeetle, embedded shells, backup/restore, pgvector tools, an in-app logs viewer, and an AI chat panel with schema-aware context. A separate Next.js marketing site lives in `landing/`.

## Core Value

Developers can browse, query, and understand any local database from a single desktop app without touching the command line.

## Business Context

- **Customer**: Developers and DBAs who work with multiple database engines locally
- **Revenue model**: Open-source (Apache-2.0), community-driven
- **Success metric**: Active desktop installs and engine coverage breadth
- **Strategy notes**: Landing site drives awareness; desktop app drives adoption

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- ✓ Multi-engine schema browsing (12 engines) — existing
- ✓ Monaco SQL editor with autocomplete and export — existing
- ✓ Query history with favorites and per-group duration — existing
- ✓ Schema timeline/diff workflows (on-demand snapshots) — existing
- ✓ Redis, Mongo, Qdrant explorers — existing
- ✓ TigerBeetle sidecar router and explorer component — existing (not wired into workspace)
- ✓ AI chat panel with schema-aware context and streaming — existing
- ✓ PostgreSQL stats views and backup/restore — existing
- ✓ pgvector exploration tools — existing
- ✓ In-app logs viewer and embedded PostgreSQL/Mongo shells — existing
- ✓ Landing site with engine carousel and AI Compare panels — existing

### Active

<!-- Current milestone scope. Building toward these. -->

- [ ] Wire up real TigerBeetle explorer in workspace tab (replace placeholder)
- [ ] Cross-engine federated query canvas (read-only UNION-of-results)
- [ ] Schema timeline auto-scheduled snapshots (watcher / pg_notify)
- [ ] AI chat one-click actions from schema tree right-click menu
- [ ] Query history slow-query insights view (p95 by normalized pattern)
- [ ] Landing live engine matrix with status badges and feature matrix
- [ ] AI Compare panel screenshot refresh CI automation on release tags
- [ ] Landing interactive schema-graph demo (read-only sample ER diagram)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Cross-engine writes in federated query — safety risk; federation is read-only by design
- Mobile app — desktop-first; Tauri targets desktop platforms
- Cloud-hosted version — local-first is a core value; no server-side component
- Real-time collaboration — single-user local tool; not a team product

## Context

- **Architecture**: Client-sidecar pattern — Tauri v2 desktop app (React 19 + Rust) communicates with a local Hono Node.js sidecar over HTTP (127.0.0.1:3170). The sidecar houses all 12 DB adapters and a SQLite metadata store. The frontend never touches databases directly.
- **Monorepo**: pnpm workspace includes `apps/*` and `packages/*`. The `landing/` directory is a separate npm-managed Next.js project (not in the pnpm workspace).
- **Shared contract**: `packages/shared/src/index.ts` is the source of truth for cross-package types. If frontend and backend disagree on data shape, fix `packages/shared` first.
- **Testing**: Zero test files exist. Vitest is configured for the desktop package but no tests written. Sidecar and shared packages have no test framework. This is a known concern (see `.planning/codebase/CONCERNS.md`).
- **Codebase map**: `.planning/codebase/` contains 7 docs from a prior `/gsd-map-codebase` run (ARCHITECTURE, STRUCTURE, STACK, CONCERNS, CONVENTIONS, INTEGRATIONS, TESTING).

## Constraints

- **Tech stack**: Tauri v2 + React 19 + Hono sidecar — must stay within this architecture
- **Package boundaries**: `landing/` is NOT in the pnpm workspace; importing `@kamehadb/shared` into landing requires vendoring or a workspace boundary change
- **Local-first**: All features must work without a network connection (except AI provider calls, which are user-configured)
- **Engine safety**: Federated/multi-engine features must be strictly read-only where cross-engine

## Key Decisions

| Decision                                            | Rationale                                                                  | Outcome   |
| --------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| Client-sidecar architecture (Tauri + Hono)          | Keeps DB drivers in Node ecosystem; Rust handles OS-level ops              | ✓ Good    |
| Separate npm project for landing                    | Marketing site has different deploy/build needs; avoids workspace coupling | ✓ Good    |
| TigerBeetle explorer component built before wire-up | Component and sidecar routes exist; gap is only the workspace tab wiring   | — Pending |
| Schema snapshots opt-in only                        | Avoids surprise storage growth on shared databases                         | — Pending |

## Current Milestone: v1.0 Dashboard & Landing Polish

**Goal:** Close high-visibility dashboard gaps and elevate the landing site with interactive demos — routing 8 planted seeds into shipped features.

**Target features:**

- TigerBeetle explorer wire-up (replace placeholder)
- Cross-engine federated query canvas (read-only)
- Schema timeline auto-snapshots (watcher / pg_notify)
- AI chat schema-tree one-click actions
- Query history slow-query insights (p95 by pattern)
- Landing live engine matrix with Docker snippets
- AI Compare screenshot CI automation on release tags
- Landing interactive schema-graph demo

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-06-29 after milestone v1.0 initialization_
