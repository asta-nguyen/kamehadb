# Connections and Workspace

Verification: [~] Confirmed content gap: the preview-lifetime requirement below is owned by the in-progress runtime-footprint change and is not refreshed here. The connection, reload, tab, and global-search narratives were checked against current Go/Wails source and desktop hooks, but this checkpoint does not mark the page current.

## Requirements

### WSP-preview-lifetime

The system SHALL remove a table's cached preview variants when its view unmounts.

#### Scenario: switching away from a table

- GIVEN cached pages for one mounted table
- WHEN its preview hook unmounts
- THEN its page, filter, and sort variants are removed without removing another table's metadata or previews

Evidence: `apps/desktop/src/hooks/use-schema.ts`, `apps/desktop/src/hooks/use-schema.test.tsx`

## Sources

- `apps/desktop/src/hooks/use-schema.ts`
- `apps/desktop/src/hooks/use-schema.test.tsx`

## Connection profiles

### Business rules

- Profiles are created and edited in the desktop connection dialog, tested before save when the user requests it, then listed from the Go backend.
- The dialog supports connection URLs and structured fields. URL parsing uses shared protocol aliases; engine-specific defaults come from shared constants.
- PostgreSQL, MySQL, MariaDB, and SQL Server show an SSL toggle. When SSL is enabled, the dialog can save an optional Root CA PEM from pasted text or a selected file. The PEM is local profile trust data; it is not sent to the database server. Per-engine certificate verification behavior is documented in [Database support and adapter boundaries](../architecture/engine-support.md).
- The backend persists profiles in the metadata SQLite store. Secrets (profile password, connection string, and AI provider API key) are AES-256-GCM encrypted at rest; the returned profile list omits the password value. If a profile has an active managed MCP account, connection identity, target, SSL toggle, credentials, and deletion are protected until that account is revoked; Root CA PEM remains editable.

### Flow

1. The connection dialog validates the selected engine fields and calls create, update, or test mutations from use-connections. For the four SSL-capable kinds, the SSL toggle controls Root CA field visibility; selecting a PEM file reads its text into the same form field used for save and edit.
2. The desktop API client calls the bound `ConnectionsService` methods through `apps/desktop/src/lib/api.ts`.
3. The backend validates the shared profile contract, performs the relevant adapter health check for test requests, and reads or writes the metadata store for profile CRUD.
4. Successful desktop mutations invalidate the saved-connection query so the sidebar reloads the profile list.

### State changes

- Profile fields are stored in the metadata SQLite database; secret columns hold ciphertext and are decrypted on read. The profile list returned to the desktop omits the password value.
- The optional Root CA PEM is persisted with the profile as client-side trust data and passed into the SQL driver's TLS configuration.
- Creating, editing, or deleting a profile updates the local profile row and changes the connection list after query invalidation.

### Side effects

- Test requests open a database-specific health check; CRUD updates metadata SQLite.
- Profile edits and deletion also invalidate caches that depend on that profile.

### Authorization & constraints

- The backend is called through Wails bindings; there is no HTTP API or sidecar port.
- Profile validation and defaults are shared from packages/shared.
- While an MCP managed account exists, changing the profile kind, target, SSL toggle, saved username/password, or deleting the profile is rejected. The Root CA PEM remains editable so an expired certificate cannot block Revoke. See [Read-only MCP server](../integrations/read-only-mcp.md).

### Error paths

- Invalid profile data is rejected by schema validation.
- Failed database tests return the adapter's connection failure to the dialog.
- Invalid Root CA PEM is rejected before the SQL driver opens a connection.
- A profile protected by an MCP managed account cannot be edited or deleted until that account is revoked.
- A missing or unreadable vault key fails decryption rather than returning plaintext.

### Tests

- `internal/store/credentials_test.go` covers secret migration, keychain/file key resolution, fail-closed decryption, and POSIX permissions; `internal/store/vault_test.go` covers record/field binding.
- `apps/desktop/src/components/connection-dialog-fields.test.tsx` covers SSL-kind visibility, Root CA visibility, edit values, and PEM file loading. `internal/store/profiles_test.go` covers Root CA persistence and migration; `internal/api/api_test.go` covers profile pass-through and Root CA edits while a managed MCP account exists.

### Related

- [Architecture overview](../architecture/overview.md)
- [Read-only MCP server](../integrations/read-only-mcp.md)

### Sources

- apps/desktop/src/components/connection-dialog.tsx
- apps/desktop/src/components/connection-dialog-fields.tsx
- apps/desktop/src/components/connection-dialog-fields.test.tsx
- apps/desktop/src/hooks/use-connections.ts
- apps/desktop/src/lib/api.ts
- internal/api/connections.go
- internal/api/api_test.go
- internal/engines/tls.go
- internal/engines/tls_test.go
- internal/store/migrate.go
- internal/store/profiles_test.go
- internal/store/profiles.go
- internal/store/vault.go
- packages/shared/src/index.ts
- packages/shared/src/schemas.ts

## Connection health and reload

### Business rules

- The sidebar receives periodic health results over the backend `connections:health` Wails event and shows connection status and latency.
- Manual **Reload connection** performs a health request for one saved profile, then invalidates caches scoped to that connection. It refetches currently mounted connection views so updated objects appear without closing and reopening the tree.
- This action tests the database profile; it is separate from app startup restoring saved state.

