# KamehaDB

## What This Is

KamehaDB is a local-first database GUI built as a Tauri v2 desktop app with a Node.js sidecar. It supports PostgreSQL, MySQL, SQLite, MongoDB, Redis, Qdrant, SQL Server, Oracle, ClickHouse, DuckDB, MariaDB, and TigerBeetle — offering schema browsing, SQL editing, vector search, AI chat, and database-specific maintenance workflows. Designed for developers who want a fast, unified database client without cloud dependencies.

## Core Value

Every supported database engine should feel equally first-class in the UI — consistent navigation, predictable interactions, and unified visual language across all explorers.

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

_Last updated: 2026-06-28 after initialization_
