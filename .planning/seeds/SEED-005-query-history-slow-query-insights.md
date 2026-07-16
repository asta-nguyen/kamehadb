---
id: SEED-005
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: dashboard
---

# SEED-005: Query history slow-query insights view (p95 by normalized pattern)

## Why This Matters

`query-history-panel.tsx` already tracks favorites and per-group duration. A "Slow
queries" view showing top-N by p95 duration, grouped by normalized pattern, would help
users identify performance hotspots. Pre-seeding the AI chat from a slow query (to
suggest an index or explanation) closes the loop between observation and remediation.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the query history panel or SQL performance observability.

## Scope Estimate

**Unknown** — likely Medium (normalization logic, p95 aggregation, new view, AI
pre-seed integration). Run `/gsd-capture --seed --enrich SEED-005` to estimate effort.

## Breadcrumbs

- `apps/desktop/src/components/query-history-panel.tsx` — current history/favorites UI; would gain a "Slow queries" view
- `apps/sidecar/src/routes/query-history.ts` (route group `/query-history`) — saved SQL history and favorites backend
- `apps/sidecar/src/db/metadata-store.ts` — persists query history; duration data lives here
- `apps/desktop/src/components/ai-chat-panel.tsx` — would receive pre-seeded prompt for index/explanation suggestions
- `apps/sidecar/src/ai/` — schema-context generation useful for index suggestions

## Notes

Captured via one-shot seed capture during gsd-progress routing. Normalization (grouping
by query pattern) is the non-trivial piece — consider whether it happens client-side or
in the sidecar metadata store. AI pre-seed reuses the SEED-004 pattern of feeding the
chat panel a scoped prompt.
