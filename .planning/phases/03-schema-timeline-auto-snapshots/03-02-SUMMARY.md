---
phase: 03-schema-timeline-auto-snapshots
plan: 02
subsystem: database
tags: [postgres, pg_notify, pg, schema-watcher, react]

requires:
  - phase: 03-schema-timeline-auto-snapshots
    provides: Schema watcher module with in-memory map and persisted config
provides:
  - pg_notify listener with dedicated pg.Client and linear backoff reconnection
  - Notify start/stop routes
  - Desktop pg_notify toggle and SQL hint snippet
affects: [03-03, schema-timeline]

tech-stack:
  added: [pg.Client for LISTEN/NOTIFY]
  patterns: [dedicated pg.Client per connection for LISTEN, linear backoff reconnection with named constants]

key-files:
  created: []
  modified:
    - apps/sidecar/src/lib/schema-watcher.ts
    - apps/sidecar/src/routes/sql-schema.ts
    - apps/desktop/src/lib/api.ts
    - apps/desktop/src/hooks/use-schema-changelog.ts
    - apps/desktop/src/components/schema-timeline.tsx

key-decisions:
  - 'Used a dedicated pg.Client (not the adapter pool) for LISTEN to avoid blocking pool connections'
  - 'Linear backoff: delay = min(WATCHER_RECONNECT_INITIAL_MS * attempt, WATCHER_RECONNECT_MAX_MS) — simple and predictable'
  - 'Sidecar only listens; user installs the event trigger via a collapsible SQL hint snippet in the UI'
  - 'pg_notify toggle is independent from cadence toggle — a connection can have either, both, or neither'

patterns-established:
  - 'pg_notify listener pattern: dedicated pg.Client per connection, LISTEN on SCHEMA_NOTIFY_CHANNEL, reconnection with linear backoff'

requirements-completed: [SCHTL-02]

coverage:
  - id: D1
    description: 'pg_notify listener with dedicated pg.Client, linear backoff reconnection (5s initial, 60s max), and independent toggle from cadence'
    requirement: 'SCHTL-02'
    verification:
      - kind: unit
        ref: 'tsc --noEmit across shared, sidecar, and desktop packages — all pass'
        status: pass
    human_judgment: true
    rationale: 'pg_notify listener requires a running PostgreSQL instance with event triggers to verify end-to-end'
  - id: D2
    description: 'Desktop pg_notify toggle button and collapsible SQL hint snippet for trigger setup'
    requirement: 'SCHTL-02'
    verification:
      - kind: unit
        ref: 'tsc --noEmit desktop package — passes; component uses shadcn Button with Radio icon'
        status: pass
    human_judgment: true
    rationale: 'UI toggle and SQL snippet display need manual interaction to verify'

duration: 20min
completed: 2025-07-17
status: complete
---

# Plan 03-02: pg_notify Listener Summary

**PostgreSQL pg_notify listener with dedicated pg.Client, linear backoff reconnection, and desktop toggle with SQL hint**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added startNotify/stopNotify to schema-watcher.ts with dedicated pg.Client and LISTEN on SCHEMA_NOTIFY_CHANNEL
- Implemented linear backoff reconnection using WATCHER_RECONNECT_INITIAL_MS and WATCHER_RECONNECT_MAX_MS constants
- Added notify start/stop sub-routes to sql-schema router
- Added pg_notify toggle button (Radio icon) and collapsible SQL hint snippet to SchemaTimeline (PostgreSQL only)
- Added notify API methods and TanStack Query hooks

## Task Commits

1. **Tasks 1-3: pg_notify listener + routes + desktop UI** - `9c534f8` (feat)

## Files Created/Modified

- `apps/sidecar/src/lib/schema-watcher.ts` - startNotify/stopNotify with pg.Client, LISTEN, reconnection backoff
- `apps/sidecar/src/routes/sql-schema.ts` - watcher/notify/start, watcher/notify/stop sub-routes
- `apps/desktop/src/lib/api.ts` - startSchemaNotifyWatcher, stopSchemaNotifyWatcher methods
- `apps/desktop/src/hooks/use-schema-changelog.ts` - useStartSchemaNotifyWatcher, useStopSchemaNotifyWatcher hooks
- `apps/desktop/src/components/schema-timeline.tsx` - pg_notify toggle, SQL hint snippet, Radio icon import

## Decisions Made

- Dedicated pg.Client per connection (not adapter pool) for LISTEN to avoid blocking pool connections
- Linear backoff: delay = min(5s \* attempt, 60s) — simple and predictable
- Sidecar only listens; user installs event trigger via SQL hint snippet

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- pg_notify listener ready for timeline badge integration (Plan 03-03)
- Both cadence and notify watchers can run independently

---

_Phase: 03-schema-timeline-auto-snapshots_
_Completed: 2025-07-17_
