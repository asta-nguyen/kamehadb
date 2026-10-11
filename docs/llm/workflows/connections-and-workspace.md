# Connections and Workspace

Verification: [x] The profile, health/reload, persisted workspace, and search flows below were checked against current source. Direct feature tests were searched as recorded in each feature.

## Connection profiles

### Business rules

- Profiles are created and edited in the desktop connection dialog, tested before save when the user requests it, then listed by the sidecar.
- The dialog supports connection URLs and structured fields. URL parsing uses shared protocol aliases; engine-specific defaults come from shared constants.
- The sidecar persists profiles in the metadata SQLite store. If a profile has an active managed MCP account, protected fields and deletion are rejected until that account is revoked.

### Flow

1. The connection dialog validates the selected engine fields and calls create, update, or test mutations from use-connections.
2. The desktop API client sends the request to the sidecar /connections routes.
3. The sidecar validates the shared profile contract, performs the relevant adapter health check for test requests, and reads or writes the metadata store for profile CRUD.
4. Successful desktop mutations invalidate the saved-connection query so the sidebar reloads the profile list.

### State changes

- Profile fields are stored in the metadata SQLite database. The profile list returned to the desktop omits the password value.
- Creating, editing, or deleting a profile updates the local profile row and changes the connection list after query invalidation.

### Side effects

- Test requests open a database-specific health check; CRUD updates metadata SQLite.
- Profile edits and deletion also invalidate sidecar caches that depend on that profile.

### Authorization & constraints

- The sidecar API is authenticated by the desktop's local API client.
- Profile validation and defaults are shared from packages/shared.
- While an MCP managed account exists, changing protected connection identity/credentials or deleting that profile is rejected. See [Read-only MCP server](../integrations/read-only-mcp.md).

### Error paths

- Invalid profile data is rejected by schema validation.
- Failed database tests return the adapter's connection failure to the dialog.
- A profile protected by an MCP managed account cannot be edited or deleted until that account is revoked.

### Tests

apps/sidecar/src/routes/mcp-settings.test.ts covers profile edit/delete protection while an MCP account exists. The recorded FFF test-file search for connectionsRouter found no direct connection CRUD route test.

### Related

- [Architecture overview](../architecture/overview.md)
- [Read-only MCP server](../integrations/read-only-mcp.md)

### Sources

- apps/desktop/src/components/connection-dialog.tsx
- apps/desktop/src/hooks/use-connections.ts
- apps/desktop/src/lib/api.ts
- apps/sidecar/src/routes/connections.ts
- apps/sidecar/src/db/metadata-store.ts
- packages/shared/src/index.ts
- packages/shared/src/schemas.ts
- apps/sidecar/src/routes/mcp-settings.test.ts

## Connection health and reload

### Business rules

- The sidebar receives periodic health results over the sidecar's /connections/health event stream and shows connection status and latency.
- Manual **Reload connection** performs a health request for one saved profile, then invalidates caches scoped to that connection. It refetches currently mounted connection views so updated objects appear without closing and reopening the tree.
- This action tests the database profile. It is independent from the desktop's local sidecar resume check.

### Flow

1. The sidebar starts the health event subscription for saved profiles.
2. The sidecar health route probes profiles on its configured interval with bounded concurrency and emits status results.
3. The user can request a one-profile reload from the sidebar. useRefreshConnection requests /connections/:id/health.
4. On a returned health result, the hook updates the connection status, invalidates that profile's query keys, refetches active views, and completes the loading toast with success or failure.

### State changes

- Connection status is held in desktop app state; it is not a persisted profile field.
- Reload refreshes cached database metadata but does not recreate the saved profile or force-close open tabs.

### Side effects

- Health requests open or reuse adapter-backed database checks in the sidecar.
- Successful reload invalidates profile-scoped query caches. A rejected request sets the visible state to disconnected, shows an error toast, and writes a frontend log with scope use-connections.refresh.

