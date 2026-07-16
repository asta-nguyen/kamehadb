# Phase 4: Non-SQL Explorer Consistency — Plan

**Phase:** 4
**Name:** Non-SQL Explorer Consistency
**Created:** 2026-06-28
**Requirements:** EXP-01, EXP-02, EXP-03, EXP-04, EXP-05

## Goal

Align all non-SQL explorer views (Mongo, Redis, Qdrant, TigerBeetle) with shared component patterns, fix button sizing deviations, replace hardcoded colors with design tokens, and create a shared JSON rendering component.

## Plan 1: Fix Button Sizing & Lint Warnings Across All Explorers

**Type:** standard
**Goal:** Fix all button sizing deviations and `!size-3.5` lint warnings across non-SQL explorer views.

### Tasks

1. **Mongo view header** — fix `!size-3.5` lint warnings (3 instances) by changing to `size-3.5!` syntax. Fix export button from `size="icon"` to `size="icon-sm"`.

2. **Redis explorer** — fix stats toggle from `size="icon"` to `size="icon-xs"`.

3. **Qdrant view** — fix point action button from `size="icon"` to `size="icon-sm"`. Fix stats toggle by removing `px-1.5 py-0.5` override on `size="sm"`.

4. **Qdrant filter builder** — fix remove row button from `size="icon"` to `size="icon-xs"`.

5. **Mongo query toolbar** — remove redundant `h-7` overrides from Run, Format, and Chart buttons (standard `size="sm"` already provides correct height).

6. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/mongo-view-header.tsx`
- `apps/desktop/src/components/redis-explorer.tsx`
- `apps/desktop/src/components/qdrant-view.tsx`
- `apps/desktop/src/components/qdrant-filter-builder.tsx`
- `apps/desktop/src/components/mongo-query.tsx`

### Acceptance Criteria

- [ ] No `!size-3.5` lint warnings in mongo-view-header.tsx
- [ ] No `size="icon"` buttons in explorer views (all use `icon-xs` or `icon-sm`)
- [ ] No redundant `h-7` overrides on `size="sm"` buttons in mongo-query.tsx
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 2: Replace Hardcoded Colors in TigerBeetle

**Type:** standard
**Goal:** Replace hardcoded `text-emerald-500`, `text-red-500`, `bg-red-400`, `bg-emerald-400` with design token classes.

### Tasks

1. **Account balance color** — replace `text-emerald-500` with `text-success` and `text-red-500` with `text-destructive` in `AccountNode` component.

2. **Transfer direction dot** — replace `bg-red-400` with `bg-destructive` and `bg-emerald-400` with `bg-success` in `TransferRow` component.

3. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/tigerbeetle-explorer.tsx`

### Acceptance Criteria

- [ ] No hardcoded `emerald`, `red` color classes in tigerbeetle-explorer.tsx
- [ ] Uses `text-success`/`text-destructive` and `bg-success`/`bg-destructive` tokens
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 3: Create Shared JsonValue Component

**Type:** standard
**Goal:** Create a shared `JsonValue` component for rendering nested JSON/document data consistently across all explorer views.

### Tasks

1. **Create `JsonValue` component** at `apps/desktop/src/components/ui/json-value.tsx`:
   - Props: `value: unknown`, `className?: string`, `maxExpandDepth?: number`
   - Renders: null → italic muted "null", string → monospace, number → tabular, boolean → accent, object/array → collapsible nested view with indentation
   - Uses design tokens for colors: `text-muted-foreground` for keys, `text-foreground` for values
   - Collapsible sections for nested objects/arrays with toggle chevron
   - Max preview items (default 20) with "... and N more" overflow indicator

2. **Write unit test** at `apps/desktop/src/components/ui/__tests__/json-value.test.tsx` — test basic rendering of primitives, null, objects, arrays.

3. **Run typecheck, tests, and build** — verify no regressions.

### Files

- `apps/desktop/src/components/ui/json-value.tsx` (new)
- `apps/desktop/src/components/ui/__tests__/json-value.test.tsx` (new)

### Acceptance Criteria

- [ ] `JsonValue` component renders primitives, null, objects, and arrays
- [ ] Uses design token colors (no hardcoded hex)
- [ ] Collapsible nested sections
- [ ] Overflow indicator for large arrays
- [ ] Unit test passes
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 4: Adopt Shared States in Explorer Views

**Type:** standard
**Goal:** Replace inline loading/error/empty states in explorer views with shared `LoadingState`, `ErrorState`, `EmptyState` components.

### Tasks

1. **Redis explorer** — replace inline loading Spinner with `LoadingState`, inline "No keys found"/"No matches" text with `EmptyState`, inline error text with `ErrorState`.

2. **Qdrant view** — replace inline loading Spinner with `LoadingState`, inline error text with `ErrorState`, DataTable `emptyMessage` with `EmptyState` (if feasible without breaking DataTable API).

3. **TigerBeetle explorer** — replace inline loading Spinner with `LoadingState`, inline "No accounts found" text with `EmptyState`.

4. **Run typecheck, tests, and build** — verify no regressions.

### Files

- `apps/desktop/src/components/redis-explorer.tsx`
- `apps/desktop/src/components/qdrant-view.tsx`
- `apps/desktop/src/components/tigerbeetle-explorer.tsx`

### Acceptance Criteria

- [ ] Redis explorer uses `LoadingState`, `EmptyState` for key list
- [ ] Qdrant view uses `LoadingState`, `ErrorState` for point table
- [ ] TigerBeetle explorer uses `LoadingState`, `EmptyState` for account list
- [ ] No inline `<div className="flex items-center justify-center py-X"><Spinner .../></div>` patterns in these views
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Build passes

---

## Risks

| Risk                                                           | Mitigation                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `text-success`/`bg-success` tokens may not exist in CSS        | Verify token names in index.css — Phase 1 defined `--success` variable, Tailwind v4 should generate `text-success` utility |
| JsonValue component may be complex                             | Keep it simple — recursive rendering with collapsible toggle, no syntax highlighting                                       |
| Adopting shared states may break layout                        | Use `compact` variant where space is constrained (e.g., Redis key list)                                                    |
| DataTable `emptyMessage` prop may not support custom component | Check DataTable API — if not, leave DataTable's built-in empty message and only replace loading/error                      |

## Dependencies

- Phase 1 (design tokens — `--success`, `--destructive` used in Plan 2)
- Phase 2 (shared components — `LoadingState`, `ErrorState`, `EmptyState` used in Plan 4)

---

_Plan created: 2026-06-28_
