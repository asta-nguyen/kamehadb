# Phase 5: Vector Search UI Unification — Plan

**Phase:** 5
**Name:** Vector Search UI Unification
**Created:** 2026-06-28
**Requirements:** VEC-01, VEC-02, VEC-03, VEC-04

## Goal

Unify vector search panel styling, adopt shared loading/error/empty states, fix input height inconsistencies, fix export dropdown, and align Qdrant vector map with shared `VectorMap3D` component.

## Plan 1: Fix Input Height Inconsistencies & Export Dropdown

**Type:** standard
**Goal:** Standardize input heights across vector search panels and fix the export dropdown in postgres-vector-results.

### Tasks

1. **`vector-query.tsx` PG filter input** — change `h-9 px-2 text-sm` to `h-7 px-2 text-xs` to match the rest of the control row.

2. **`qdrant-query.tsx` text/similar inputs** — change `h-9 px-2 text-sm` to `h-7 px-2 text-xs` for text and similar mode inputs to match control row height.

3. **`postgres-vector-results.tsx` export dropdown** — replace raw className on `DropdownMenuTrigger` with `Button` component (`variant="ghost" size="icon-sm"`), matching the pattern fixed in SQL editor Phase 3.

4. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/vector-query.tsx`
- `apps/desktop/src/components/qdrant-query.tsx`
- `apps/desktop/src/components/postgres-vector-results.tsx`

### Acceptance Criteria

- [ ] All inputs in vector-query.tsx use `h-7 text-xs` consistently
- [ ] All inputs in qdrant-query.tsx use `h-7 text-xs` consistently
- [ ] Export dropdown in postgres-vector-results uses `Button` component
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 2: Adopt Shared Loading/Error/Empty States in Vector Views

**Type:** standard
**Goal:** Replace inline loading/error/empty markup with shared `LoadingState`, `ErrorState`, `EmptyState` components.

### Tasks

1. **`vector-map-3d.tsx`** — replace inline loading `<Loader2>` with `<LoadingState>`, inline error text with `<ErrorState>`, inline empty text with `<EmptyState>`.

2. **`qdrant-vector-map.tsx`** — replace inline loading `<Spinner>` with `<LoadingState>`, inline error text with `<ErrorState>`, inline empty text with `<EmptyState>`.

3. **`vector-query.tsx`** — replace inline empty state `<div className="p-3 text-sm text-muted-foreground">` with `<EmptyState>`. Replace inline error `<div className="text-xs text-destructive">` with `<ErrorState compact>`.

4. **`qdrant-query.tsx`** — replace inline empty state with `<EmptyState>`. Replace inline error with `<ErrorState compact>`.

5. **Run typecheck, tests, and build** — verify no regressions.

### Files

- `apps/desktop/src/components/vector-map-3d.tsx`
- `apps/desktop/src/components/qdrant-vector-map.tsx`
- `apps/desktop/src/components/vector-query.tsx`
- `apps/desktop/src/components/qdrant-query.tsx`

### Acceptance Criteria

- [ ] `vector-map-3d.tsx` uses `LoadingState`, `ErrorState`, `EmptyState`
- [ ] `qdrant-vector-map.tsx` uses `LoadingState`, `ErrorState`, `EmptyState`
- [ ] `vector-query.tsx` uses `EmptyState` for empty state, `ErrorState` for errors
- [ ] `qdrant-query.tsx` uses `EmptyState` for empty state, `ErrorState` for errors
- [ ] No inline `<div className="flex items-center justify-center"><Spinner/></div>` patterns
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Build passes

---

## Plan 3: Extend VectorMap3D to Support Color-By and Migrate Qdrant Vector Map

**Type:** standard
**Goal:** Extend the shared `VectorMap3D` component with optional color-by support, then migrate `qdrant-vector-map.tsx` to use it, eliminating ~250 lines of duplicated Three.js code.

### Tasks

1. **Extend `VectorMap3D`** — add optional props:
   - `colorBy?: string` — payload field name to color by
   - `payloadKeys?: string[]` — available payload keys for color-by selector
   - `colorValue?: (i: number) => string` — function returning color for point i
   - `legend?: { value: string; color: string }[]` — legend items to render
   - When `colorBy` is provided, render the color-by selector and legend in the header
   - When `colorBy` is not provided, use single-color material (existing behavior)

2. **Migrate `qdrant-vector-map.tsx`** — replace the custom `useVectorScene` hook and inline Three.js code with `VectorMap3D`, passing color-by props. Keep the data fetching (`useQuery` for scroll points) and `toNumericVector` helper.

3. **Run typecheck, tests, and build** — verify no regressions.

### Files

- `apps/desktop/src/components/vector-map-3d.tsx`
- `apps/desktop/src/components/qdrant-vector-map.tsx`

### Acceptance Criteria

- [ ] `VectorMap3D` supports optional color-by, legend, and vertex colors
- [ ] `qdrant-vector-map.tsx` uses `VectorMap3D` instead of custom Three.js scene
- [ ] `qdrant-vector-map.tsx` is significantly shorter (target: <100 lines from 393)
- [ ] Color-by and legend functionality preserved
- [ ] Camera save/restore preserved
- [ ] Hover/click interactions preserved
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 4: Align Qdrant Query Styling with Vector Query

**Type:** standard
**Goal:** Ensure Qdrant query panel matches the vector-query panel layout pattern.

### Tasks

1. **`qdrant-query.tsx` raw mode textarea** — add `focus:outline-none focus:ring-1 focus:ring-primary/50` to match vector-query.tsx textarea styling (already has it ✓ — verify).

2. **`qdrant-query.tsx` results footer** — already has `px-3 py-1.5 border-t border-border text-xs text-muted-foreground` ✓ — matches SQL editor pattern.

3. **Verify filter builder consistency** — `qdrant-query.tsx` already uses `QdrantFilterBuilder` ✓. `vector-query.tsx` uses structured filter for SQLite and free-text for PG. These are intentionally different (different engine capabilities) — no change needed.

4. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/qdrant-query.tsx`

### Acceptance Criteria

- [ ] Textarea styling matches between qdrant-query and vector-query
- [ ] Filter builder usage is consistent (QdrantFilterBuilder where applicable)
- [ ] Typecheck passes
- [ ] Build passes

---

## Risks

| Risk                                                              | Mitigation                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Extending VectorMap3D may break existing pgvector/sqlite-vec maps | All new props are optional — existing callers don't need changes      |
| Qdrant vector map migration may lose color-by functionality       | Test color-by and legend rendering after migration                    |
| Shared states may change layout in 3D map views                   | Use `ErrorState`/`EmptyState` without `compact` for full-height views |
| Input height changes may affect layout                            | Verify visually after build                                           |

## Dependencies

- Phase 1 (design tokens)
- Phase 2 (shared components — `LoadingState`, `ErrorState`, `EmptyState`)
- Phase 3 (Button component pattern for export dropdown)

---

_Plan created: 2026-06-28_
