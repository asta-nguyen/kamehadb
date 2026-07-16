---
id: SEED-008
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: landing
---

# SEED-008: Landing interactive schema-graph demo (read-only sample ER diagram)

## Why This Matters

The landing site has no interactive demo of KamehaDB's schema visualization. Embedding
a real read-only sample-data ER diagram using the same ReactFlow + dagre stack as the
desktop `schema-graph.tsx` would showcase the product's schema intelligence capability
directly on the marketing page, giving visitors a tangible feel for the app without
downloading it.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the landing site or schema visualization marketing.

## Scope Estimate

**Unknown** — likely Medium (ReactFlow/dagre dependency in landing, sample dataset,
read-only interactivity). Run `/gsd-capture --seed --enrich SEED-008` to estimate effort.

## Breadcrumbs

- `apps/desktop/src/components/schema-graph.tsx` — reference implementation using ReactFlow (`reactflow` imports lines 3-10) + dagre (`import dagre from 'dagre'` line 19, graphlib usage line 138)
- `landing/src/components/home-view.tsx` — landing page section where the demo would be embedded
- `landing/` — separate Next.js marketing site (npm, not pnpm workspace); ReactFlow/dagre would need to be added to landing's own `package.json`
- `packages/shared/src/` — schema/table types that feed the graph; a static sample shape would be vendored for the demo

## Notes

Captured via one-shot seed capture during gsd-progress routing. The demo must be
read-only (no live connection). Consider bundling a small fixed sample schema (3-5
tables with FKs) as static data so the demo loads instantly with no backend.
