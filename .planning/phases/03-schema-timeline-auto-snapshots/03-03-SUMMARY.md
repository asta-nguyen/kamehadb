---
phase: 03-schema-timeline-auto-snapshots
plan: 03
subsystem: ui
tags: [react, tanstack-query, schema-timeline, schema-diff, badges]

requires:
  - phase: 03-schema-timeline-auto-snapshots
    provides: Cadence watcher and pg_notify listener with status poll
provides:
  - Source badges (auto/notify) on timeline entries
  - Auto-capture detection with cache invalidation in SchemaTimeline and SchemaDiffView
  - Toast notification on each auto-capture
affects: [schema-timeline, schema-diff-view]

tech-stack:
  added: []
  patterns: [status-poll-driven cache invalidation via useRef tracking of lastCaptureAt]

key-files:
  created: []
  modified:
    - apps/desktop/src/components/schema-timeline.tsx
    - apps/desktop/src/components/schema-diff-view.tsx
    - apps/desktop/src/hooks/use-schema-changelog.ts

key-decisions:
  - 'Used useRef to track previous lastCaptureAt and invalidate SCHEMA_CHANGELOG + SCHEMA_SNAPSHOTS on change'
  - "Added SourceBadge component showing 'auto' (blue) or 'notify' (purple) badges on timeline entries"
  - 'Added same auto-capture invalidation to SchemaDiffView so snapshot selectors refresh automatically'

patterns-established:
  - 'Auto-capture invalidation pattern: useRef tracks lastCaptureAt from status poll, invalidates snapshot/changelog queries on change'

requirements-completed: [SCHTL-03]

coverage:
  - id: D1
    description: "Auto-captured snapshots appear in timeline with 'auto' or 'notify' source badges"
    requirement: 'SCHTL-03'
    verification:
      - kind: unit
        ref: 'tsc --noEmit desktop package — passes; SourceBadge component renders Badge with variant by source'
        status: pass
    human_judgment: true
    rationale: 'Badge rendering on auto-captured snapshots requires a running watcher to produce snapshots with source field'
  - id: D2
    description: 'Timeline and diff view refresh automatically when auto-snapshot is captured (via status poll invalidation)'
    requirement: 'SCHTL-03'
    verification:
      - kind: unit
        ref: 'tsc --noEmit desktop package — passes; useRef + useEffect invalidation logic in both components'
        status: pass
    human_judgment: true
    rationale: 'Auto-refresh behavior requires a running watcher producing snapshots to verify end-to-end'

duration: 15min
completed: 2025-07-17
status: complete
---

# Plan 03-03: Timeline Integration Summary

**Source badges on timeline entries, auto-capture cache invalidation in timeline and diff view, toast on auto-capture**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added SourceBadge component showing 'auto' (blue) or 'notify' (purple) badges on timeline entries
- Added auto-capture detection via useRef tracking of lastCaptureAt with SCHEMA_CHANGELOG + SCHEMA_SNAPSHOTS invalidation
- Added same auto-capture invalidation to SchemaDiffView so snapshot selectors refresh automatically
- Toast notification shown on each auto-capture event

## Task Commits

1. **Tasks 1-3: Source badges + auto-capture invalidation + diff view integration** - `9c534f8` (feat)

## Files Created/Modified

- `apps/desktop/src/components/schema-timeline.tsx` - SourceBadge component, auto-capture useRef invalidation, toast on capture
- `apps/desktop/src/components/schema-diff-view.tsx` - useSchemaWatcherStatus hook, auto-capture useRef invalidation for snapshot selectors
- `apps/desktop/src/hooks/use-schema-changelog.ts` - useStartSchemaNotifyWatcher, useStopSchemaNotifyWatcher hooks

## Decisions Made

- Used useRef to track previous lastCaptureAt and invalidate queries on change — simpler than subscription-based approach
- SourceBadge shows 'auto' for cadence and 'notify' for pg_notify captures with distinct badge variants

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 3 fully complete: cadence watcher, pg_notify listener, and timeline integration all shipped
- All packages typecheck cleanly

---

_Phase: 03-schema-timeline-auto-snapshots_
_Completed: 2025-07-17_
