# Phase 3: SQL Editor, Results & Chrome Consistency — Plan

**Phase:** 3
**Name:** SQL Editor, Results & Chrome Consistency
**Created:** 2026-06-28
**Requirements:** SQL-01, SQL-02, SQL-03, SQL-04, CHR-01, CHR-02, CHR-03, CHR-05

## Goal

Apply design tokens and shared components to the SQL editor, query results, schema sidebar, tab bar, and dialogs.

## Plan 1: Unify SQL Editor Toolbar

**Type:** standard
**Goal:** Align SQL editor toolbar with Mongo query toolbar pattern — add kbd hint, separator, and consistent button placement.

### Tasks

1. **Add kbd hint to SQL editor toolbar** — replace plain text "Ctrl+Enter to run" with kbd element matching Mongo toolbar pattern:

   ```tsx
   <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 text-[10px] font-mono text-muted-foreground/50">
     {isRunning ? 'Esc' : 'Ctrl+Enter'}
   </kbd>
   ```

   Remove the separate `text-xs text-muted-foreground` span.

2. **Add separator between Run button and toggle buttons** — add `<div className="w-px h-4 bg-border mx-0.5" />` before chart/history toggle buttons, matching Mongo toolbar.

3. **Move toggle buttons to right side** — ensure chart and history buttons are in a right-aligned group with `ml-auto` or `flex-1` spacer (already have `<div className="flex-1" />`).

4. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/sql-editor.tsx` (toolbar section, ~lines 892-927)

### Acceptance Criteria

- [ ] SQL editor toolbar shows kbd element for Ctrl+Enter / Esc
- [ ] Separator between Run button and toggle buttons
- [ ] Toolbar layout matches Mongo query toolbar pattern
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 2: Fix Query Results Table Styling

**Type:** standard
**Goal:** Fix export dropdown to use Button component and standardize pagination button sizes.

### Tasks

1. **Fix export dropdown trigger** — replace raw inline className string with `Button` component:

   ```tsx
   <DropdownMenuTrigger render={<Button variant="ghost" size="sm" title="Export" />}>
     <Download className="size-3.5" />
   </DropdownMenuTrigger>
   ```

2. **Standardize pagination buttons** — remove `h-7 px-2 text-xs` overrides from Prev/Next buttons, use `size="sm"` with `className="text-xs"` only if needed.

3. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/sql-editor.tsx` (QueryResultTable, ~lines 530-571)

### Acceptance Criteria

- [ ] Export dropdown trigger uses Button component
- [ ] Pagination buttons use standard Button sizes
- [ ] No raw inline className strings for button-like elements
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 3: Replace Hardcoded Status Colors with Design Tokens

**Type:** standard
**Goal:** Replace all hardcoded hex colors in sidebar helpers, status dots, and tab bar with CSS variable design tokens.

### Tasks

1. **Update `sidebar.helpers.tsx` `getIndicatorColor()`** — replace hardcoded hex with CSS variable references:

   ```tsx
   export function getIndicatorColor(conn: ConnectionProfile, status: ConnectionStatus) {
     if (status === 'connected') return conn.color || 'var(--success)';
     if (status === 'slow') return 'var(--warning)';
     if (status === 'reconnecting') return 'var(--warning)';
     return 'var(--destructive)';
   }
   ```

   Note: `reconnecting` uses `--warning` (amber) instead of `--warning` (orange) — close enough, and keeps to the token system.

2. **Update `workspace-tab-bar.tsx` signal colors** — replace hardcoded hex with CSS variables:

   ```tsx
   const signalColor =
     status === 'connected' || status === 'slow'
       ? 'var(--success)'
       : status === 'reconnecting'
         ? 'var(--warning)'
         : status === 'disconnected'
           ? 'var(--destructive)'
           : 'var(--muted-foreground)';
   ```

3. **Fix sidebar refresh button size** — change `size="icon" className="opacity-0 size-6"` to `size="icon-xs" className="opacity-0"`.

4. **Fix tab bar close button icon** — change `X className="size-2.5"` to `X className="size-3"` to match icon-xs standard.

5. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/sidebar.helpers.tsx` (getIndicatorColor)
- `apps/desktop/src/components/workspace-tab-bar.tsx` (signalColor, close button icon)
- `apps/desktop/src/components/sidebar.tsx` (refresh button size)

### Acceptance Criteria

- [ ] No hardcoded hex colors in sidebar helpers or tab bar
- [ ] Status dots use `--success`, `--warning`, `--destructive` tokens
- [ ] Sidebar refresh button uses standard icon-xs size
- [ ] Tab bar close button uses standard size-3 icon
- [ ] Typecheck passes
- [ ] Build passes

---

## Plan 4: Audit Dialog Usage & Add Keyboard Shortcut Hints

**Type:** standard
**Goal:** Verify all dialogs use shared Dialog component with consistent header/footer. Add keyboard shortcut hint to SQL editor.

### Tasks

1. **Audit dialog usages** — grep for `Dialog` usage across all components and verify they use `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` from the shared `ui/dialog.tsx`:
   - `connection-dialog.tsx`
   - `postgres-backup-dialog.tsx`
   - `postgres-restore-dialog.tsx`
   - `sidebar-delete-dialog.tsx`
   - Any other dialog usages

2. **Fix any dialogs not using shared components** — replace ad-hoc header/footer markup with `DialogHeader`/`DialogFooter`/`DialogTitle`/`DialogDescription`.

3. **Add kbd hint to SQL editor toolbar** (if not done in Plan 1) — ensure consistent with Mongo toolbar pattern.

4. **Run typecheck and build** — verify no regressions.

### Files

- `apps/desktop/src/components/connection-dialog.tsx` (audit)
- `apps/desktop/src/components/postgres-backup-dialog.tsx` (audit)
- `apps/desktop/src/components/postgres-restore-dialog.tsx` (audit)
- `apps/desktop/src/components/sidebar-delete-dialog.tsx` (audit)
- `apps/desktop/src/components/sql-editor.tsx` (kbd hint, if needed)

### Acceptance Criteria

- [ ] All dialogs use shared DialogHeader/DialogFooter/DialogTitle/DialogDescription
- [ ] No ad-hoc dialog header/footer markup
- [ ] SQL editor has kbd hint element
- [ ] Typecheck passes
- [ ] Build passes

---

## Risks

| Risk                                              | Mitigation                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| CSS variable colors don't render in inline styles | CSS variables work in inline styles — verified by existing usage in sidebar-status-dot.tsx |
| Dialog audit reveals too many fixes               | Keep changes minimal — only fix clear deviations from shared pattern                       |
| Tab bar color change causes visual regression     | The token values are very close to the hex values — minimal visual shift                   |

## Dependencies

- Phase 1 (design tokens — status colors used in Plan 3)
- Phase 2 (shared components — LoadingState/ErrorState can be used in SQL editor)

---

_Plan created: 2026-06-28_
