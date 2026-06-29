---
id: SEED-003
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: dashboard
---

# SEED-003: Schema timeline auto-scheduled snapshots (watcher / pg_notify)

## Why This Matters

`schema-timeline.tsx` currently captures schema snapshots only on demand. Users must
remember to trigger a snapshot to track drift over time. An opt-in watcher that
snapshots on a cadence (e.g. hourly) or on `pg_notify` events would capture schema
changes automatically, giving a complete timeline without manual intervention —
especially valuable for shared databases where multiple actors mutate the schema.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the schema timeline/diff workflows or PostgreSQL maintenance features.

## Scope Estimate

**Unknown** — likely Medium (watcher lifecycle, persistence of cadence config,
pg_notify listener wiring). Run `/gsd-capture --seed --enrich SEED-003` to estimate effort.

## Breadcrumbs

- `apps/desktop/src/components/schema-timeline.tsx` — current on-demand snapshot UI
- `apps/desktop/src/components/schema-diff-view.tsx` + `migration-assistant.tsx` — downstream consumers of timeline snapshots
- `apps/sidecar/src/routes/sql.ts` — SQL metadata routes that serve snapshot data
- `apps/sidecar/src/db/metadata-store.ts` — SQLite metadata store where snapshots are persisted
- `apps/sidecar/src/lib/cache.ts` — schema/metadata cache the watcher would need to invalidate/refresh

## Notes

Captured via one-shot seed capture during gsd-progress routing. Must remain opt-in to
avoid surprise storage growth. pg_notify path is PostgreSQL-specific; the cadence path
could generalize to other SQL engines.
