# Phase 5: Vector Search UI Unification — Research

**Researched:** 2026-06-28

## Current State

### Vector Query (`vector-query.tsx` — 566 lines)

**Already unified** — handles both pgvector and sqlite-vec in a single component, switching via `isSqlite` flag.

Layout: `p-3 border-b border-border space-y-2`

Control row: `flex items-center gap-2 flex-wrap`

- Schema selector (PG only): `SelectTrigger size="sm" className="h-7 text-xs w-28"` ✓
- Table selector: `h-7 text-xs w-40` ✓
- Column selector: `h-7 text-xs w-40` ✓
- Metric selector: `h-7 text-xs w-28"` ✓
- Limit selector: `h-7 text-xs w-20"` ✓
- Sample button (SQLite only): `variant="outline" size="sm"` with `ml-auto` ✓
- Search button: `size="sm"` ✓
- Map button: `variant="outline" size="sm"` ✓

Vector text input: `Textarea` with `min-h-20 px-2 py-1 text-xs font-mono` — consistent styling.

Filter section:

- SQLite: structured filter (column select + op select + value input) — `h-7 text-xs` ✓
- PG: free-text SQL WHERE clause `Input` with `h-9 px-2 text-sm` — **inconsistent height** (h-9 vs h-7 used elsewhere)

Error/info: inline `<div className="text-xs text-destructive">` / `text-muted-foreground` — not using shared `ErrorState`.

Results: Uses `PostgresVectorResults` component with `DataTable` ✓.
Empty state: inline `<div className="p-3 text-sm text-muted-foreground">` — not using `EmptyState`.

### Postgres Vector Results (`postgres-vector-results.tsx` — 152 lines)

Uses `DataTable` ✓ with dynamic columns from row keys.
Has row detail sheet with `RecordDetailTabs`.
Export dropdown uses `DropdownMenuTrigger` with raw className — **same pattern as old SQL editor export**.

### Qdrant Query (`qdrant-query.tsx` — 377 lines)

Layout: `p-3 border-b border-border space-y-2` — matches vector-query.tsx ✓

Mode tabs: Custom segmented control with `bg-muted/40 rounded-md p-0.5` — **not using shared Tabs component**.

Collection selector: `SelectTrigger size="sm" className="h-7 text-xs"` ✓
Limit input: `h-7 w-16 px-2 text-xs` with custom number input styling ✓
Search button: `size="sm"` with `ml-auto` ✓

Mode-specific inputs:

- Text mode: `Input h-9 px-2 text-sm` — **inconsistent with h-7 used in control row**
- Similar mode: `Input h-9 px-2 text-sm font-mono` — same
- Raw mode: `Textarea min-h-20 px-2 py-1 text-xs font-mono` ✓

Filter: Uses `QdrantFilterBuilder` ✓
Error/info: inline text — not using shared `ErrorState`.
Results: `DataTable` ✓.
Empty state: inline `<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">` — not using `EmptyState`.

### Vector Map 3D (`vector-map-3d.tsx` — 239 lines)

**Shared component** used by both pgvector and sqlite-vec maps ✓.

Loading: inline `<Loader2 className="size-5 animate-spin">` — not using `LoadingState`.
Error: inline `<div className="p-4 text-sm text-destructive">` — not using `ErrorState`.
Empty: inline `<div className="h-full flex items-center justify-center text-sm text-muted-foreground">` — not using `EmptyState`.

Header: `px-3 py-2 border-b border-border flex items-center gap-3 text-xs` — consistent.
Hover tooltip: `bg-popover border border-border rounded-md shadow-md p-2 text-xs max-w-64` — consistent.
Controls hint: `absolute bottom-2 left-3 text-xs text-muted-foreground/70` — consistent.

### Qdrant Vector Map (`qdrant-vector-map.tsx` — 393 lines)

**Does NOT use shared `VectorMap3D`** — has its own `useVectorScene` hook with duplicated Three.js scene setup.

Differences from `VectorMap3D`:

- Color-by payload field feature (with legend)
- Uses `vertexColors` material instead of single color
- Has `useVectorScene` hook encapsulating scene lifecycle
- Same BG_DARK/BG_LIGHT constants (duplicated)
- Same OrbitControls setup (duplicated)
- Same hover/click interaction (duplicated)

Loading: inline `<Spinner size="lg">` — not using `LoadingState`.
Error: inline `<div className="p-4 text-sm text-destructive">` — not using `ErrorState`.
Empty: inline text — not using `EmptyState`.

### Postgres Vector Map (`postgres-vector-map.tsx` — 49 lines)

Uses shared `VectorMap3D` ✓. Thin wrapper — just data fetching + props mapping.

### SQLite Vec Map (`sqlite-vec-map.tsx` — 45 lines)

Uses shared `VectorMap3D` ✓. Thin wrapper — same pattern as PG map.

## Key Findings

1. **Vector query is already unified** — `vector-query.tsx` handles both pgvector and sqlite-vec
2. **PG filter input height inconsistency** — uses `h-9` while all other inputs use `h-7`
3. **Qdrant query text/similar inputs** — use `h-9` while control row uses `h-7`
4. **Qdrant vector map does NOT use shared `VectorMap3D`** — has its own 393-line implementation with duplicated Three.js code
5. **No shared loading/error/empty states** in any vector view — all use inline markup
6. **Export dropdown in `postgres-vector-results.tsx`** — uses raw className on `DropdownMenuTrigger` (same pattern fixed in SQL editor Phase 3)
7. **Qdrant mode tabs** — custom segmented control, not using shared Tabs component
8. **Filter builders differ** — PG uses free-text SQL WHERE, SQLite uses structured column/op/value, Qdrant uses `QdrantFilterBuilder` with JSON filter

## RESEARCH COMPLETE
