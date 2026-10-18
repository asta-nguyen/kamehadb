# Diagnostics and Database Maintenance

Verification: [x] Log collection, native PostgreSQL tools, and file-backed database maintenance were checked against current Go backend and desktop source.

## Application logs

### Business rules

- The app has a Logs page that can filter entries by source and level, search text, expand details, copy filtered entries, refresh, and clear logs.
- `internal/logs` writes JSON-lines: the Go backend to `app.log` and browser-forwarded entries to `frontend.log` under `<data dir>/logs`. On read it also merges legacy `tauri.log` and `sidecar.log` files so pre-Wails history is retained.
- The reader returns the newest bounded entries, defaulting to 300, scanned from a bounded 256KB tail window.

### Flow

1. Frontend errors call `appendFrontendLog`, which invokes the bound `LogsService.AppendFrontendLog`.
2. The Go backend appends each entry as one JSON line to the relevant producer file.
3. The Logs page reads a merged snapshot through `LogsService.ReadAppLogs` on open and refreshes it every two seconds.
4. The reader tails each producer file, normalizes legacy pino sidecar records, sorts newest first, and truncates to the requested limit.

### State changes

- Log records are appended to files; clearing truncates the frontend, app, tauri, and sidecar files.
- The Logs page keeps filters, search, and expanded entries in view state.

### Side effects

- Appending and reading logs perform local filesystem operations.
- The page's two-second refresh repeats the log read while the page is mounted.

### Authorization & constraints

- Log append, read, and clear go through the Wails `LogsService` bindings.
- The reader defaults to 300 entries and bounds its tail scan to 256KB.

### Error paths

- Frontend append is best-effort: it logs a console breadcrumb and never throws to the caller.
- A read or clear failure is displayed in the Logs page; the page avoids writing its own read errors back into the log pipeline.
- A missing or unreadable log file contributes no entries to the combined snapshot.

### Tests

`internal/logs/logs_test.go` covers the tail reader, sidecar normalization, and clear behavior. Searches for a Logs-page component test found none.

### Related

- [Connections and workspace](../workflows/connections-and-workspace.md)

### Sources

- apps/desktop/src/components/logs-page.tsx
- apps/desktop/src/lib/app-logs.ts
- internal/api/logs.go
- internal/logs/logs.go
- internal/logs/logs_test.go

## PostgreSQL psql terminal

### Business rules

- A saved PostgreSQL profile can open a psql PTY terminal from the workspace.
- The command uses saved host, port, username, database, and SSL choice; the saved password is passed through the process environment.
- Terminal sessions are runtime process state and are stopped through the terminal-session commands or app shutdown.

### Flow

1. The desktop requests a terminal session for the selected PostgreSQL connection.
2. `TerminalService.StartPostgresPsqlSession` loads the saved profile, resolves psql via the maintenance tool resolver, and starts a PTY with the profile arguments and environment.
3. The desktop writes input, resizes the PTY, and receives `terminal-session-event` payloads until the process exits or is stopped.

### State changes

- Active PTY handles and session metadata live in the backend terminal manager.
- No psql session history is persisted by the terminal manager.

### Side effects

- The backend starts a local psql process.
- If the saved profile has a password, the process receives it in PGPASSWORD; SSL profiles also set `sslmode=require`.
- Start failures, exit, and exit-code conditions are reported through terminal-session events.

### Authorization & constraints

- The command loads a saved PostgreSQL profile by connection ID; non-PostgreSQL profiles are rejected by the profile loader.
- The terminal uses the locally resolved psql executable and starts in the saved database context.

### Error paths

- Missing profile, unavailable psql binary, PTY startup failure, write/resize failure, or process exit is reported by the terminal command/event path. A missing psql surfaces a specific install hint.

### Tests

Searches for a psql-session test found no direct backend test; the resolved psql argument and environment construction is exercised through `internal/maintenance`.

### Related

- [Architecture overview](../architecture/overview.md)

### Sources

- apps/desktop/src/components/postgres-psql-tab.tsx
- apps/desktop/src/components/workspace-content.tsx
- apps/desktop/src/hooks/use-terminal-session.ts
- internal/api/terminal.go
- internal/terminal/terminal.go
- internal/maintenance/pgtools.go

