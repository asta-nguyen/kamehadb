# Phase 4: Non-SQL Explorer Consistency — Research

**Researched:** 2026-06-28
**Researcher:** Inline (orchestrator)

## Current State

### Shared ExplorerToolbar (`ui/explorer-toolbar.tsx`)

Created in Phase 2. Provides: title, count, search input, actions slot, refresh button (icon-xs).
**Not yet adopted by any explorer view** — all explorers use custom inline toolbars.

### Mongo View (`mongo-view-header.tsx`)

Layout: `px-4 py-2 border-b border-border`

- Search input: `h-7 pl-7 text-xs` with Search icon `size-3.5`
- Sort select: `h-7 w-28 text-xs`
- View mode buttons: `variant="outline" size="icon-sm"` with `!size-3.5` icons (lint warnings)
- Export dropdown: `variant="outline" size="icon"` — should be `icon-sm`
- Clear sort: `size="icon-sm"` ✓ (fixed in Phase 2)

**Issues:**

- `!size-3.5` class syntax triggers lint warnings (3 instances)
- Export button uses `size="icon"` — should be `size="icon-sm"` for consistency
- Does not use `ExplorerToolbar` component

### Mongo Query Toolbar (`mongo-query.tsx:79-204`)

Layout: `flex items-center gap-2 px-4 py-2 border-b border-border shrink-0`

- Database/collection selects: `h-7 text-xs`
- Run button: `size="sm"` with `h-7 text-xs gap-1.5 px-3` override
- Format button: `variant="ghost" size="sm"` with `h-7 text-xs gap-1.5 px-2` override
- Chart toggle: same pattern
- kbd element: ✓ present
- Separator: ✓ present

**Issues:**

- Run button has `h-7` override on `size="sm"` — redundant
- Format/chart buttons have `h-7` overrides — redundant
- This is a query toolbar (like SQL editor), not an explorer toolbar — different pattern

### Redis Explorer (`redis-explorer.tsx`)

Layout: `flex h-full` — split view with key list (w-48) and details panel

Key list toolbar:

- Search: `h-6 pl-6 pr-2 text-xs` with Search icon `size-3` — close to ExplorerToolbar pattern
- Key count: `text-xs text-muted-foreground`
- Stats toggle: `variant="ghost" size="icon"` with `size-3` icon — should be `size="icon-xs"`

Key list items:

- `variant="ghost" size="sm"` buttons with `w-full font-normal`
- Type icon: `size-3`
- Type label: `text-xs uppercase`

Key details panel:

- Header: `px-3 py-2 border-b border-border`
- Close button: `variant="ghost" size="icon-sm"` ✓
- Value rendering: custom `formatValue()` function with type-specific rendering

**Issues:**

- Stats toggle uses `size="icon"` — should be `size="icon-xs"`
- No loading/empty states using shared components (uses inline Spinner/text)
- No `ExplorerToolbar` adoption

### Qdrant View (`qdrant-view.tsx`)

Layout: `flex flex-col h-full`

Header toolbar: `px-3 py-2 border-b border-border flex items-center justify-between gap-2`

- Collection name: `font-mono text-sm truncate`
- Stats toggle: `variant="ghost" size="sm"` with `text-xs px-1.5 py-0.5` override
- Visualize button: `variant="ghost" size="sm"` with `mr-1.5` spacing
- Vector Search button: same pattern

Filter section: `px-3 py-2 border-b border-border space-y-2`

- Uses `QdrantFilterBuilder` component
- Apply/Clear buttons: `variant="outline" size="sm"` / `variant="ghost" size="sm"`

Point table:

- Uses `DataTable` ✓
- Prefix action button: `variant="ghost" size="icon"` — should be `size="icon-sm"` or `icon-xs`
- Loading: inline Spinner (not shared LoadingState)
- Error: inline text (not shared ErrorState)

Pagination footer: `px-3 py-1.5 border-t border-border`

- Page size input: `h-6 w-16` with custom styling
- Page input: same pattern
- Prev/Next: `variant="ghost" size="icon-sm"` ✓

**Issues:**

- Stats toggle has `px-1.5 py-0.5` override on `size="sm"` — should use standard size
- Point action button uses `size="icon"` — should be `size="icon-sm"`
- No shared loading/error states
- No `ExplorerToolbar` adoption

### Qdrant Filter Builder (`qdrant-filter-builder.tsx`)

- Remove row button: `variant="ghost" size="icon"` — should be `size="icon-xs"`
- Add condition button: `variant="ghost" size="sm"` ✓
- Inputs: `h-7 text-xs` ✓

### TigerBeetle Explorer (`tigerbeetle-explorer.tsx`)

Layout: `space-y-1 px-2 py-2`

Header:

- Title: `text-xs font-medium text-muted-foreground uppercase tracking-wide` with count in parens
- Refresh: `variant="ghost" size="icon-xs"` ✓ (fixed in Phase 2)

Account nodes:

- Toggle button: `variant="ghost" size="sm"` with custom layout
- Balance color: hardcoded `text-emerald-500` / `text-red-500` — should use tokens
- Transfer direction dot: hardcoded `bg-red-400` / `bg-emerald-400` — should use tokens

**Issues:**

- Hardcoded `text-emerald-500`, `text-red-500`, `bg-red-400`, `bg-emerald-400` — should use `--success`/`--destructive` tokens
- No shared loading/empty states
- Close to ExplorerToolbar pattern but not using it

### JSON/Document Rendering

Current patterns across views:

- **Redis**: Custom `formatValue()` with type-specific rendering (string, hash, list, set, zset)
- **Mongo**: `JSON.stringify(value, null, 2)` in document cards and table view
- **Qdrant**: `JSON.stringify(value)` in DataTable cells
- **SQL results**: `JSON.stringify(value)` for object values, `text-primary` color
- **Record detail tabs**: `JSON.stringify` for detail view

**No shared JSON rendering component exists.** Each view rolls its own.

## Key Findings

1. **No explorer uses `ExplorerToolbar`** — all have custom inline toolbars
2. **Button sizing inconsistencies**: `size="icon"` used where `icon-xs` or `icon-sm` would be correct (Redis stats, Qdrant point actions, Qdrant filter builder remove, Mongo export)
3. **Hardcoded colors in TigerBeetle**: `text-emerald-500`, `text-red-500`, `bg-red-400`, `bg-emerald-400`
4. **No shared JSON rendering**: each view has its own approach
5. **`!size-3.5` lint warnings** in Mongo view header (3 instances)
6. **Redundant `h-7` overrides** on `size="sm"` buttons in Mongo query toolbar
7. **Loading/error states** are inline, not using shared `LoadingState`/`ErrorState` components

## RESEARCH COMPLETE
