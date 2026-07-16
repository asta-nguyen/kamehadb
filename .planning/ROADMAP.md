# Roadmap: KamehaDB UI/UX Consistency

**Created:** 2026-06-28
**Granularity:** Standard (5-8 phases, 3-5 plans each)

## Phase 1: Design Token Foundation

**Goal:** Establish the shared design token system (spacing, color, typography, radius, shadow) as the single source of truth, documented in a style guide.

**Requirements:** DSN-01, DSN-02, DSN-03, DSN-04, DSN-05

**Scope:**

- Audit current TailwindCSS config and all ad-hoc spacing/color/typography values across components
- Define semantic design tokens and map them to TailwindCSS utility classes
- Create DESIGN-SYSTEM.md documenting all tokens with usage guidelines
- Refactor `variants.ts` and base UI components to consume tokens

**Out of phase scope:** Component pattern refactoring (Phase 2), view-specific fixes (Phases 3-5)

**Depends on:** —

## Phase 2: Shared Component Patterns

**Goal:** Build the shared state and toolbar components that all explorer views will consume, replacing duplicated implementations.

**Requirements:** CMP-01, CMP-02, CMP-03, CMP-04, CMP-05, CMP-06, CHR-04

**Scope:**

- Create ExplorerToolbar, EmptyState, LoadingState, ErrorState, FilterBar components
- Standardize action button sizing (icon-xs for row actions, sm for toolbar)
- Create shared toast/notification utility
- Audit existing components for token compliance and fix deviations
- Write unit tests for new shared components

**Out of phase scope:** Integrating components into specific views (Phases 3-5)

**Depends on:** Phase 1

## Phase 3: SQL Editor, Results & Chrome Consistency

**Goal:** Apply design tokens and shared components to the SQL editor, query results, schema sidebar, tab bar, and dialogs.

**Requirements:** SQL-01, SQL-02, SQL-03, SQL-04, CHR-01, CHR-02, CHR-03, CHR-05

**Scope:**

- Refactor SQL editor toolbar to use consistent layout and token-based spacing
- Standardize query results table (header, row height, cell padding, truncation)
- Audit sidebar connection cards, status badges, and tree indentation
- Refactor workspace tab bar (tab sizing, close button, active indicator)
- Ensure all dialogs use shared Dialog component with consistent header/footer
- Add keyboard shortcut hints or help overlay

**Out of phase scope:** Non-SQL explorer views (Phase 4), Vector search (Phase 5)

**Depends on:** Phase 2

## Phase 4: Non-SQL Explorer Consistency

**Goal:** Unify MongoDB, Redis, Qdrant, and TigerBeetle explorer views using shared ExplorerToolbar and state components.

**Requirements:** EXP-01, EXP-02, EXP-03, EXP-04, EXP-05

**Scope:**

- Refactor Mongo document table/card views to use ExplorerToolbar + shared states
- Refactor Redis key list view with ExplorerToolbar + shared states
- Refactor Qdrant collection/point view with ExplorerToolbar + shared states
- Refactor TigerBeetle explorer with ExplorerToolbar + shared states
- Standardize JSON/document rendering across all explorers

**Out of phase scope:** Vector search UI (Phase 5)

**Depends on:** Phase 2

## Phase 5: Vector Search UI Unification

**Goal:** Unify pgvector and sqlite-vec search panels into a consistent layout with shared controls and filter builder.

**Requirements:** VEC-01, VEC-02, VEC-03, VEC-04

**Scope:**

- Create shared vector search layout (search form + results + map toggle)
- Standardize vector column selector, metric selector, and limit input
- Align 3D vector map controls between pgvector and sqlite-vec
- Unify filter builder UI using shared FilterBar component
- Ensure both vector search paths use shared EmptyState/LoadingState/ErrorState

**Out of phase scope:** New vector search features (focus is consistency)

**Depends on:** Phase 2, Phase 4

---

## Phase Summary

| Phase | Name                         | Requirements | Depends On | Status   |
| ----- | ---------------------------- | ------------ | ---------- | -------- |
| 1     | Design Token Foundation      | 5            | —          | Complete |
| 2     | Shared Component Patterns    | 7            | Phase 1    | Complete |
| 3     | SQL Editor, Results & Chrome | 8            | Phase 2    | Complete |
| 4     | Non-SQL Explorer Consistency | 5            | Phase 2    | Complete |
| 5     | Vector Search UI Unification | 4            | Phase 2, 4 | Complete |

**Total:** 5 phases, 29 requirements

---

_Roadmap created: 2026-06-28_
