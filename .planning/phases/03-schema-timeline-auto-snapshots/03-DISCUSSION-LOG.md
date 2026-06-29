# Phase 3: Schema Timeline Auto-Snapshots - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 3-Schema Timeline Auto-Snapshots
**Mode:** --auto (autonomous, recommended defaults selected)
**Areas discussed:** Watcher Lifecycle Location, Cadence Configuration, pg_notify Listener, Persisted Config, Desktop UI Controls, Snapshot Reuse

---

## Watcher Lifecycle Location

| Option               | Description                                                             | Selected |
| -------------------- | ----------------------------------------------------------------------- | -------- |
| Sidecar-side watcher | Watcher runs in sidecar, reuses adapter cache + metadata store directly | ✓        |
| Desktop-side watcher | Watcher runs in desktop app via TanStack Query intervals                |          |

**[auto] Selected:** Sidecar-side watcher (recommended default)
**Notes:** Sidecar is the long-running process; desktop may be closed. Sidecar already has adapter cache, metadata store, and logger.

---

## Cadence Configuration

| Option                           | Description                                            | Selected |
| -------------------------------- | ------------------------------------------------------ | -------- |
| Preset Select (5m/15m/30m/1h/6h) | shadcn Select with preset intervals, min 5min enforced | ✓        |
| Free-text input                  | User types arbitrary interval in minutes               |          |

**[auto] Selected:** Preset Select (recommended default)
**Notes:** Simpler, prevents invalid values. Default 60min, minimum 5min as named constants.

---

## pg_notify Listener

| Option                       | Description                                                        | Selected |
| ---------------------------- | ------------------------------------------------------------------ | -------- |
| Dedicated pg.Client + LISTEN | Separate connection for LISTEN, reconnection backoff on disconnect | ✓        |
| Polling information_schema   | Compare schema hashes on cadence interval                          |          |

**[auto] Selected:** Dedicated pg.Client + LISTEN (recommended default)
**Notes:** PostgreSQL-only. User installs trigger; sidecar only listens. Independent toggle from cadence. Channel name as named constant.

---

## Persisted Config

| Option                           | Description                                    | Selected |
| -------------------------------- | ---------------------------------------------- | -------- |
| New schema_watchers table        | SQLite table in metadata store, CRUD functions | ✓        |
| JSON blob in connection_profiles | Store config as JSON in existing table         |          |

**[auto] Selected:** New schema_watchers table (recommended default)
**Notes:** Follows existing metadata-store table pattern. Auto-resume on sidecar startup via listEnabledSchemaWatchers().

---

## Desktop UI Controls

| Option                             | Description                                                | Selected |
| ---------------------------------- | ---------------------------------------------------------- | -------- |
| Inline in SchemaTimeline component | Add controls section to existing timeline, no new tab type | ✓        |
| New "Auto-Snapshot" tab type       | Separate workspace tab for watcher config                  |          |

**[auto] Selected:** Inline in SchemaTimeline component (recommended default)
**Notes:** Surgical change — no new tab type, no workspace orchestration changes. Button toggles (no Switch component available). Interval Select disabled when cadence off.

---

## Snapshot Reuse

| Option                                  | Description                                      | Selected |
| --------------------------------------- | ------------------------------------------------ | -------- |
| Extract shared captureSnapshot() helper | Reuse exact capture logic, tag with source field | ✓        |
| Duplicate capture logic in watcher      | Copy-paste the capture code                      |          |

**[auto] Selected:** Extract shared captureSnapshot() helper (recommended default)
**Notes:** Auto-snapshots identical in structure, appear in same timeline/diff. Optional `source` field on SchemaSnapshotRecord for UI badge.

---

## Claude's Discretion

- Auto-snapshot controls section layout (inline with header vs separate card)
- pg_notify trigger SQL hint snippet text
- Reconnection backoff implementation (linear vs exponential)
- Whether to show "last capture" timestamp beyond status route

## Deferred Ideas

- Non-PostgreSQL event-triggered snapshots (polling-based change detection for other SQL engines)
- Snapshot retention policy UI (user-configurable retention)
- Cross-connection snapshot comparison (dev vs prod)
- Webhook/notification on auto-capture (Slack, email)
- Snapshot diffing with AI explanation (related to Phase 4)
