---
phase: 03-schema-timeline-auto-snapshots
plan: 01
subsystem: database
tags: [postgres, sqlite, schema-watcher, tanstack-query, hono, react]

requires:
  - phase: 02-schema-timeline-diff
    provides: Schema snapshot capture, changelog, and diff infrastructure
provides:
  - Cadence-based schema watcher with persisted config in metadata store
  - SchemaWatcherConfig and SchemaWatcherStatus shared types
  - Auto-resume of watchers on sidecar startup
  - Desktop cadence toggle and interval presets UI
affects: [03-02, 03-03, schema-diff-view, schema-timeline]

tech-stack:
  added: []
  patterns:
    [
      sidecar watcher module with in-memory map,
      persisted watcher config in SQLite metadata store,
      TanStack Query mutation+invalidation for watcher control,
    ]

key-files:
  created:
    - apps/sidecar/src/lib/schema-watcher.ts
  modified:
    - packages/shared/src/schema-tools.ts
    - apps/sidecar/src/lib/constants.ts
    - apps/sidecar/src/db/metadata-store.ts
    - apps/sidecar/src/routes/sql-schema.ts
    - apps/sidecar/src/index.ts
    - apps/desktop/src/lib/api.ts
    - apps/desktop/src/lib/query-keys.ts
    - apps/desktop/src/hooks/use-schema-changelog.ts
    - apps/desktop/src/components/schema-timeline.tsx

key-decisions:
  - 'Used a single in-memory Map<connectionId, WatcherEntry> in schema-watcher.ts rather than a class to keep the module simple'
  - 'Persisted watcher config in schema_watchers SQLite table with cadenceEnabled, notifyEnabled, intervalMs, lastCaptureAt columns'
  - 'Auto-resume on sidecar startup iterates all rows with cadenceEnabled=true and calls startCadence for each'
  - 'Interval minimum of 5 minutes enforced in the sidecar start route using WATCHER_MIN_INTERVAL_MS constant'

patterns-established:
  - 'Watcher module pattern: in-memory Map keyed by connectionId, functions startCadence/stopCadence/startNotify/stopNotify'
  - 'Watcher status poll: desktop polls GET /sql/:id/schema/watcher/status every 5s and invalidates changelog on lastCaptureAt change'

requirements-completed: [SCHTL-01]

coverage:
  - id: D1
    description: 'Cadence-based schema watcher with configurable interval, persisted config, and auto-resume on sidecar startup'
    requirement: 'SCHTL-01'
    verification:
      - kind: unit
        ref: 'tsc --noEmit across shared, sidecar, and desktop packages — all pass'
        status: pass
    human_judgment: true
    rationale: 'Watcher lifecycle (start/stop/auto-resume) requires a running sidecar + database to verify end-to-end behavior'
  - id: D2
    description: 'Desktop SchemaTimeline cadence toggle and interval Select with 5m/15m/30m/1h/6h presets'
    requirement: 'SCHTL-01'
    verification:
      - kind: unit
        ref: 'tsc --noEmit desktop package — passes; component renders Button, Select, Badge from shadcn'
        status: pass
    human_judgment: true
    rationale: 'UI toggle behavior and interval selection need manual interaction to verify'

duration: 45min
completed: 2025-07-17
status: complete
---

# Plan 03-01: Cadence-Based Schema Watcher Summary

**Sidecar-resident cadence watcher with persisted config, auto-resume on startup, and desktop toggle/interval UI**

## Performance

- **Duration:** ~45 min
- **Tasks:** 6
- **Files modified:** 10

## Accomplishments

- Created schema-watcher.ts module with startCadence/stopCadence lifecycle and in-memory watcher map
- Added schema_watchers table to metadata store with migration and CRUD operations
- Added watcher start/stop/status routes to sql-schema router
- Added auto-resume of cadence watchers on sidecar startup
- Added desktop API methods, TanStack Query hooks, and QUERY_KEYS for watcher status
- Added cadence toggle and interval Select to SchemaTimeline component

## Task Commits

1. **Task 1-6: Cadence watcher implementation** - `8ab5307` (feat)

## Files Created/Modified

- `apps/sidecar/src/lib/schema-watcher.ts` - Watcher module with startCadence/stopCadence/startNotify/stopNotify
- `packages/shared/src/schema-tools.ts` - SchemaWatcherConfig, SchemaWatcherStatus types, source field
- `apps/sidecar/src/lib/constants.ts` - WATCHER_DEFAULT_INTERVAL_MS, WATCHER_MIN_INTERVAL_MS, WATCHER_MAX_SNAPSHOTS
- `apps/sidecar/src/db/metadata-store.ts` - schema_watchers table, getSchemaWatcher, upsertSchemaWatcher, listSchemaWatchers
- `apps/sidecar/src/routes/sql-schema.ts` - watcher/start, watcher/stop, watcher/status routes
- `apps/sidecar/src/index.ts` - auto-resume watchers on startup
- `apps/desktop/src/lib/api.ts` - startSchemaWatcher, stopSchemaWatcher, getSchemaWatcherStatus
- `apps/desktop/src/lib/query-keys.ts` - SCHEMA_WATCHER key
- `apps/desktop/src/hooks/use-schema-changelog.ts` - useStartSchemaWatcher, useStopSchemaWatcher, useSchemaWatcherStatus
- `apps/desktop/src/components/schema-timeline.tsx` - cadence toggle, interval Select, auto-capture toast

## Decisions Made

- Used in-memory Map instead of class for watcher module simplicity
- Persisted config in schema_watchers table with cadenceEnabled, notifyEnabled, intervalMs, lastCaptureAt
- 5-minute minimum interval enforced server-side via WATCHER_MIN_INTERVAL_MS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Cadence watcher infrastructure ready for pg_notify listener (Plan 03-02)
- Timeline auto-refresh via status poll ready for badge integration (Plan 03-03)

---

_Phase: 03-schema-timeline-auto-snapshots_
_Completed: 2025-07-17_
