# Diagnostics and Database Maintenance

Verification: [x] Log collection, native PostgreSQL tools, and file-backed database maintenance were checked against current desktop, Tauri, and sidecar source.

## Application logs

### Business rules

- The built Tauri app has a Logs page that can filter entries by source and level, search text, expand details, copy filtered entries, refresh, and clear logs.
- The Tauri reader combines frontend, Tauri, and sidecar log files from the application data directory and returns the newest bounded entries.
- In browser/Vite mode, current desktop source returns an empty log list and a message that logs are available only in the built app. The source does not implement the localStorage fallback described in the repository's root AGENTS.md.

### Flow

1. Frontend errors can call the Tauri append command through app-logs.
2. Tauri writes frontend and native log entries under the app data logs directory. The sidecar logger writes JSON-line records to sidecar.log.
3. The Logs page reads a combined snapshot on open and refreshes it every two seconds.
4. The Rust command tails the three files, normalizes pino sidecar entries, sorts newest first, and truncates to the requested limit.

### State changes

- Log records are appended to files; clearing truncates the frontend, Tauri, and sidecar files.
- The Logs page keeps filters, search, and expanded entries in view state.

### Side effects

- Appending and reading logs perform local filesystem operations.
- The page's periodic refresh repeats the native log read while the page is mounted.

### Authorization & constraints

- The log read, append, and clear commands run through the Tauri bridge.
- The reader defaults to 300 entries and bounds its tail scan to the configured byte window.
- Current dev/browser behavior is empty logs; no localStorage log reader is established by apps/desktop/src/lib/app-logs.ts.

### Error paths

- Frontend append is best-effort and swallows Tauri IPC or file-write failures.
- A read or clear failure is displayed in the Logs page.
- A missing or unreadable log file contributes no entries to the combined snapshot.

### Tests

The recorded FFF test-file search for read_app_logs in test/spec files returned no direct Logs-page or log-command test.

### Related

- [Connections and workspace](../workflows/connections-and-workspace.md)
- [Sidecar recovery after app resume](../workflows/sidecar-resume-recovery.md)

### Sources

- apps/desktop/src/components/logs-page.tsx
- apps/desktop/src/lib/app-logs.ts
- apps/desktop/src-tauri/src/app_logs.rs
- apps/desktop/src-tauri/src/lib.rs
- apps/sidecar/src/lib/logger.ts
- apps/sidecar/src/index.ts

## PostgreSQL psql terminal

### Business rules

- A saved PostgreSQL profile can open a psql PTY terminal from the workspace.
- The command uses saved host, port, username, database, SSL choice, and password.
- Terminal sessions are runtime process state and are stopped through the terminal-session commands or app shutdown.

### Flow

1. The desktop requests a terminal session for the selected PostgreSQL connection.
2. Tauri loads the saved profile from the app metadata, resolves psql, and starts a PTY with the profile arguments and environment.
3. The desktop writes input, resizes the PTY, and receives terminal events until the process exits or is stopped.

### State changes

- Active PTY handles and session metadata live in Tauri-managed memory.
- No psql session history is persisted by the terminal-session manager.

### Side effects

- Tauri starts a local psql process.
- If the saved profile has a password, the process receives it in PGPASSWORD. SSL profiles also set the required SSL mode.
- Start failures are appended to the Tauri log.

### Authorization & constraints

- The command loads a saved PostgreSQL profile by connection ID; non-PostgreSQL profiles are rejected by the profile loader.
- The terminal uses the locally resolved psql executable and starts in the saved database context.

### Error paths

- Missing profile, unavailable psql binary, PTY startup failure, write/resize failure, or process exit is reported by the terminal command/event path.

### Tests

- apps/desktop/src-tauri/src/postgres_psql/mod.rs contains unit tests for the psql command arguments, saved password environment, and SSL settings.
- apps/desktop/src-tauri/src/terminal_sessions/mod.rs contains session-event serialization tests.

### Related

- [Architecture overview](../architecture/overview.md)

### Sources

- apps/desktop/src/components/postgres-psql-tab.tsx
- apps/desktop/src/components/workspace-content.tsx
- apps/desktop/src-tauri/src/postgres_psql/mod.rs
- apps/desktop/src-tauri/src/terminal_sessions/mod.rs
- apps/desktop/src-tauri/src/postgres_tools/config.rs
- apps/desktop/src-tauri/src/lib.rs

