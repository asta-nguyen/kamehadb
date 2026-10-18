# Connection health and runtime recovery

Verification: [x] **verified** — connection health checking runs via in-process Go background routines and Wails event emission.

## Business rules

- In the unified Wails desktop runtime, there is no sidecar child process. All database engine adapters execute directly in the Go backend.
- Background health checks run periodically via `internal/api/connections.go` (`HealthChecker`), polling configured connections and emitting health updates to the frontend webview via `runtime.EventsEmit`.
- On window focus or reconnection, the frontend triggers targeted health rechecks via `useRefreshConnection` and `api.checkConnectionHealth`.
- These checks establish database reachability and update UI connection status indicators without requiring sidecar process management or IPC tokens.

## Flow

1. The Go backend initializes `HealthChecker` on startup (`services.Health.Start(ctx)`).
2. The health service periodically pings active database connections and emits health status updates.
3. The frontend subscribes to health events and maintains connection badges in TanStack Store.
4. When the user manually requests a reload or when network state transitions, `useRefreshConnection` calls `api.checkConnectionHealth(connectionId)` via generated Wails bindings.
5. If the database responds, connection status is updated to `connected` and cached schema queries are refreshed. If the connection fails, the error message is displayed to the user and recorded in the in-app logs.

## State changes

- Backend maintains connection pool state in `internal/engines/registry.go`.
- Frontend store keeps connection status (`connected`, `connecting`, `disconnected`) in `appStore`.
- Profile credentials and configuration remain persisted in SQLite metadata store (`internal/store/`).

## Side effects

- Health checks perform lightweight pings or queries against the target database.
- Disconnected states trigger error toasts and disable query execution for that connection until restored.
- Successful manual reloads invalidate stale TanStack Query caches for tables and schemas.

## Related

- [Architecture overview](../architecture/overview.md)

## Sources

- `main.go`
- `app.go`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/sidebar.tsx`
- `apps/desktop/src/hooks/use-connections.ts`
- `apps/desktop/src/lib/api.ts`
- `apps/desktop/src/lib/query-keys.ts`
- `internal/api/connections.go`
- `internal/engines/registry.go`
