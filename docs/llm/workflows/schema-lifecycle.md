# Schema Lifecycle

Verification: [x] Snapshot capture/watch, diff generation, and migration output were checked against current route, watcher, helper, and UI source.

## Schema snapshots and watchers

### Business rules

- A schema snapshot records the observed schemas, tables, columns, and indexes for a SQL profile.
- Manual capture is available from the schema timeline. The sidecar caps retained snapshots at 50.
- Automatic capture can be enabled per connection with a configured interval. PostgreSQL also supports a notification-backed watcher.
- Enabled watchers resume when the sidecar starts.

### Flow

1. The timeline asks the desktop hook for stored snapshots and can request a manual capture.
2. The sidecar reads the current schema through the selected SQL adapter, serializes its metadata, and persists a snapshot in the local metadata SQLite database.
3. A scheduled watcher performs captures at its configured cadence. For PostgreSQL, a database notification can also trigger a capture.
4. Sidecar startup resumes watchers that are enabled in persisted settings.

### State changes

- Snapshot records and watcher settings are persisted in metadata SQLite.
- A captured snapshot becomes available to the timeline and later diff requests.

### Side effects

- Capturing reads schema metadata from the target database and writes one local snapshot.
- Watchers create background timers; the PostgreSQL notification watcher also maintains a database listener and reconnects after listener failure.

### Authorization & constraints

- Snapshot capture follows the SQL adapter and profile used by the route.
- The watcher prevents overlapping automatic captures for one profile and enforces a minimum interval from shared constants.
- PostgreSQL notification capture is engine-specific; other SQL engines use the interval watcher.

### Error paths

- A capture failure is returned to the caller or recorded by the watcher logger; it does not fabricate a successful snapshot.
- Invalid watcher request bodies are rejected by route validation.

### Tests

- apps/sidecar/src/routes/sql-schema.test.ts covers invalid watcher request payloads and a watcher-start edge case. It does not establish macOS sleep/wake timing or the full snapshot-capture lifecycle.

### Related

- [SQL workspace](sql-workspace.md)
- [Sidecar recovery after app resume](sidecar-resume-recovery.md)

### Sources

- apps/desktop/src/components/schema-timeline.tsx
- apps/desktop/src/hooks/use-schema-changelog.ts
- apps/desktop/src/hooks/use-auto-capture-invalidation.ts
- apps/sidecar/src/routes/sql-schema.ts
- apps/sidecar/src/lib/schema-watcher.ts
- apps/sidecar/src/db/metadata-store.ts
- apps/sidecar/src/routes/sql-schema.test.ts

## Schema diff and migration SQL

### Business rules

- Diffs compare two stored snapshots and report table, column, and index changes.
- The migration assistant defaults to the latest two snapshots when available and allows the user to copy generated SQL.
- Generated migration SQL is not executed automatically.
- Primary-key changes can include comments that require manual review.

### Flow

1. The user selects two snapshots in the timeline/diff workflow.
2. The sidecar loads both snapshots and computes a structural diff.
3. The migration assistant chooses source and target snapshots, requests dialect-aware SQL, and displays it for review or copy.

### State changes

- Snapshot IDs used by the migration view are stored on its workspace tab.
- Diff and generated SQL are derived from the selected snapshots; they do not mutate the database.

### Side effects

- Diff generation reads local snapshot records.
- SQL generation is local computation based on the snapshots and database dialect.

### Authorization & constraints

- A diff requires snapshots for the same connection.
- SQL syntax is selected using the profile's engine kind. The result may require manual adjustment for complex or destructive changes.

### Error paths

- Missing or invalid snapshot IDs prevent diff generation and are returned as route errors.
- Generated SQL is presented as text; applying it remains a separate user action in the SQL editor.

### Tests

The recorded FFF test-file search for schema diff and migration generator terms in test/spec files found no matching direct tests; the existing sql-schema.test.ts covers request validation and watcher startup only.

### Related

- [SQL workspace](sql-workspace.md)

### Sources

- apps/desktop/src/components/schema-diff-view.tsx
- apps/desktop/src/components/migration-assistant.tsx
- apps/desktop/src/store/workspace-tabs.ts
- apps/desktop/src/hooks/use-schema-changelog.ts
- apps/sidecar/src/routes/sql-schema.ts
- apps/sidecar/src/lib/schema-diff.ts
- apps/sidecar/src/lib/schema-migration.ts
- apps/sidecar/src/routes/sql-schema.test.ts