### Authorization & constraints

- Event-stream and manual health requests use the authenticated local sidecar API.
- A status event or successful loopback sidecar health check does not itself prove every remote database is reachable.

### Error paths

- A health result with success: false sets disconnected and displays the returned message, falling back to Connection failed.
- If the reload HTTP request rejects, the hook shows a toast using the safe error message and logs Connection reload failed: <message>.
- The frontend log identifies the rejected reload operation; by itself it does not identify whether the sidecar request, local network, or database caused the failure.

### Tests

The recorded FFF test-file search for useRefreshConnection, checkConnectionHealth, and connection health event terms returned no direct reload-hook test.

### Related

- [Sidecar recovery after app resume](sidecar-resume-recovery.md)

### Sources

- apps/desktop/src/components/sidebar.tsx
- apps/desktop/src/hooks/use-connections.ts
- apps/desktop/src/lib/api.ts
- apps/desktop/src/lib/app-logs.ts
- apps/sidecar/src/routes/connections.ts

## Workspace tabs, pins, and navigation

### Business rules

- Workspace tabs are keyed by tab IDs. Opening an existing tab updates its stored fields and activates it; opening a new tab appends it and makes it active.
- Tab records use a discriminated type for SQL, schema, stats, MongoDB, Redis, Qdrant, vector, TigerBeetle, terminal, and maintenance views.
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
- Closing a Mongo shell tab also requests cleanup of its sidecar shell session.

### Authorization & constraints

- Workspace tabs are local UI state. They do not grant database access; each view still calls the sidecar using the saved connection profile.
- A restored tab can be selected before its remote database is reachable; data loading then follows the view's query state.

### Error paths

- Invalid or unsupported saved tab data is handled by the store's restore/normalization path; the database request errors are surfaced by the individual view hooks.

### Tests

The recorded FFF test-file search for openTab, workspace tab persistence, and pin state in test/spec files returned no matching feature test.

### Related

- [Architecture overview](../architecture/overview.md)
- [Sidecar recovery after app resume](sidecar-resume-recovery.md)

### Sources

- apps/desktop/src/store/state.ts
- apps/desktop/src/store/workspace-tabs.ts
- apps/desktop/src/store/ui-preferences.ts
- apps/desktop/src/components/workspace-content.tsx
- apps/desktop/src/App.tsx

## Global search

### Business rules

- Global search filters saved connections, open tabs, and available actions. SQL schema search begins only after at least two query characters.
- Schema matches are fetched across SQL-kind connections, debounced by 300 ms, limited to five matches per connection, and grouped by connection.

### Flow

1. Typing updates the command dialog query.
2. A prior debounce timer and in-flight schema request are canceled before a new search is scheduled.
3. The desktop requests /sql/:id/schema/search for each SQL profile in parallel.
4. Selecting a schema result opens the corresponding table view; selecting a connection or action changes workspace state or opens the related view.

### State changes

- Search results and unsupported-connection markers live only in component state and reset when the dialog closes.

### Side effects

- Schema searches issue authenticated fetches to the local sidecar.
- Stale fetches are aborted. Network and abort errors are skipped without a user-facing error in this component.

### Authorization & constraints

- Only profiles recognized by isSqlKind receive schema-search requests.
- The server route may report NOT_SUPPORTED; the dialog records that profile as unsupported.

### Error paths

- Non-OK responses other than the recognized unsupported response do not become a visible error message here.
- Aborted and failed searches are caught and omitted from the current result set.

### Tests

The recorded FFF test-file search for GlobalSearch in test/spec files returned no matching component test.

### Related

- [SQL workspace](sql-workspace.md)

### Sources

- apps/desktop/src/components/global-search.tsx
- apps/desktop/src/components/ui/command.tsx
- apps/desktop/src/hooks/use-connections.ts
- apps/sidecar/src/routes/sql-schema.ts