## PostgreSQL backup and restore jobs

### Business rules

- PostgreSQL backups can target a database, schema, or table and use plain, custom, or tar output.
- Restore accepts SQL/psql files through psql and archive files through pg_restore.
- Restore requires a target database; archive restore can request a clean operation.
- Jobs stream progress and finish as completed, failed, or cancelled.

### Flow

1. The desktop submits a backup or restore request for a saved PostgreSQL profile.
2. The backend validates the request and starts pg_dump, psql, or pg_restore as a managed job.
3. The backend emits job log lines and a final state on `postgres-tool-event`. The UI renders the job log and exposes cancellation while running.

### State changes

- Job IDs, child process handles, and progress state are held in the backend job manager for the life of the job.
- The backup file is written to the selected destination; restore changes the selected PostgreSQL target.

### Side effects

- Backup launches pg_dump and writes a local file.
- Restore launches psql or pg_restore and may modify the target database.
- Cancellation kills the managed child process; job events report cancellation or process failure.

### Authorization & constraints

- The job uses the selected saved PostgreSQL profile and the resolved PostgreSQL utility binary.
- Input files must exist for restore; output and restore options are validated before the process starts.

### Error paths

- Missing profile, invalid target/options, missing input file, missing utility, process spawn failure, non-zero exit, and cancellation produce distinct job errors/events.

### Tests

`internal/maintenance` covers command construction and job behavior; searches for a dedicated job-event serialization test found none.

### Related

- [PostgreSQL psql terminal](diagnostics-and-maintenance.md)

### Sources

- apps/desktop/src/components/postgres-backup-dialog.tsx
- apps/desktop/src/components/postgres-restore-dialog.tsx
- apps/desktop/src/components/postgres-tool-log.tsx
- apps/desktop/src/hooks/use-postgres-tool-job.ts
- internal/api/maintenance.go
- internal/maintenance/postgres.go
- internal/maintenance/pgtools.go

## SQLite and DuckDB file backup/restore

### Business rules

- File backup and restore are available for SQLite and DuckDB profiles only.
- Backup requires an existing configured database file and a distinct output path.
- Restore requires an existing input file and a destination different from the configured database file.
- SQLite backup uses VACUUM INTO to create a consistent snapshot. DuckDB backup copies the main file and recognized related files.
- Restore copies related sidecar files when present; if none exist in the backup, stale destination sidecars are removed only after a successful promotion.

### Flow

1. The desktop maintenance dialog calls the connection-scoped backup or restore hook.
2. `ConnectionsService` validates the profile kind and file path, then performs the filesystem/database operation.
3. On success, the desktop invalidates the profile's query cache and reports completion.

### State changes

- Backup creates the selected output file and any related files.
- Restore replaces the configured database file and related files; it does not update the saved profile path.

### Side effects

- The operation reads, writes, copies, or removes files on the local filesystem.
- Successful restore invalidates all desktop query-cache entries containing the connection ID so views reload from the restored file.

### Authorization & constraints

- Only SQLite and DuckDB profiles with a concrete file path are accepted.
- Source and target paths must differ.
- SQLite uses VACUUM INTO. DuckDB copies known related suffixes with its main file.
- New content is staged in temporary siblings and promoted by a backup-aside/promote/rollback sequence, so a failure leaves the previous output or database intact.

### Error paths

- Unsupported profile kind, missing saved path, missing source file, identical paths, and filesystem errors return an error to the desktop.
- The desktop shows an error toast and appends a frontend log on failure.
- A failure mid-promotion restores the previous files and removes the staged temporaries.

### Tests

`internal/maintenance/filedb_test.go` covers backup/restore failure preservation and mid-promotion rollback. Searches for a desktop maintenance-hook test found none.

### Related

- [Database support](../architecture/engine-support.md)
- [Connections and workspace](../workflows/connections-and-workspace.md)

### Sources

- apps/desktop/src/components/file-database-backup-dialog.tsx
- apps/desktop/src/components/file-database-restore-dialog.tsx
- apps/desktop/src/hooks/use-file-database-maintenance.ts
- apps/desktop/src/lib/file-database-maintenance.ts
- internal/api/connections.go
- internal/maintenance/filedb.go
- internal/maintenance/filedb_test.go
