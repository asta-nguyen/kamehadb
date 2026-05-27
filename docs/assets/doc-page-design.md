# KamehaDB Documentation Design System

## Overview

KamehaDB documentation site uses a modern, clean design with Tailwind CSS. The system emphasizes clarity, accessibility, and visual hierarchy through cohesive design tokens.

**Design Philosophy:**

- Light theme with white canvas
- Indigo/Purple gradient brand colors
- Soft rounded corners (16px radius)
- Subtle animations for engagement
- Mobile-first responsive approach

## Colors

### Brand & Accent

| Token            | Hex     | Usage                      |
| ---------------- | ------- | -------------------------- |
| `primary`        | #6366f1 | Primary CTAs, active links |
| `primary-hover`  | #4f46e5 | Hover states               |
| `gradient-start` | #6366f1 | Text gradients             |
| `gradient-end`   | #a855f7 | Text gradients             |
| `secondary`      | #8b5cf6 | Secondary accents          |

### Surface

| Token            | Hex     | Usage               |
| ---------------- | ------- | ------------------- |
| `canvas`         | #ffffff | Page background     |
| `surface-soft`   | #f8fafc | Section backgrounds |
| `surface-strong` | #f1f5f9 | Hover backgrounds   |
| `border`         | #e2e8f0 | Borders at 60%      |

### Text

| Token   | Hex     | Usage          |
| ------- | ------- | -------------- |
| `ink`   | #0f172a | Headlines      |
| `body`  | #334155 | Body text      |
| `muted` | #64748b | Secondary text |

## Typography

- **Font:** Inter (400-800)
- **Display:** 4xl-6xl, font-extrabold, tracking-tight
- **Body:** lg-base, leading-relaxed
- **Code:** mono font, emerald-400 for commands

## Spacing

4px base unit:

- sm: 16px
- base: 24px
- lg: 32px
- section: 64px

## Components

### Navigation

- Fixed top, blur background, 70% opacity white
- Logo with hover scale animation
- Active page: indigo bg, indigo text

### Cards

- White bg, rounded-2xl, 1px border
- Hover: lift -6px, shadow enhancement
- Feature icons with gradient bg

### Buttons

- Primary: indigo bg, white text, rounded-xl
- Hover: scale, shadow
- Copy button: dark bg, positioned absolute

### Tags

- AI: blue-indigo gradient
- Core: green gradient
- Visual: amber gradient

## Animations

```css
/* Entrance */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
}

/* Scroll reveal */
.scroll-reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: 0.6s;
}
.scroll-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}
```

## Interactive Patterns

### FAQ Accordion

- One item open at a time
- Smooth height transition
- Icon rotation on expand

### Copy Button

- Clipboard API
- "Copied!" feedback for 2s
