# AGENTS.md

This file provides guidance for work inside the `docs/` site.

## Scope

- Apply these instructions when editing or creating files under `docs/`.
- The docs site is a user-facing documentation and marketing surface, not an internal admin UI.

## Required Design Reference

- Before implementing or changing docs UI, read `assets/doc-page-design.md`.
- Treat `assets/doc-page-design.md` as the source of truth for the docs visual system, layout direction, typography, colors, spacing, motion, and expected page patterns.
- When a docs page implementation differs from the design brief, update the UI to match the brief unless the user explicitly asks for a new direction.

## Docs UI Expectations

- Preserve a polished marketing-style documentation experience with clear hierarchy and strong readability.
- Follow the documented responsive behavior for mobile, tablet, and desktop layouts.
- Reuse the established docs design language across navigation, hero sections, content sections, cards, code blocks, tables, CTAs, and footer areas.
- Keep docs pages visually consistent with the design tokens and interaction patterns defined in `assets/doc-page-design.md`.

## Implementation Checklist

- Check `assets/doc-page-design.md` before starting any docs UI task.
- Verify the page uses the intended typography, spacing, color palette, and container widths.
- Verify interactive elements such as accordions, copy buttons, hover states, and reveal animations behave consistently with the design brief.
- Verify the result works on both desktop and mobile before considering the task complete.

## Release Note

- If docs work introduces a new page or major layout change, compare the implementation against `assets/doc-page-design.md` and call out any intentional deviations in the final summary.
