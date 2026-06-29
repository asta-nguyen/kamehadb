---
id: SEED-006
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: landing
---

# SEED-006: Landing live engine matrix with status badges and feature matrix

## Why This Matters

The landing site's engines section is currently static. An interactive engine matrix
where each engine card shows live status badges (SQL/document/cache/vector/ledger),
a supported-features matrix, and a one-click "Try in Docker" snippet would communicate
KamehaDB's breadth at a glance and reduce friction for first-time users. Reusing the
`KIND` constants from `@kamehadb/shared` keeps the matrix in sync with the app's
canonical engine list.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the landing site or engine marketing.

## Scope Estimate

**Unknown** — likely Medium (new interactive section, shared constants import across
the non-workspace landing package, Docker snippet generation). Run
`/gsd-capture --seed --enrich SEED-006` to estimate effort.

## Breadcrumbs

- `packages/shared/src/schemas.ts:4` — `export const KIND = { POSTGRES, ... }` and `ALL_KINDS` array (line 29) — canonical engine list to reuse
- `landing/src/components/home-view.tsx` — hero copy, engine carousel, feature cards (per AGENTS.md line 358)
- `landing/` — separate Next.js marketing site with its own `package-lock.json` (not in pnpm workspace); importing `@kamehadb/shared` requires a cross-package reference or vendoring the constants
- `docker-compose.yml` + `docker-init/` — source of truth for the "Try in Docker" snippets
- `AGENTS.md` "Database Support" section — the feature matrix (SQL/document/cache/vector/ledger categorization) is documented here

## Notes

Captured via one-shot seed capture during gsd-progress routing. The landing package is
NOT part of the pnpm workspace, so reusing `@kamehadb/shared` constants requires either
a workspace boundary change or vendoring the KIND list. Decide the approach during
enrichment.
