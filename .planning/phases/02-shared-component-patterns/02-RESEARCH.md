# Phase 2: Shared Component Patterns — Research

**Researched:** 2026-06-28
**Researcher:** Inline (orchestrator)

## Current State

### Loading States (3+ different patterns)

**Pattern A — Centered Spinner (most common):**

```tsx
<div className="flex items-center justify-center py-4">
  <Spinner size="md" />
</div>
```

Used in: `mongo-explorer.tsx`, `redis-explorer.tsx`, `qdrant-explorer.tsx`, `tigerbeetle-explorer.tsx`

**Pattern B — Wrapped in p-4:**

```tsx
<div className="p-4">
  <div className="flex items-center justify-center h-32">
    <Spinner size="lg" />
  </div>
</div>
```

Used in: `mongo-view.tsx` (DocumentsPanel)

**Pattern C — py-8 variant:**

```tsx
<div className="flex items-center justify-center py-8">
  <Spinner size="lg" />
</div>
```

Used in: `qdrant-view.tsx`, `schema-timeline.tsx`

**Spinner component:** `ui/spinner.tsx` — uses `Loader2` icon, sizes: sm (size-3), md (size-4), lg (size-5)

### Empty States (4+ different patterns)

**Pattern A — Italic text:**

```tsx
<div className="px-2 py-1 text-muted-foreground text-xs italic">
  {collections?.length === 0 ? 'No collections' : 'No matches'}
</div>
```

Used in: `qdrant-explorer.tsx`

**Pattern B — Centered text:**

```tsx
<div className="flex items-center justify-center h-32 text-muted-foreground">No documents found</div>
```

Used in: `mongo-view.tsx`

**Pattern C — Card with icon:**

```tsx
<Card>
  <CardContent className="py-12 text-center text-sm text-muted-foreground">
    <Camera className="size-8 mx-auto mb-2 opacity-40" />
    <p>No snapshots yet</p>
    <p className="text-xs mt-1">Click "Capture Snapshot" to save the current schema</p>
  </CardContent>
</Card>
```

Used in: `schema-timeline.tsx`

**Pattern D — Simple text:**

```tsx
<p className="text-xs text-muted-foreground text-center py-2">No accounts found</p>
```

Used in: `tigerbeetle-explorer.tsx`

### Error States (3+ different patterns)

**Pattern A — Inline with AlertCircle:**

```tsx
<div className="flex items-start px-2 py-1 text-destructive text-xs gap-1.5">
  <AlertCircle className="mt-0.5 shrink-0 size-3" />
  <span className="break-all">{error instanceof Error ? error.message : 'Failed to load'}</span>
</div>
```

Used in: `qdrant-explorer.tsx`

**Pattern B — Centered with icon:**

```tsx
<div className="flex items-center justify-center h-32 text-destructive">
  <AlertCircle className="size-5 mr-2" />
  {error instanceof Error ? error.message : 'Failed to load documents'}
</div>
```

Used in: `mongo-view.tsx`

**Pattern C — Plain text:**

```tsx
<div className="p-4 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load points'}</div>
```

Used in: `qdrant-view.tsx`, `schema-timeline.tsx`

### Toolbars (completely different per view)

**Mongo (`mongo-view-header.tsx`):**

- Full toolbar: search input, sort select, view mode buttons (list/table/chart), export dropdown
- Layout: `px-4 py-2 border-b border-border`, flex-wrap
- Button sizes: `size="icon"` with `h-7 w-7` overrides, `size-8` for dropdown trigger

**Qdrant (`qdrant-explorer.tsx`):**

- Minimal: search input only
- Layout: `px-2 py-1`
- Input: `h-6 text-xs`

**TigerBeetle (`tigerbeetle-explorer.tsx`):**

- Label + refresh button only
- Layout: `flex items-center justify-between`
- Button: `size="icon" className="size-5"` (smaller than standard icon-xs)

**Redis (`redis-explorer.tsx`):**

- No toolbar — search is inline in key list

### Toast/Notifications

**Sonner** is already installed and configured:

- `ui/sonner.tsx` — Toaster component with theme support
- Uses CSS variables for styling (popover bg, border, radius)
- Icons: CircleCheck, Info, TriangleAlert, OctagonX, Loader2
- Already mounted in the app

**Usage:** `import { toast } from 'sonner'` — already available but not consistently used.

### Filter Inputs

**Pattern A — Search icon + Input:**

```tsx
<div className="relative">
  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
  <Input className="pl-6 pr-2 h-6 text-xs" />
</div>
```

Used in: `qdrant-explorer.tsx`, `redis-explorer.tsx`

**Pattern B — Larger variant:**

```tsx
<div className="relative">
  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
  <Input className="h-7 pl-7 text-xs" />
</div>
```

Used in: `mongo-view-header.tsx`

### Key Findings

1. **Loading states** — 3 patterns, all use Spinner but with different wrappers and sizes
2. **Empty states** — 4 patterns, ranging from italic text to Card with icon
3. **Error states** — 3 patterns, inconsistent icon usage and layout
4. **Toolbars** — completely different per explorer, no shared component
5. **Filter inputs** — 2 patterns, different sizes and icon sizes
6. **Toast** — Sonner already configured, just needs consistent usage
7. **Button sizing** — TigerBeetle uses `size-5` (non-standard), others use standard sizes

## RESEARCH COMPLETE
