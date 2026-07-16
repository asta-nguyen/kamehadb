# KamehaDB Design System

**Version:** 1.0 — Established 2026-06-28
**Stack:** TailwindCSS v4 + Shadcn/ui (base-nova) + Geist Variable fonts

---

## Spacing Scale

TailwindCSS v4 uses a 4px base spacing scale. All spacing utilities (`p-*`, `m-*`, `gap-*`, `space-*`, `w-*`, `h-*`) derive from this scale.

| Token | Utility            | Pixels | Usage                              |
| ----- | ------------------ | ------ | ---------------------------------- |
| 0.5   | `p-0.5`, `gap-0.5` | 2px    | Fine-tuning, badge padding         |
| 1     | `p-1`, `gap-1`     | 4px    | Tight spacing, icon gaps           |
| 1.5   | `p-1.5`, `gap-1.5` | 6px    | Small element padding, button gaps |
| 2     | `p-2`, `gap-2`     | 8px    | **Default gap**, standard padding  |
| 2.5   | `p-2.5`, `px-2.5`  | 10px   | Button horizontal padding          |
| 3     | `p-3`, `gap-3`     | 12px   | Card padding, section spacing      |
| 4     | `p-4`, `gap-4`     | 16px   | Large padding, section separation  |
| 6     | `p-6`              | 24px   | Page-level spacing                 |
| 8     | `p-8`              | 32px   | Empty state padding, hero spacing  |

**Rules:**

- Use `gap-2` (8px) as the default spacing between elements
- Use `p-3` (12px) for card/panel inner padding
- Use `p-4` (16px) for dialog/sheet content padding
- Never use arbitrary values like `p-[13px]` — stick to the scale

---

## Color Palette

All colors use OKLCH color space and are defined as CSS custom properties in `src/index.css`. Semantic tokens ensure automatic dark mode support.

### Surface Colors

| Token           | Light      | Dark       | Usage                           |
| --------------- | ---------- | ---------- | ------------------------------- |
| `bg-background` | white      | near-black | App background                  |
| `bg-card`       | white      | dark gray  | Cards, panels                   |
| `bg-popover`    | white      | dark gray  | Dropdowns, popovers             |
| `bg-muted`      | light gray | dark gray  | Muted backgrounds, hover states |
| `bg-secondary`  | light gray | dark gray  | Secondary buttons               |
| `bg-accent`     | light gray | dark gray  | Accent backgrounds              |
| `bg-sidebar`    | near-white | dark gray  | Sidebar background              |

### Interactive Colors

| Token                                        | Usage                             |
| -------------------------------------------- | --------------------------------- |
| `bg-primary` / `text-primary-foreground`     | Primary buttons, active states    |
| `bg-secondary` / `text-secondary-foreground` | Secondary buttons                 |
| `bg-destructive` / `text-destructive`        | Destructive actions, error states |
| `text-muted-foreground`                      | Secondary text, labels, hints     |
| `border-border`                              | Default borders                   |
| `ring-ring`                                  | Focus rings                       |

### Status Colors

| Token                                    | Usage                              |
| ---------------------------------------- | ---------------------------------- |
| `bg-success` / `text-success-foreground` | Success states, connection healthy |
| `bg-warning` / `text-warning-foreground` | Warning states, slow connection    |
| `bg-info` / `text-info-foreground`       | Informational states               |
| `bg-destructive` / `text-destructive`    | Error states, connection offline   |

**Usage:**

```tsx
<div className="bg-success/10 text-success">Connected</div>
<div className="bg-warning/10 text-warning">Slow</div>
<div className="bg-destructive/10 text-destructive">Offline</div>
```

### Syntax Highlighting

| Token               | Usage                       |
| ------------------- | --------------------------- |
| `--syntax-keyword`  | SQL keywords (SELECT, FROM) |
| `--syntax-string`   | String literals             |
| `--syntax-number`   | Numeric literals            |
| `--syntax-comment`  | Comments                    |
| `--syntax-function` | Function names              |

---

## Typography Scale

Fonts: **Geist Variable** (sans) + **Geist Mono Variable** (mono)

| Utility     | Size | Weight          | Usage                        |
| ----------- | ---- | --------------- | ---------------------------- |
| `text-xs`   | 12px | `font-medium`   | Table cells, badges, labels  |
| `text-sm`   | 14px | `font-normal`   | Body text, inputs, buttons   |
| `text-base` | 16px | `font-normal`   | Emphasis text, dialog titles |
| `text-lg`   | 18px | `font-semibold` | Section headings             |
| `text-2xl`  | 24px | `font-semibold` | Page titles, empty states    |

