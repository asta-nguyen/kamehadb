# Phase 3: Schema Timeline Auto-Snapshots - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds opt-in automatic schema snapshots to the existing schema timeline infrastructure. Users can enable two independent auto-capture modes per connection: (1) a cadence-based watcher that snapshots on a configurable interval (e.g. every hour), and (2) a PostgreSQL `pg_notify`-triggered snapshot that fires when a schema-change event is detected. Auto-captured snapshots flow into the existing schema timeline and diff views with no new UI surfaces beyond the enable/disable controls.

Scope: sidecar (`apps/sidecar`) for the watcher lifecycle, `pg_notify` listener, and persisted config in the metadata store; desktop app (`apps/desktop`) for the enable/disable UI controls in the schema timeline panel; `packages/shared` for the watcher config types.

Out of scope: non-PostgreSQL event-triggered snapshots (only PostgreSQL supports `pg_notify`), snapshot retention policy UI (existing 50-snapshot cap is reused), and cross-connection snapshot comparison.

</domain>

<decisions>
## Implementation Decisions

### Watcher Lifecycle Location

- **D-01:** The cadence-based watcher runs in the sidecar, not the desktop app. The sidecar is the long-running process that holds DB adapter connections and already manages the snapshot capture logic (`POST /sql/:connectionId/schema/snapshots`). A sidecar-side watcher reuses `getSqlAdapter()` directly and writes snapshots via the existing `metadataStore.saveSchemaSnapshot()` — no HTTP roundtrip per capture.
- **D-02:** The watcher is a module-level singleton in the sidecar (`apps/sidecar/src/lib/schema-watcher.ts`) that manages a `Map<connectionId, NodeJS.Timeout>` of `setInterval` timers. Start/stop is controlled by new sidecar routes (`POST /sql/:connectionId/schema/watcher/start`, `POST /sql/:connectionId/schema/watcher/stop`, `GET /sql/:connectionId/schema/watcher/status`). On sidecar startup, the watcher auto-resumes all connections that have persisted watcher config with `enabled: true`.
- **D-03:** Rationale: The desktop app may be closed while the sidecar runs (Tauri manages the sidecar lifecycle). Putting the watcher in the sidecar ensures snapshots continue even when the app window is closed. The sidecar already has the adapter cache, metadata store, and logger — all prerequisites for snapshot capture.

### Cadence Configuration

- **D-04:** The cadence interval is configurable per connection, stored in the metadata store as `intervalMs` (milliseconds). The default is 60 minutes (`60 * 60 * 1000`). The minimum allowed interval is 5 minutes (`5 * 60 * 1000`) to prevent excessive snapshot churn. These values are named constants in `apps/sidecar/src/lib/constants.ts` — never inline magic numbers.
- **D-05:** The interval is set via the start route body (`{ intervalMs?: number }`). If omitted, the default is used. If below the minimum, the route returns 400 with a validation error. The desktop UI presents a shadcn `Select` with preset options (5m, 15m, 30m, 1h, 6h) rather than a free-text input — simpler and prevents invalid values.

### pg_notify Listener

- **D-06:** The `pg_notify` listener is PostgreSQL-only. It uses a dedicated `pg.Client` connection (not the adapter pool) that runs `LISTEN kamehadb_schema_change` on the target PostgreSQL database. When a notification is received, the watcher captures a snapshot immediately. The listener is managed alongside the cadence timer in the same watcher module.
- **D-07:** The notification channel name `kamehadb_schema_change` is a named constant in `apps/sidecar/src/lib/constants.ts`. The user must set up a trigger on their PostgreSQL database that calls `pg_notify('kamehadb_schema_change', ...)`. The sidecar does NOT install triggers — it only listens. The desktop UI shows a hint with the SQL snippet to create the trigger, but installation is the user's responsibility (opt-in, local-first — no surprise DDL).
- **D-08:** The `pg_notify` mode is an independent toggle from the cadence mode. A connection can have cadence-only, pg_notify-only, both, or neither. Both modes share the same persisted config record but have separate `enabled` flags (`cadenceEnabled`, `notifyEnabled`).
- **D-09:** The listener uses `pg.Client.connect()` + `client.query('LISTEN kamehadb_schema_change')` and handles the `'notification'` event. On error or disconnect, the listener logs a warning via `log.warn()` and attempts reconnection with a backoff (initial 5s, max 60s — named constants). The listener is stopped when the user disables pg_notify mode or when the sidecar shuts down.

