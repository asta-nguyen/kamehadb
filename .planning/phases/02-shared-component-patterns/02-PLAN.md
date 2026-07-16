# Phase 2: Shared Component Patterns — Plan

**Phase:** 2
**Name:** Shared Component Patterns
**Created:** 2026-06-28
**Requirements:** CMP-01, CMP-02, CMP-03, CMP-04, CMP-05, CMP-06, CHR-04

## Goal

Build the shared state and toolbar components that all explorer views will consume, replacing duplicated implementations.

## Plan 1: Create Shared State Components

**Type:** standard
**Goal:** Create EmptyState, LoadingState, and ErrorState components that replace the 3-4 different patterns currently used across explorer views.

### Tasks

1. **Create `EmptyState` component** — `components/ui/empty-state.tsx`
   - Props: `icon?` (Lucide component), `title` (string), `description?` (string), `action?` (ReactNode for optional button/link), `className?`
   - Layout: centered flex column, `text-muted-foreground`, icon at `size-8 opacity-40`, title at `text-sm font-medium`, description at `text-xs`
   - Compact variant for sidebar explorers: `size="compact"` uses smaller padding and text

2. **Create `LoadingState` component** — `components/ui/loading-state.tsx`
   - Props: `size?` ('sm' | 'md' | 'lg', default 'md'), `className?`
   - Uses existing `Spinner` component
   - Layout: centered flex, `py-4` default (compact: `py-2`)
   - Replaces all 3 current loading patterns

3. **Create `ErrorState` component** — `components/ui/error-state.tsx`
   - Props: `error` (Error | string | unknown), `onRetry?` (() => void), `className?`, `compact?` (boolean)
   - Layout: `AlertCircle` icon + error message, optional retry button
   - Compact variant for sidebar: inline with `text-xs`, full variant for panels: centered with `text-sm`
   - Error message extraction: `error instanceof Error ? error.message : String(error)`

4. **Write unit tests** — `components/ui/__tests__/empty-state.test.tsx`, `loading-state.test.tsx`, `error-state.test.tsx`
   - Test rendering with/without optional props
   - Test compact vs full variants
   - Test retry button click handler

### Files

- `apps/desktop/src/components/ui/empty-state.tsx` (new)
- `apps/desktop/src/components/ui/loading-state.tsx` (new)
- `apps/desktop/src/components/ui/error-state.tsx` (new)
- `apps/desktop/src/components/ui/__tests__/` (new)

### Acceptance Criteria

- [ ] EmptyState renders icon, title, description, and optional action
- [ ] EmptyState has compact variant for sidebar use
- [ ] LoadingState wraps existing Spinner with consistent layout
- [ ] ErrorState shows error message with optional retry button
- [ ] ErrorState has compact variant for sidebar use
- [ ] Unit tests pass
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 2: Create ExplorerToolbar Component

**Type:** standard
**Goal:** Create a shared ExplorerToolbar component with consistent slots for title, filter, actions, and refresh.

### Tasks

1. **Create `ExplorerToolbar` component** — `components/ui/explorer-toolbar.tsx`
   - Props: `title?` (string), `count?` (number), `searchValue?` (string), `onSearchChange?` ((v: string) => void), `searchPlaceholder?` (string), `actions?` (ReactNode for right-side buttons), `onRefresh?` (() => void), `isRefreshing?` (boolean), `className?`
   - Layout: `flex items-center justify-between px-2 py-1`, uppercase label on left, actions on right
   - Search: `Search` icon + `Input h-6 text-xs` (compact for sidebar)
   - Refresh: `RefreshCw` icon button, `size="icon-xs"`, spin animation when `isRefreshing`
   - Only renders search input when `searchValue` and `onSearchChange` are both provided
   - Only renders refresh button when `onRefresh` is provided

2. **Write unit tests** — `components/ui/__tests__/explorer-toolbar.test.tsx`
   - Test rendering with minimal props (title only)
   - Test search input change handler
   - Test refresh button click
   - Test actions slot rendering

### Files

- `apps/desktop/src/components/ui/explorer-toolbar.tsx` (new)
- `apps/desktop/src/components/ui/__tests__/explorer-toolbar.test.tsx` (new)