## PostgreSQL backup and restore jobs

### Business rules

- PostgreSQL backups can target a database, schema, or table and use plain, custom, or tar output.
- Restore accepts SQL/psql files through psql and archive files through pg_restore.
- Restore requires a target database; archive restore can request a clean operation.
- Jobs stream progress and finish as completed, failed, or cancelled.

### Flow

1. The desktop submits a backup or restore request for a saved PostgreSQL profile.
2. Tauri validates the request and starts pg_dump, psql, or pg_restore as a managed job.
3. Tauri emits job log lines and a final state event. The UI renders the job log and exposes cancellation while running.

### State changes

- Job IDs, child process handles, and progress state are held in Tauri memory for the life of the job.
- The backup file is written to the selected destination; restore changes the selected PostgreSQL target.

### Side effects

- Backup launches pg_dump and writes a local file.
- Restore launches psql or pg_restore and may modify the target database.
- Cancellation kills the managed child process; job events report cancellation or process failure.

### Authorization & constraints

- The job uses the selected saved PostgreSQL profile and the app-managed or resolved PostgreSQL utility binary.
- Input files must exist for restore; output and restore options are validated before the process starts.

### Error paths

- Missing profile, invalid target/options, missing input file, missing utility, process spawn failure, non-zero exit, and cancellation produce distinct job errors/events.

### Tests

- apps/desktop/src-tauri/src/postgres_tools/config.rs contains validation tests for backup and restore options.
- apps/desktop/src-tauri/src/postgres_tools/mod.rs contains job-event serialization tests.

### Related

- [PostgreSQL psql terminal](diagnostics-and-maintenance.md)

### Sources

- apps/desktop/src/components/postgres-backup-dialog.tsx
- apps/desktop/src/components/postgres-restore-dialog.tsx
- apps/desktop/src/components/postgres-tool-log.tsx
- apps/desktop/src/hooks/use-postgres-tool-job.ts
- apps/desktop/src-tauri/src/postgres_tools/mod.rs
- apps/desktop/src-tauri/src/postgres_tools/jobs.rs
- apps/desktop/src-tauri/src/postgres_tools/config.rs
- apps/desktop/src-tauri/src/lib.rs

## SQLite and DuckDB file backup/restore

### Business rules

- File backup and restore are available for SQLite and DuckDB profiles only.
- Backup requires an existing configured database file and a distinct output path.
- Restore requires an existing input file and a destination different from the configured database file.
- SQLite backup uses VACUUM INTO to create a consistent snapshot. DuckDB backup copies the main file and recognized related files.
- Restore copies related sidecar files when present; if none exist in the backup, stale destination sidecars are removed.

### Flow

1. The desktop maintenance dialog calls the connection-scoped backup or restore hook.
2. The sidecar validates the profile kind and file path, then performs the filesystem/database operation.
3. On success, the desktop invalidates the profile's query cache and reports completion.

### State changes

- Backup creates the selected output file and any related files.
- Restore replaces the configured database file and related files; it does not update the saved profile path.

### Side effects

- The sidecar reads, writes, copies, or removes files on the local filesystem.
- Successful restore invalidates all desktop query-cache entries containing the connection ID so views reload from the restored file.

### Authorization & constraints

- Only SQLite and DuckDB profiles with a concrete file path are accepted.
- Source and target paths must differ.
- SQLite uses VACUUM INTO. DuckDB copies known related suffixes with its main file.

### Error paths

- Unsupported profile kind, missing saved path, missing source file, identical paths, and filesystem errors return an error to the desktop.
- The desktop shows an error toast and appends a frontend log on failure.

### Tests

The recorded FFF test-file search for backupFileDatabase and file-database-maintenance route identifiers in test/spec files returned no direct maintenance test.

### Related

- [Database support](../architecture/engine-support.md)
- [Connections and workspace](../workflows/connections-and-workspace.md)

### Sources

- apps/desktop/src/components/file-database-backup-dialog.tsx
- apps/desktop/src/components/file-database-restore-dialog.tsx
- apps/desktop/src/hooks/use-file-database-maintenance.ts
- apps/desktop/src/lib/file-database-maintenance.ts
- apps/sidecar/src/lib/file-database-maintenance.ts
- apps/sidecar/src/routes/connections.ts
- apps/sidecar/src/lib/constants.ts
