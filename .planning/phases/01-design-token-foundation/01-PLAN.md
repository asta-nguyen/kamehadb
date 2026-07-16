# Phase 1: Design Token Foundation — Plan

**Phase:** 1
**Name:** Design Token Foundation
**Created:** 2026-06-28
**Requirements:** DSN-01, DSN-02, DSN-03, DSN-04, DSN-05

## Goal

Establish the shared design token system (spacing, color, typography, radius, shadow) as the single source of truth, documented in a style guide.

## Plan 1: Audit Existing Token Usage

**Type:** standard
**Goal:** Catalog all ad-hoc spacing, color, typography, and shadow values used across components to establish a baseline for token standardization.

### Tasks

1. **Audit spacing values** — grep all `p[x|y|t|b|l|r]-`, `m[x|y|t|b|l|r]-`, `gap-`, `space-` utilities across `src/components/` and `src/` to catalog every spacing value in use. Group by frequency and identify outliers.

2. **Audit typography values** — grep all `text-`, `font-`, `leading-`, `tracking-` utilities to catalog font sizes, weights, line heights, and letter spacing values in use.

3. **Audit shadow and border usage** — grep all `shadow-`, `border-`, `ring-` utilities to catalog shadow and border patterns.

4. **Audit color usage** — grep for hardcoded color values (hex, rgb, oklch) that bypass the CSS variable system. Identify any `text-[#...]` or `bg-[#...]` arbitrary values.

5. **Write audit summary** — document findings in `01-AUDIT.md` in the phase directory, including frequency tables and outlier list.

### Files

- `apps/desktop/src/components/**/*.tsx`
- `apps/desktop/src/**/*.tsx`
- `apps/desktop/src/index.css`

### Acceptance Criteria

- [ ] All spacing utilities catalogued with frequency counts
- [ ] All typography utilities catalogued with frequency counts
- [ ] All shadow/border patterns catalogued
- [ ] All hardcoded color values identified
- [ ] Audit summary written to `01-AUDIT.md`

---

## Plan 2: Define Design Tokens in CSS

**Type:** standard
**Goal:** Add missing design tokens (spacing, typography, status colors, shadows) to `index.css` and ensure all tokens are mapped to TailwindCSS v4 `@theme` block.

### Tasks

1. **Add spacing scale tokens** — define `--space-*` CSS custom properties in `:root` and map them in `@theme inline` as `--spacing-*` so TailwindCSS generates matching utilities. Use 4px base scale: 1/2/3/4/6/8/12.

2. **Add typography scale tokens** — define `--text-*` tokens for font sizes (xs/sm/base/lg/xl/2xl) and map in `@theme inline`. Add `--font-weight-*` tokens for weights (normal/medium/semibold/bold).

3. **Add status color tokens** — define `--success`, `--warning`, `--info` (and foreground variants) in `:root` and `.dark`. Map in `@theme inline` as `--color-success`, `--color-warning`, `--color-info`.

4. **Add shadow tokens** — define `--shadow-sm`, `--shadow-md`, `--shadow-lg` in `:root` and map in `@theme inline` as `--shadow-*`.

5. **Verify token compilation** — run `pnpm --filter @kamehadb/desktop build` to confirm CSS compiles without errors and tokens are available as TailwindCSS utilities.

### Files

- `apps/desktop/src/index.css`

### Acceptance Criteria

- [ ] Spacing tokens defined and mapped to TailwindCSS theme
- [ ] Typography tokens defined and mapped
- [ ] Status colors (success/warning/info) defined for light and dark
- [ ] Shadow tokens defined and mapped
- [ ] Build passes with new tokens
- [ ] No visual regressions in existing components

---

## Plan 3: Refactor Base UI Components to Use Tokens

**Type:** standard
**Goal:** Update `variants.ts` and base UI components to reference the new design tokens instead of hardcoded values.

### Tasks

1. **Refactor `variants.ts` button sizes** — replace hardcoded `h-8`, `h-6`, `h-7`, `h-9` with token-based spacing. Replace hardcoded gaps and padding with token-based utilities.

2. **Refactor `variants.ts` badge** — replace hardcoded `h-5`, `px-2` with token-based values.

3. **Audit and fix `components/ui/` base components** — check Button, Input, Dialog, Sheet, DropdownMenu, DataTable, and other base components for hardcoded spacing/typography that should use tokens.

4. **Run typecheck and tests** — `pnpm --filter @kamehadb/desktop exec tsc --noEmit` and `pnpm --filter @kamehadb/desktop test` to verify no regressions.

### Files

- `apps/desktop/src/components/ui/variants.ts`
- `apps/desktop/src/components/ui/button.tsx`
- `apps/desktop/src/components/ui/input.tsx`
- `apps/desktop/src/components/ui/dialog.tsx`
- `apps/desktop/src/components/ui/sheet.tsx`
- `apps/desktop/src/components/data-table.tsx`

### Acceptance Criteria

- [ ] Button variants use token-based spacing
- [ ] Badge variants use token-based spacing
- [ ] Base UI components audited and fixed
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] No visual regressions

---

## Plan 4: Write Design System Documentation

**Type:** standard
**Goal:** Create `DESIGN-SYSTEM.md` documenting all design tokens, their usage guidelines, and component patterns.

### Tasks

1. **Document spacing scale** — table of tokens, pixel values, and usage guidelines (when to use each step).

2. **Document color palette** — table of semantic color tokens with light/dark values, usage guidelines, and status colors.

3. **Document typography scale** — table of font size tokens, weights, line heights, and when to use each (headings vs body vs captions vs code).

4. **Document radius and shadow tokens** — table with usage guidelines (cards vs dialogs vs inputs vs popovers).

5. **Document component sizing conventions** — button sizes (icon-xs vs sm vs default vs lg), when to use each, and standard patterns for toolbars, row actions, and dialog buttons.

6. **Add "Do/Don't" examples** — concrete examples of correct vs incorrect token usage to guide future development.

### Files

- `DESIGN-SYSTEM.md` (new, at project root or `apps/desktop/`)

### Acceptance Criteria

- [ ] All token categories documented (spacing, color, typography, radius, shadow)
- [ ] Usage guidelines for each token
- [ ] Component sizing conventions documented
- [ ] Do/Don't examples included
- [ ] Documentation is discoverable (linked from AGENTS.md or README)

---

## Risks

| Risk                                                      | Mitigation                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| TailwindCSS v4 token mapping syntax differs from v3       | Verify with build + visual check; v4 uses `@theme inline` block   |
| Refactoring variants.ts breaks existing component styling | Run typecheck + tests + visual verification after each change     |
| Spacing token names conflict with TailwindCSS defaults    | Use `--space-*` prefix, verify no collisions                      |
| Status colors clash with existing destructive token       | Use distinct hue ranges (green/success, amber/warning, blue/info) |

## Dependencies

- None — Phase 1 is the foundation phase

---

_Plan created: 2026-06-28_
