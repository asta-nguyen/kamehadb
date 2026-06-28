# Phase 3: SQL Editor, Results & Chrome Consistency — Research

**Researched:** 2026-06-28
**Researcher:** Inline (orchestrator)

## Current State

### SQL Editor Toolbar (`sql-editor.tsx:892-927`)

Current layout: `flex items-center gap-2 px-4 py-2 border-b border-border shrink-0`

- Run button: `size="sm"` with Play icon, `gap-1.5`
- Status text: `text-xs text-muted-foreground` ("Ctrl+Enter to run" / "Running...")
- Chart toggle: `variant="ghost" size="sm"` with `showChart ? 'bg-muted' : ''`
- History toggle: `variant="ghost" size="sm"` with `showHistory ? 'bg-muted' : ''`

**Issues:**

- No kbd hint element (just plain text "Ctrl+Enter to run")
- No separator between Run button and toggle buttons
- Mongo query toolbar (`mongo-query.tsx:79-204`) has a similar layout but with kbd element and separator — should be unified

### Mongo Query Toolbar (`mongo-query.tsx:110-204`)

Layout: `flex items-center gap-2 px-4 py-2 border-b border-border shrink-0`

**Has:**

- kbd element: `px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 text-[10px] font-mono text-muted-foreground/50`
- Separator: `w-px h-4 bg-border mx-0.5`
- Result count: `text-[11px] text-muted-foreground tabular-nums`

**SQL editor toolbar lacks all of these.** The Mongo toolbar is the better reference.

### Query Results Table (`sql-editor.tsx:317-575`)

Uses `DataTable` component with:

- Column headers: `text-xs` with type annotation in `text-muted-foreground/60`
- Cell rendering: null values as italic muted, objects as `text-primary`, strings as plain
- Pagination footer: `text-xs text-muted-foreground` with row count, duration, truncated badge
- Prev/Next buttons: `variant="ghost" size="sm" className="h-7 px-2 text-xs"`
- Row limit Select: `h-7 text-xs w-22`
- Export dropdown: raw className string (not using Button component) — long inline class

**Issues:**

- Export dropdown trigger uses raw inline classes instead of Button component (line 563)
- Pagination buttons use `h-7` override on `size="sm"` — should use `size="icon-sm"` or standard size

### Workspace Tab Bar (`workspace-tab-bar.tsx`)

Layout: `flex h-8 shrink-0 items-center overflow-x-auto border-b border-border bg-muted/20`

- Tab: `flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border px-3 text-xs`
- Active: `border-b-2 border-b-primary bg-background`
- Inactive: `hover:bg-muted/50`
- Signal dot: `h-2 w-2 shrink-0 rounded-full` with **hardcoded hex colors**:
  - connected/slow: `#22c55e`
  - reconnecting: `#f97316`
  - disconnected: `#ef4444`
  - unknown: `#6b7280`
- Close button: `size="icon-xs"` with `X className="size-2.5"`
- Action buttons (New Query, Schema Graph, etc.): `size="sm"` with `flex h-full shrink-0 items-center justify-center px-2`

**Issues:**

- Hardcoded hex colors for status dots — should use design tokens (`--success`, `--warning`, `--destructive`)
- Tab close button icon is `size-2.5` (non-standard, smaller than icon-xs's size-3)
- Action buttons use `size="sm"` but override with `flex h-full` — should be `size="icon-sm"` or similar

### Sidebar Connection Cards (`sidebar.tsx:84-177`)

- Connection item: `group w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm`
- Active: `bg-muted/60 shadow-sm`
- Inactive: `hover:bg-muted/50`
- Refresh button: `size="icon" className="opacity-0 size-6"` — uses `size-6` override (should be `size="icon-xs"`)
- Tree expansion: `pl-2 ml-3 mt-1 border-border/60 border-l space-y-0.5`
- Group header: `flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30`

**Issues:**

- Refresh button uses `size="icon"` with `size-6` override — should be `size="icon-xs"`
- `ConnectionStatusDot` uses hardcoded hex colors via `getIndicatorColor()`:
  - connected: `#22c55e` (or `conn.color`)
  - slow: `#eab308`
  - reconnecting: `#f97316`
  - disconnected: `#ef4444`

### Dialog Component (`ui/dialog.tsx`)

Already well-structured with:

- `DialogHeader`: `flex flex-col gap-2`
- `DialogFooter`: `-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end`
- `DialogTitle`: `font-heading text-base leading-none font-medium`
- `DialogDescription`: `text-sm text-muted-foreground`

**Status:** Dialog component is consistent. Need to audit all dialog usages to ensure they use these shared components.

### Keyboard Shortcuts

- SQL editor: Ctrl+Enter to run (shown as plain text, not kbd element)
- Mongo query: Ctrl+Enter / Esc (shown as kbd element)
- No help overlay or shortcut discovery mechanism

## Key Findings

1. **SQL editor toolbar** lacks kbd hint and separator that Mongo toolbar has
2. **Query results** export dropdown uses raw inline classes instead of Button
3. **Tab bar** uses hardcoded hex colors for status dots — should use design tokens
4. **Sidebar** refresh button uses non-standard size override; status dot uses hardcoded hex colors
5. **Status colors** in `sidebar.helpers.tsx` are hardcoded hex — should use CSS variable tokens
6. **Dialog component** is consistent — just need to audit usages
7. **Keyboard shortcuts** inconsistent: SQL editor uses plain text, Mongo uses kbd element

## RESEARCH COMPLETE