**Font Weights:**

- `font-normal` (400) — body text
- `font-medium` (500) — labels, table cells, buttons
- `font-semibold` (600) — headings, emphasis
- `font-bold` (700) — rare, strong emphasis only

**Letter Spacing:**

- `tracking-wide` — uppercase labels and captions
- `tracking-tight` — large headings
- Default for everything else

**Rules:**

- Use `text-xs` for data-dense tables and badges
- Use `text-sm` for body text and form inputs
- Use `font-mono` for SQL, JSON, IDs, and code snippets
- Never use arbitrary font sizes like `text-[13px]`

---

## Radius Scale

Base radius: `0.625rem` (10px). All radius tokens derive from this base.

| Token          | Utility       | Usage                  |
| -------------- | ------------- | ---------------------- |
| `--radius-sm`  | `rounded-sm`  | Small elements, badges |
| `--radius-md`  | `rounded-md`  | Inputs, buttons        |
| `--radius-lg`  | `rounded-lg`  | Cards, dialogs         |
| `--radius-xl`  | `rounded-xl`  | Large cards            |
| `--radius-2xl` | `rounded-2xl` | Sheets, large panels   |
| `--radius-4xl` | `rounded-4xl` | Pills, badges (full)   |

---

## Shadow Scale

Minimal shadow usage — flat design aesthetic.

| Token         | Utility     | Usage                             |
| ------------- | ----------- | --------------------------------- |
| `--shadow-sm` | `shadow-sm` | Subtle elevation (cards on hover) |
| `--shadow-md` | `shadow-md` | Popovers, dropdowns               |
| `--shadow-lg` | `shadow-lg` | Dialogs, modals                   |

**Rules:**

- Default to no shadow — use borders for separation
- `shadow-sm` for hover elevation on cards
- `shadow-lg` for floating dialogs and modals only

---

## Component Sizing Conventions

### Button Sizes

| Size      | Height        | Usage                                  |
| --------- | ------------- | -------------------------------------- |
| `xs`      | 24px (h-6)    | Inline actions, compact toolbars       |
| `sm`      | 28px (h-7)    | Table row actions, secondary toolbars  |
| `default` | 32px (h-8)    | **Default** — most buttons             |
| `lg`      | 36px (h-9)    | Primary dialog actions, prominent CTAs |
| `icon-xs` | 24px (size-6) | Compact icon-only buttons              |
| `icon-sm` | 28px (size-7) | Small icon-only buttons                |
| `icon`    | 32px (size-8) | Standard icon-only buttons             |
| `icon-lg` | 36px (size-9) | Large icon-only buttons                |

**Rules:**

- Use `size="sm"` for row actions in tables
- Use `size="icon-xs"` for compact close/delete buttons
- Use `size="default"` for toolbar and dialog buttons
- Use `size="lg"` only for primary dialog confirm actions

### Badge

- Height: 20px (h-5)
- Padding: `px-2 py-0.5`
- Font: `text-xs font-medium`
- Radius: `rounded-4xl` (pill)

### Input

- Height: 32px (h-8) default, 28px (h-7) sm
- Padding: `px-2.5`
- Font: `text-sm`
- Radius: `rounded-md`

---

## Do / Don't

### Do

- Use semantic color tokens (`bg-primary`, `text-muted-foreground`) for automatic dark mode
- Use `gap-*` for flex/grid spacing instead of margins
- Use the Shadcn/ui component variants from `variants.ts`
- Use `font-mono` for code, SQL, JSON, and IDs
- Use `text-xs` for data-dense tables

### Don't

- Don't use hardcoded hex/rgb colors — use CSS variable tokens
- Don't use arbitrary spacing values like `p-[13px]`
- Don't mix button sizes within a single toolbar
- Don't use `shadow-lg` for cards — reserve for dialogs/modals
- Don't use `font-bold` unless truly necessary — `font-semibold` is sufficient

---

## File Locations

| File                            | Purpose                                           |
| ------------------------------- | ------------------------------------------------- |
| `src/index.css`                 | CSS custom properties (tokens), theme definitions |
| `src/components/ui/variants.ts` | CVA variant definitions (button, badge, tabs)     |
| `src/components/ui/`            | Base Shadcn/ui components                         |
| `components.json`               | Shadcn/ui configuration                           |

---

_Established: 2026-06-28 as part of Phase 1: Design Token Foundation_
