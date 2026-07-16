---
id: SEED-002
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: dashboard
---

# SEED-002: Cross-engine federated query canvas (read-only UNION-of-results)

## Why This Matters

KamehaDB currently treats each engine as an isolated workspace tab. There is no way to
join or compare results across connections (e.g. a Postgres table next to a Mongo
collection next to a Redis key set). A read-only "Federated Query" tab that unions
results from multiple connections into one grid would let users cross-check data across
engines during migrations, debugging, or data-architecture exploration — a capability no
current tab offers.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the desktop dashboard workspace model or multi-engine workflows.

## Scope Estimate

**Unknown** — likely Medium (new tab type, multi-connection result merging, read-only
safety enforcement). Run `/gsd-capture --seed --enrich SEED-002` to estimate effort.

## Breadcrumbs

- `apps/desktop/src/components/workspace-content.tsx` — tab orchestration switch; would need a new `federated` tab type
- `apps/desktop/src/components/workspace-screen.tsx` + `workspace-tab-bar.tsx` — tab creation/management
- `apps/desktop/src/store/index.ts` — TanStack Store workspace state; tab types live here
- `apps/sidecar/src/routes/` — `sql.ts`, `mongo.ts`, `redis.ts`, `qdrant.ts`, `tigerbeetle.ts` are the per-engine result sources to federate
- `packages/shared/src/index.ts` — workspace tab types; a federated tab shape would be defined here

## Notes

Captured via one-shot seed capture during gsd-progress routing. Must be strictly
read-only (no cross-engine writes). Consider whether federation happens client-side
(merge in the desktop grid) or via a new sidecar aggregation route.
