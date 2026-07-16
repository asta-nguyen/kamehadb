# KamehaDB

## What This Is

KamehaDB is a local-first database GUI built as a Tauri v2 desktop app with a Node.js sidecar. It supports PostgreSQL, MySQL, SQLite, MongoDB, Redis, Qdrant, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB, and TigerBeetle — offering schema browsing, SQL editing, vector search, AI chat, and database-specific maintenance workflows. Designed for developers who want a fast, unified database client without cloud dependencies.

## Core Value

Every supported database engine should feel equally first-class in the UI — consistent navigation, predictable interactions, and unified visual language across all explorers.
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

- ✓ Multi-engine database connections (12 engines) — existing
- ✓ Schema browsing and table preview — existing
- ✓ Monaco SQL editor with autocomplete and query history — existing
- ✓ PostgreSQL stats, backup/restore, psql terminal — existing
- ✓ pgvector and sqlite-vec search with 3D vector maps — existing
- ✓ MongoDB document editing (card + table views) — existing
- ✓ Redis key browser — existing
- ✓ Qdrant collection/point explorer — existing
- ✓ TigerBeetle account/transfer explorer — existing
- ✓ AI chat with schema-aware context — existing
- ✓ In-app logs viewer (frontend + Tauri + sidecar) — existing
- ✓ Shadcn/ui component library adoption — existing
- ✓ TanStack Query data hooks — existing

### Active

- [ ] Establish shared design tokens (spacing, color, typography, radius) as a single source of truth
- [ ] Create a component style guide documenting canonical patterns for tables, forms, dialogs, toolbars
- [ ] Audit and fix visual inconsistencies across SQL editor, non-SQL explorers, vector search, and chrome
- [ ] Standardize toolbar/action-bar patterns across all database explorer views
- [ ] Unify empty states, loading states, and error states across all views
- [ ] Ensure consistent iconography and button sizing across all views

### Out of Scope

- Landing page redesign — separate Next.js marketing site, not part of desktop app
- Mobile/responsive design — desktop-only Tauri app, no mobile target
- Theme overhaul — dark/light mode already works; focus is consistency, not new themes

## Context

- **Current UI stack:** React 19 + TailwindCSS + Shadcn/ui components + Lucide icons
- **Component library:** `@/components/ui/` (Button, Input, Dialog, Sheet, DropdownMenu, etc.)
- **Known inconsistencies:** Different explorer views (Mongo, Redis, Qdrant, TigerBeetle) were built incrementally and don't share toolbar/filter/empty-state patterns. Vector search UIs (pgvector vs sqlite-vec) have diverged in layout and controls.
- **Codebase map exists:** `.planning/codebase/` has ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, CONCERNS.md
- **Recent refactoring:** v1.3.4 split SQL routes, extracted shared filter parser, fixed multiple validation bugs across vector search endpoints

## Constraints

- **Tech stack**: React 19 + TailwindCSS + Shadcn/ui + Tauri v2 — must stay within this stack
- **Compatibility**: Changes must not break existing TanStack Query hooks or sidecar API contracts
- **Performance**: UI must remain responsive with large result sets (10K+ rows in SQL results)
- **Accessibility**: Shadcn/ui components provide ARIA primitives — maintain or improve a11y
- **No new dependencies**: Prefer composing existing Shadcn/ui components over adding new libraries

## Key Decisions

| Decision                                          | Rationale                                                                        | Outcome   |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| Shadcn/ui as component foundation                 | Radix primitives + Tailwind = accessible, customizable, no lock-in               | ✓ Good    |
| TanStack Query for all data hooks                 | Caching, dedup, background refetch — standardize data flow                       | ✓ Good    |
| Design tokens over ad-hoc styling                 | Single source of truth for spacing/color/typography prevents drift               | — Pending |
| Per-explorer toolbars vs shared toolbar component | Repeated patterns across Mongo/Redis/Qdrant/TigerBeetle suggest shared component | — Pending |

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