### Flow

1. The sidebar starts the health event subscription for saved profiles.
2. The backend health loop probes profiles on its interval with bounded concurrency and emits status results on `connections:health`.
3. The user can request a one-profile reload from the sidebar. useRefreshConnection calls `checkConnectionHealth`.
4. On a returned health result, the hook updates the connection status, invalidates that profile's query keys, refetches active views, and completes the loading toast with success or failure.

### State changes

- Connection status is held in desktop app state; it is not a persisted profile field.
- Reload refreshes cached database metadata but does not recreate the saved profile or force-close open tabs.

### Side effects

- Health requests open or reuse adapter-backed database checks in the backend.
- Successful reload invalidates profile-scoped query caches. A rejected request sets the visible state to disconnected, shows an error toast, and writes a frontend log with scope use-connections.refresh.

### Authorization & constraints

- Health events and manual health requests go through the Wails bindings.
- A status event or successful local health check does not itself prove every remote database is reachable.

### Error paths

- A health result with success: false sets disconnected and displays the returned message, falling back to Connection failed.
- If the reload request rejects, the hook shows a toast using the safe error message and logs Connection reload failed: <message>.
- The frontend log identifies the rejected reload operation; by itself it does not identify whether the backend call, local network, or database caused the failure.

### Tests

Searches for useRefreshConnection, checkConnectionHealth, and connection health event terms found no direct reload-hook test.

### Related

- [Sidecar recovery after app resume](sidecar-resume-recovery.md)

### Sources

- apps/desktop/src/components/sidebar.tsx
- apps/desktop/src/hooks/use-connections.ts
- apps/desktop/src/lib/api.ts
- apps/desktop/src/lib/app-logs.ts
- internal/api/connections.go

## Workspace tabs, pins, and navigation

### Business rules

- Workspace tabs are keyed by tab IDs. Opening an existing tab updates its stored fields and activates it; opening a new tab appends it and makes it active.
- Tab records use a discriminated type for SQL query, schema graph, schema timeline, schema diff, migration, database stats, MongoDB, Redis, Mongo shell, Postgres psql, and federated query views.
- The desktop persists opened tabs, active tab, and pinned profiles in browser localStorage-backed app state.

### Flow

1. Sidebar and workspace actions call store helpers to open a tab for the selected connection or object.
2. The TanStack Store updates the open-tab array, active tab, and active connection.
3. Store subscriptions persist the workspace state; app startup restores supported state values.

### State changes

- Open tabs, active-tab selection, and pinned-profile IDs are persisted in localStorage keys defined by the store modules.
- Tab-specific editor text and options update the tab object in the same store.

### Side effects

- Opening or selecting a tab changes the active workspace content.
- Unmounting a Mongo shell tab stops its backend PTY session through the terminal-session hook.

### Authorization & constraints

- Workspace tabs are local UI state. They do not grant database access; each view still calls the backend using the saved connection profile.
- A restored tab can be selected before its remote database is reachable; data loading then follows the view's query state.

### Error paths

- Invalid or unsupported saved tab data is handled by the store's restore/normalization path; the database request errors are surfaced by the individual view hooks.

### Tests

- `apps/desktop/src/store/workspace-tabs.test.ts` covers the open/close/reorder tab-state helpers.
- Searches for workspace tab persistence and pin state found no separate persistence test.

### Related

- [Architecture overview](../architecture/overview.md)
- [Sidecar recovery after app resume](sidecar-resume-recovery.md)

### Sources

- apps/desktop/src/store/workspace-tabs.ts
- apps/desktop/src/store/state.ts
- apps/desktop/src/store/ui-preferences.ts
- apps/desktop/src/components/workspace-content.tsx
- apps/desktop/src/hooks/use-terminal-session.ts
- apps/desktop/src/App.tsx

## Global search

### Business rules

- Global search filters saved connections, open tabs, and available actions. SQL schema search begins only after at least two query characters.
- Schema matches are fetched across SQL-kind connections, debounced by 300 ms, limited to five matches per connection, and grouped by connection.

### Flow

1. Typing updates the command dialog query.
2. A prior debounce timer and in-flight schema request are canceled before a new search is scheduled.
3. The desktop calls `searchSchema` for each SQL profile in parallel.
4. Selecting a schema result opens the corresponding table view; selecting a connection or action changes workspace state or opens the related view.

### State changes

- Search results and unsupported-connection markers live only in component state and reset when the dialog closes.

### Side effects

- Schema searches issue bound backend calls.
- Stale fetches are aborted. Network and abort errors are skipped without a user-facing error in this component.

### Authorization & constraints

- Only profiles recognized by isSqlKind receive schema-search requests.
- The backend may report the profile as unsupported; the dialog records that profile as unsupported.

### Error paths

- Non-OK responses other than the recognized unsupported response do not become a visible error message here.
- Aborted and failed searches are caught and omitted from the current result set.

### Tests

Searches for GlobalSearch in test/spec files returned no matching component test.

### Related

- [SQL workspace](sql-workspace.md)

### Sources

- apps/desktop/src/components/global-search.tsx
- apps/desktop/src/components/ui/command.tsx
- apps/desktop/src/hooks/use-connections.ts
- apps/desktop/src/lib/api.ts