### Persisted Config

- **D-10:** Watcher config is persisted in a new `schema_watchers` table in the metadata SQLite store. Schema: `(connection_id TEXT PRIMARY KEY, cadence_enabled INTEGER NOT NULL DEFAULT 0, notify_enabled INTEGER NOT NULL DEFAULT 0, interval_ms INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`. This follows the existing metadata-store pattern (see `connection_profiles`, `ai_settings` tables).
- **D-11:** New metadata-store functions: `getSchemaWatcher(connectionId)`, `upsertSchemaWatcher(connectionId, config)`, `deleteSchemaWatcher(connectionId)`, `listEnabledSchemaWatchers()`. The last is used on sidecar startup to auto-resume all enabled watchers.
- **D-12:** The shared types for watcher config live in `packages/shared/src/schema-tools.ts` alongside the existing `SchemaSnapshotRecord` types: `SchemaWatcherConfig { connectionId, cadenceEnabled, notifyEnabled, intervalMs }` and `SchemaWatcherStatus` (returned by the status route, includes `cadenceRunning`, `notifyRunning`, `lastCaptureAt`).

### Desktop UI Controls

- **D-13:** The enable/disable controls live in the existing `SchemaTimeline` component (`apps/desktop/src/components/schema-timeline.tsx`), not a new tab type. A new "Auto-Snapshot" section is added below the existing header, with two toggle rows: "Cadence" (with the interval `Select`) and "pg_notify" (with the SQL hint). This keeps the change surgical — no new tab type, no new workspace orchestration.
- **D-14:** The toggles use shadcn `Button` with a visual on/off state (variant `default` when enabled, `outline` when disabled) — there is no shadcn `Switch` component installed, and AGENTS.md forbids hand-rolling parallel components. A `Button` toggle is the established pattern (see connection picker toggles in Phase 2's federated canvas).
- **D-15:** The interval `Select` uses the existing shadcn `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` + `SelectValue` components. Preset options: 5 minutes, 15 minutes, 30 minutes, 1 hour, 6 hours. The `Select` is disabled when cadence is off.
- **D-16:** New TanStack Query hooks in `apps/desktop/src/hooks/use-schema-changelog.ts`: `useSchemaWatcherStatus(connectionId)` (GET, polled every 10s when the timeline tab is active), `useStartSchemaWatcher()` (mutation), `useStopSchemaWatcher()` (mutation). The hooks call new `api.ts` methods that hit the sidecar watcher routes.
- **D-17:** When a watcher captures a snapshot (cadence or pg_notify), the desktop UI reflects it via TanStack Query cache invalidation. The `useSchemaWatcherStatus` hook's 10s poll interval picks up the new `lastCaptureAt` timestamp, and the existing `useSchemaChangelog` query is invalidated to refresh the timeline. A toast notification is shown on each auto-capture ("Auto-snapshot captured — N tables").

### Snapshot Reuse

- **D-18:** Auto-captured snapshots use the exact same capture logic as the manual "Capture Snapshot" button — they call the same internal capture function that `POST /schema/snapshots` uses (extracted into a shared `captureSnapshot(connectionId, adapter)` helper in `sql-schema.ts`). This ensures auto-snapshots are identical in structure and appear in the same timeline/diff views with no special handling.
- **D-19:** Auto-snapshots are tagged with `source: 'auto-cadence'` or `source: 'auto-notify'` in the `snapshot_data` JSON (a new optional field on `SchemaSnapshotRecord`). The timeline UI shows a small `Badge` ("auto" / "notify") on auto-captured entries to distinguish them from manual captures. This is a minimal addition — the existing `SchemaSnapshotRecord` type gets an optional `source?: 'manual' | 'auto-cadence' | 'auto-notify'` field.

### Claude's Discretion

- Exact layout of the auto-snapshot controls section (inline with header vs separate card) — follow whichever fits the existing timeline layout cleanly
- The SQL hint snippet text for the pg_notify trigger — keep it concise and copy-pasteable
- Reconnection backoff implementation details (linear vs exponential) — linear is simpler and sufficient for a local tool
- Whether to show a "last capture" timestamp in the UI beyond the status route — nice-to-have, not required by SCHTL-01/02/03

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning

- `.planning/ROADMAP.md` §Phase 3 — Phase goal, requirements (SCHTL-01, SCHTL-02, SCHTL-03), success criteria, plans 03-01/03-02/03-03
- `.planning/REQUIREMENTS.md` — REQ-IDs SCHTL-01, SCHTL-02, SCHTL-03 (lines 23-25)
- `.planning/PROJECT.md` — Core value, constraints (local-first, opt-in snapshots decision in Key Decisions table)

### Codebase Conventions

- `AGENTS.md` — shadcn component mapping rules, KIND constant usage, no magic strings/numbers, timeout constants, sidecar logger usage (never `console.log`), simplicity-first
- `.planning/codebase/ARCHITECTURE.md` — Sidecar route structure, metadata store, adapter cache pattern
- `.planning/codebase/CONVENTIONS.md` — File naming, export conventions, shadcn UI rules, state management patterns

### Shared Contract

- `packages/shared/src/schema-tools.ts` — `SchemaSnapshotRecord`, `SchemaSnapshotSummary`, `SchemaChangelogEntry`, `SchemaChangeDescriptor`, `SchemaDiffInput` types — the snapshot data shapes
- `packages/shared/src/constants.ts` — `SCHEMA_CACHE_TIME`, `STATS_CACHE_TIME` — cache duration constants pattern to follow

### Existing Snapshot Infrastructure

- `apps/sidecar/src/routes/sql-schema.ts` — Snapshot capture route (`POST /schema/snapshots`), changelog, diff, migration routes — the capture logic to extract and reuse
- `apps/sidecar/src/db/metadata-store.ts` — `saveSchemaSnapshot()`, `getSchemaSnapshots()`, `getSchemaSnapshotData()`, `deleteOldSchemaSnapshots()` — persistence functions; `schema_snapshots` table schema (line 288)
- `apps/sidecar/src/adapters/postgres.ts` — `pg` module usage, `pg.Pool` and `pg.Client` patterns (lines 1, 117, 629, 672) — reference for `pg_notify` listener implementation
- `apps/sidecar/src/lib/constants.ts` — Existing timeout/interval constants pattern (`ADAPTER_TIMEOUTS`, `CONNECTION_TEST_TIMEOUT_MS`)
- `apps/sidecar/src/lib/logger.ts` — Shared pino logger (`log`) — must use for all sidecar logging

### Desktop Integration

- `apps/desktop/src/components/schema-timeline.tsx` — Existing timeline component (238 lines) — where auto-snapshot controls are added
- `apps/desktop/src/hooks/use-schema-changelog.ts` — Existing hooks (`useSchemaChangelog`, `useCaptureSchemaSnapshot`) — where new watcher hooks are added
- `apps/desktop/src/lib/api.ts` — API client — where new watcher endpoint methods are added
- `apps/desktop/src/lib/query-keys.ts` — TanStack Query key registry — where watcher query keys are added
- `apps/desktop/src/components/ui/button.tsx`, `select.tsx`, `badge.tsx` — shadcn primitives for the auto-snapshot controls

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/sidecar/src/routes/sql-schema.ts:53-91` — The `POST /schema/snapshots` capture logic (list schemas → list tables → get columns + indexes → save). This is the capture function to extract into a reusable helper for the watcher.
- `apps/sidecar/src/db/metadata-store.ts:764-791` — `saveSchemaSnapshot()`, `getSchemaSnapshots()`, `getSchemaSnapshotData()`, `deleteOldSchemaSnapshots()` — the persistence layer. The watcher reuses `saveSchemaSnapshot()` directly.
- `apps/sidecar/src/routes/sql.ts:28-67` — `getSqlAdapter(connectionId)` — the adapter loader with cache. The watcher uses this to get a SQL adapter for snapshot capture.
- `apps/sidecar/src/adapters/postgres.ts:1,629,672` — `pg.Client` usage pattern for one-off PostgreSQL connections (used for psql backup/restore). Reference for the `pg_notify` listener's dedicated client connection.
- `apps/desktop/src/components/schema-timeline.tsx` — The timeline UI component. The auto-snapshot controls section is added here (no new component file needed for the controls — they're part of the timeline header area).
- `apps/desktop/src/hooks/use-schema-changelog.ts` — Existing TanStack Query hooks for schema data. New watcher hooks follow the same pattern.
- `apps/desktop/src/lib/api.ts` — HTTP client. New watcher methods follow the existing `captureSchemaSnapshot()`, `getSchemaChangelog()` pattern.

### Established Patterns

- Sidecar route groups mounted in `index.ts` via `app.route('/sql', sqlRouter)` — the watcher routes are sub-routes of the existing `sqlRouter` (under `/:connectionId/schema/watcher/*`)
- Metadata store tables use `CREATE TABLE IF NOT EXISTS` with `initMetadataStore()` — the `schema_watchers` table follows this pattern
- shadcn components from `apps/desktop/src/components/ui/` — never raw HTML (AGENTS.md rule)
- TanStack Query hooks in `apps/desktop/src/hooks/` for data fetching; mutations for write operations
- `KIND` constants from `@kamehadb/shared` for all database kind comparisons — the pg_notify listener checks `KIND.POSTGRES` before starting
- Timeout/interval constants in `apps/sidecar/src/lib/constants.ts` — never inline magic numbers
- Sidecar logger: `import { log } from '../lib/logger.js'` — never `console.log`

### Integration Points

- `apps/sidecar/src/routes/sql-schema.ts` — Extract `captureSnapshot()` helper; add watcher sub-routes (`/schema/watcher/start`, `/schema/watcher/stop`, `/schema/watcher/status`)
- `apps/sidecar/src/db/metadata-store.ts` — Add `schema_watchers` table + CRUD functions in `initMetadataStore()`
- `apps/sidecar/src/lib/schema-watcher.ts` — New file: watcher singleton managing cadence timers + pg_notify listeners
- `apps/sidecar/src/lib/constants.ts` — Add watcher constants (default interval, min interval, reconnection backoff, notify channel name)
- `apps/sidecar/src/index.ts` — Call `schemaWatcher.resumeAll()` on startup
- `packages/shared/src/schema-tools.ts` — Add `SchemaWatcherConfig`, `SchemaWatcherStatus` types; add optional `source` field to `SchemaSnapshotRecord`
- `apps/desktop/src/components/schema-timeline.tsx` — Add auto-snapshot controls section
- `apps/desktop/src/hooks/use-schema-changelog.ts` — Add `useSchemaWatcherStatus`, `useStartSchemaWatcher`, `useStopSchemaWatcher` hooks
- `apps/desktop/src/lib/api.ts` — Add watcher API methods
- `apps/desktop/src/lib/query-keys.ts` — Add `SCHEMA_WATCHER` query key

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing schema timeline patterns for consistency. The auto-snapshot feature is an opt-in extension of the existing manual snapshot workflow.

</specifics>

<deferred>
## Deferred Ideas

- **Non-PostgreSQL event-triggered snapshots** — Only PostgreSQL supports `pg_notify`. Other SQL engines (MySQL, SQLite, etc.) could use polling-based change detection (e.g. comparing `information_schema` hashes), but that's a separate, more complex feature. Cadence-based watching covers all SQL engines in this phase.
- **Snapshot retention policy UI** — The existing 50-snapshot cap (`deleteOldSchemaSnapshots(connectionId, 50)`) is reused. A user-configurable retention policy is a future enhancement.
- **Cross-connection snapshot comparison** — Comparing schemas across different connections (e.g. dev vs prod) is a separate feature with different UX needs.
- **Webhook/notification on auto-capture** — Sending an external notification (Slack, email) when a schema change is detected is a future integration, not part of the local-first v1.
- **Snapshot diffing with AI explanation** — Pre-seeding the AI chat from a detected schema change is related to Phase 4 (AI Chat Actions) and could be combined in a future iteration.

</deferred>

---

_Phase: 3-Schema Timeline Auto-Snapshots_
_Context gathered: 2026-06-29_