### Acceptance Criteria

- [ ] ExplorerToolbar renders title with count badge
- [ ] Search input only appears when searchValue/onSearchChange provided
- [ ] Refresh button only appears when onRefresh provided
- [ ] Actions slot renders on the right side
- [ ] Compact sizing consistent with sidebar explorer views
- [ ] Unit tests pass
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 3: Create FilterBar Component

**Type:** standard
**Goal:** Create a shared FilterBar component for structured filter building, reusable by vector search and explorer views.

### Tasks

1. **Create `FilterBar` component** — `components/ui/filter-bar.tsx`
   - Props: `filters` (array of `{ column: string; operator: string; value: string }`), `columns` (string[] for column suggestions), `onChange` ((filters) => void), `className?`
   - Layout: vertical stack of filter rows, each with: column select, operator select, value input, remove button
   - "Add filter" button at bottom with `Plus` icon
   - Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `ILIKE` (matching existing filter-parser.ts)
   - Compact sizing: `h-7` inputs, `text-xs`, `gap-1.5`

2. **Write unit tests** — `components/ui/__tests__/filter-bar.test.tsx`
   - Test adding a filter
   - Test removing a filter
   - Test changing filter values
   - Test empty state (no filters)

### Files

- `apps/desktop/src/components/ui/filter-bar.tsx` (new)
- `apps/desktop/src/components/ui/__tests__/filter-bar.test.tsx` (new)

### Acceptance Criteria

- [ ] FilterBar renders existing filters with column/operator/value controls
- [ ] "Add filter" button adds a new empty filter row
- [ ] Remove button removes a filter row
- [ ] onChange callback fires with updated filter array
- [ ] Column suggestions populated from props
- [ ] Unit tests pass
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 4: Standardize Toast Usage & Button Sizing

**Type:** standard
**Goal:** Create a thin wrapper for consistent toast usage and audit/fix button sizing deviations across components.

### Tasks

1. **Create toast utility wrapper** — `lib/toast.ts`
   - Re-exports `toast` from `sonner` with preset styles
   - `toastSuccess(message)` — green success toast
   - `toastError(message)` — red error toast
   - `toastInfo(message)` — blue info toast
   - `toastWarning(message)` — amber warning toast
   - Each uses the status color tokens from Phase 1

2. **Audit and fix button sizing deviations** — grep for non-standard button sizes
   - Fix `tigerbeetle-explorer.tsx` refresh button: `size-5` → `size="icon-xs"` (size-6)
   - Fix `mongo-view-header.tsx` dropdown trigger: raw `size-8` → `size="icon"` (already size-8, just use Button component)
   - Fix `mongo-view-header.tsx` sort clear button: `h-7 w-7` → `size="icon-sm"` (size-7)
   - Fix `mongo-view-header.tsx` view mode buttons: ensure consistent `size="icon-sm"`

3. **Run typecheck and tests** — verify no regressions

### Files

- `apps/desktop/src/lib/toast.ts` (new)
- `apps/desktop/src/components/tigerbeetle-explorer.tsx` (fix button size)
- `apps/desktop/src/components/mongo-view-header.tsx` (fix button sizes)
- `apps/desktop/src/components/mongo-view.tsx` (use toast wrapper if applicable)

### Acceptance Criteria

- [ ] Toast utility wrapper created with success/error/info/warning presets
- [ ] TigerBeetle refresh button uses standard icon-xs size
- [ ] Mongo view header buttons use standard Button sizes
- [ ] No non-standard button size overrides remain
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Build passes

---

## Risks

| Risk                                                           | Mitigation                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| New shared components don't match existing visual style        | Use exact same Tailwind classes from current implementations |
| FilterBar API doesn't match existing filter-parser.ts contract | Align operator list with filter-parser.ts                    |
| Toast wrapper adds unnecessary abstraction                     | Keep it thin — just preset styles, re-export sonner's toast  |
| Button size fixes cause layout shifts                          | Verify with build + visual check after each fix              |

## Dependencies

- Phase 1 (design tokens — status colors used in toast wrapper)

---

_Plan created: 2026-06-28_
