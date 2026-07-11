# KamehaDB Landing Design System

## 1. Atmosphere & Identity

KamehaDB feels like a local database workbench with public-source energy: precise, technical, and warm enough to invite contributors in. The signature is the amber command glow, used with Stripe-inspired chromatic depth so interactive surfaces feel engineered rather than decorative.

## 2. Color

### Palette

| Role           | Token                    | Light     | Dark      | Usage                                |
| -------------- | ------------------------ | --------- | --------- | ------------------------------------ |
| Surface/canvas | `--color-canvas`         | `#ffffff` | `#0a0a0f` | Page background                      |
| Surface/soft   | `--color-surface-soft`   | `#fafafa` | `#12121a` | Secondary bands                      |
| Surface/strong | `--color-surface-strong` | `#f4f4f5` | `#1c1c2a` | Elevated cards                       |
| Border/default | `--color-border`         | `#e4e4e7` | `#27273a` | Dividers and outlines                |
| Text/primary   | `--color-ink`            | `#09090b` | `#f1f5f9` | Headlines                            |
| Text/body      | `--color-body`           | `#3f3f46` | `#a1a1aa` | Paragraphs                           |
| Text/muted     | `--color-muted`          | `#71717a` | `#71717a` | Metadata                             |
| Accent/primary | `--color-primary`        | `#f59e0b` | `#f59e0b` | Primary CTA and key highlights       |
| Accent/hover   | `--color-primary-hover`  | `#d97706` | `#d97706` | CTA hover state                      |
| Accent/rose    | `--color-gradient-end`   | `#f43f5e` | `#f43f5e` | Secondary highlight, not primary CTA |
| Accent/orange  | `--color-secondary`      | `#fb923c` | `#fb923c` | Warm supporting highlight            |
| Status/success | `--color-emerald-400`    | `#34d399` | `#34d399` | Community proof and healthy state    |

### Rules

- Use amber for primary interaction and rose/orange only as supporting energy.
- Use the existing CSS custom properties and Tailwind theme tokens before adding new colors.
- Team-page depth uses blue-tinted Stripe-style shadows only through CSS custom properties documented in Section 7.

## 3. Typography

### Scale

| Level   | Size                         | Weight | Line Height | Tracking | Usage              |
| ------- | ---------------------------- | ------ | ----------- | -------- | ------------------ |
| Display | `clamp(3rem, 9vw, 7rem)`     | 800    | 0.9         | 0        | Team hero wordmark |
| H1      | `clamp(2.5rem, 6vw, 5.5rem)` | 800    | 0.95        | 0        | Page title         |
| H2      | `clamp(2rem, 4vw, 3.5rem)`   | 800    | 1           | 0        | Section headers    |
| H3      | `1.25rem`                    | 700    | 1.2         | 0        | Card titles        |
| Body/lg | `1.125rem`                   | 400    | 1.65        | 0        | Lead paragraphs    |
| Body    | `1rem`                       | 400    | 1.6         | 0        | Default text       |
| Body/sm | `0.875rem`                   | 400    | 1.5         | 0        | Secondary copy     |
| Caption | `0.75rem`                    | 600    | 1.4         | 0.08em   | Metadata labels    |

### Font Stack

- Primary: Outfit via `next/font/google`, then system sans.
- Mono: JetBrains Mono via `next/font/google`, then system monospace.

### Rules

- Use `text-wrap: balance` or Tailwind `text-balance` for hero and section headings.
- Use `font-mono` and tabular numerals for contribution counts and dashboard-like labels.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of 4px.

| Token             | Value  | Usage          |
| ----------------- | ------ | -------------- |
| `--space-sm`      | `16px` | Compact groups |
| `--space-base`    | `24px` | Card padding   |
| `--space-lg`      | `32px` | Grid gaps      |
| `--space-section` | `64px` | Section rhythm |

### Grid

- Max content width: 1200px for landing sections.
- Team layout: single column on mobile, asymmetric 12-column grid on desktop.
- Breakpoints follow Tailwind defaults.

### Rules

- Team cards may intentionally offset on desktop; the offset must collapse on mobile.
- Avoid full-screen locks. Use `min-h-[100dvh]` when a viewport-height section is needed.

## 5. Components

### Team Navigation

- **Structure**: fixed `nav` with logo, text links, GitHub CTA, and theme toggle.
- **Variants**: landing page and team page.
- **Spacing**: `--space-sm` horizontal groups, `--space-base` container padding.
- **States**: hover color shift, focus ring via link/button defaults.
- **Accessibility**: semantic `nav`, visible link text, external links use `rel`.
- **Motion**: color and shadow transitions only.

### Contributor Card

- **Structure**: shadcn `Card` with avatar, identity, metadata badges, bio, and GitHub/site links.
- **Variants**: core contributor and community contributor.
- **Spacing**: `--space-base` padding and `--space-lg` grid gaps.
- **States**: default, hover lift, focusable external links, empty bio fallback.
- **Accessibility**: avatar alt text uses display name, links have descriptive labels.
- **Motion**: hover uses `transform` and `opacity`; no layout animation.

### Community CTA

- **Structure**: full-width band with proof stats, contribution narrative, and two shadcn buttons.
- **Variants**: primary GitHub CTA and secondary issue CTA.
- **Spacing**: `--space-section` vertical padding.
- **States**: hover, active, focus through button variants plus local shadow treatment.
- **Accessibility**: real links, no dead `#` actions.
- **Motion**: entry fade/translate and button hover shadow.

## 6. Motion & Interaction

| Type     | Duration | Easing                          | Usage                    |
| -------- | -------- | ------------------------------- | ------------------------ |
| Micro    | 150ms    | ease-out                        | Link and icon color      |
| Standard | 250ms    | ease-out                        | Card hover and CTA hover |
| Emphasis | 600ms    | `cubic-bezier(0.16, 1, 0.3, 1)` | Section entry            |

### Rules

- Animate only `transform`, `opacity`, `filter`, and color/shadow transitions.
- Respect `motion` viewport triggers already used in the project.
- Do not add decorative motion that does not communicate hierarchy or affordance.

## 7. Depth & Surface

### Strategy

Mixed: tonal surfaces plus Stripe-inspired chromatic shadows.

| Level                            | Value                                                                      | Usage                     |
| -------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| Subtle                           | `shadow-sm` or border token                                                | Resting cards and nav     |
| Standard (`--shadow-soft-panel`) | `0 15px 35px rgba(23,23,23,0.08)`                                          | CTA band and media panels |
| Chromatic (`--shadow-chromatic`) | `0 30px 45px -30px rgba(50,50,93,0.25), 0 18px 36px -18px rgba(0,0,0,0.1)` | Featured contributor card |
| Warm glow (`--shadow-warm-glow`) | `0 18px 40px rgba(245,158,11,0.22)`                                        | Primary amber CTA hover   |

### Rules

- Keep card radii at 8px or less unless using an existing shadcn primitive default.
- Use grid texture and angular bands for atmosphere; do not use isolated decorative orbs.
