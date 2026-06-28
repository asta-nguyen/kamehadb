# Phase 1: Design Token Foundation — Research

**Researched:** 2026-06-28
**Researcher:** Inline (orchestrator)

## Current State

### CSS Architecture

- **TailCSS v4** via `@tailwindcss/vite` plugin (no `tailwind.config.js` — uses CSS-first config)
- **Shadcn/ui** base-nova style with `neutral` base color, CSS variables enabled
- **Theme system:** `:root` (light) + `.dark` class (dark mode) with OKLCH color values
- **Fonts:** Geist Variable (sans) + Geist Mono Variable (mono) via `@fontsource-variable`
- **Animations:** `tw-animate-css` plugin

### Existing Design Tokens (in `index.css`)

**Color tokens (already semantic):**

- Surface: `--background`, `--foreground`, `--card`, `--popover`, `--sidebar`
- Interactive: `--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`
- Borders/inputs: `--border`, `--input`, `--ring`
- Charts: `--chart-1` through `--chart-5`
- Syntax: `--syntax-keyword`, `--syntax-string`, `--syntax-number`, `--syntax-comment`, `--syntax-function`
- Sidebar variants: `--sidebar-*` (primary, accent, border, ring, foreground)

**Radius tokens (already defined):**

- Base: `--radius: 0.625rem`
- Scale: `--radius-sm` (0.6x), `--radius-md` (0.8x), `--radius-lg` (1x), `--radius-xl` (1.4x), `--radius-2xl` (1.8x), `--radius-3xl` (2.2x), `--radius-4xl` (2.6x)

**Font tokens:**

- `--font-sans`, `--font-mono`, `--font-heading` (all set to Geist)

### What's Missing

1. **No spacing scale tokens** — TailwindCSS v4 default spacing is used implicitly (px-2, py-4, gap-1.5, etc.) with no semantic naming or documentation
2. **No typography scale tokens** — font sizes are hardcoded per component (text-sm, text-xs, text-lg) with no documented scale
3. **No shadow tokens** — shadows are used ad-hoc (`shadow-sm`, `shadow-md`) without semantic naming
4. **No status color tokens** — success/warning/info colors are not defined (only `--destructive` exists for errors)
5. **No design system documentation** — tokens exist but are not documented in a style guide

### Component Variants (`variants.ts`)

Button variants use hardcoded sizes:

- `h-8` (default), `h-6` (xs), `h-7` (sm), `h-9` (lg)
- `size-8` (icon), `size-6` (icon-xs), `size-7` (icon-sm), `size-9` (icon-lg)
- Gap values: `gap-1`, `gap-1.5`
- Padding: `px-2`, `px-2.5`, `px-1.5`

Badge: `h-5`, `px-2`, `text-xs`

### Key Findings

1. **Color system is solid** — Shadcn/ui semantic tokens are well-structured in OKLCH. Missing: success/warning/info status tokens.
2. **Radius system is good** — derived scale from base `--radius`. No changes needed.
3. **Spacing is the biggest gap** — no tokens, all ad-hoc Tailwind utilities. Need to audit and standardize.
4. **Typography has no scale** — font sizes are per-component. Need a documented type scale.
5. **Shadows are minimal** — app uses very few shadows (flat design). May just need 2-3 tokens.
6. **No documentation** — tokens exist in CSS but are not discoverable by developers.

## Recommendations

### Spacing Scale (4px base)

```
--space-1: 0.25rem  (4px)
--space-2: 0.5rem   (8px)
--space-3: 0.75rem  (12px)
--space-4: 1rem     (16px)
--space-6: 1.5rem   (24px)
--space-8: 2rem     (32px)
--space-12: 3rem    (48px)
```

### Typography Scale

```
--text-xs: 0.75rem   (12px)
--text-sm: 0.875rem  (14px)
--text-base: 1rem    (16px)
--text-lg: 1.125rem  (18px)
--text-xl: 1.25rem   (20px)
--text-2xl: 1.5rem   (24px)
```

### Status Colors

```
--success: oklch(0.6 0.15 145)
--warning: oklch(0.7 0.15 85)
--info: oklch(0.6 0.15 250)
```

### Shadow Tokens

```
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.075)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1)
```

## Validation Architecture

N/A — this phase produces CSS tokens and documentation, no runtime behavior changes to validate.

## RESEARCH COMPLETE
