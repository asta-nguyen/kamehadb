# Sidecar recovery after app resume

Verification: [~] **verification limit** — current source establishes what happens when the registered browser events fire, but no repository test or macOS Tauri sleep/wake run establishes which events the WebView emits after the lid opens.

## Business rules

- In the Tauri app, sidecar checks run at startup and when the window gets focus, becomes visible, or the browser reports the network online. Vite development mode assumes the sidecar was started separately and marks it ready.
- Focus and connectivity events share one in-flight native check. The hook then health-checks the local sidecar using its current port and authentication token.
- A changed sidecar PID or port marks a new process generation. Replacing an already active process invalidates the React Query cache; each new generation also invalidates MCP account and settings queries.
- These checks establish local sidecar health. They do not establish that any remote database is reachable or explicitly reconnect a database adapter.

## Flow

1. Tauri starts the sidecar during app setup. `App` also mounts `useSidecar`, which subscribes to `sidecar-ready` and invokes `start_sidecar`.
2. On focus, a visible-state transition, or an `online` event, the hook invokes `start_sidecar` again. Concurrent triggers reuse the same in-flight check.
3. Rust holds the sidecar state lock and calls `try_wait` on the managed child. A live child returns its existing port, PID, and token. An exited child handle is discarded and a replacement Node process is started; Tauri stores the new handle and emits `sidecar-ready`.
4. The hook updates the desktop API base and polls `http://127.0.0.1:<port>/health` up to 30 times, 200 ms apart. `App` enables saved-connection loading only while the sidecar is ready.
5. If the process changed, the hook invalidates the React Query cache. A same-process health check does not invalidate the general query cache.

## State changes

- Tauri keeps the child process, port, and token in an in-memory `Mutex<Option<SidecarProcess>>`; a new process gets a new PID, allocated port, and token.
- The React hook keeps `ready`, `error`, and the active PID/port generation in component state and local variables. The recovery status is not persisted.
- The sidecar initializes its local metadata store when the process starts. This recovery flow does not modify saved connection profiles.

## Side effects

- Starting a replacement spawns the bundled sidecar under Node and emits the `sidecar-ready` event.
- The desktop sends an authenticated health request to the loopback sidecar.
- A detected process replacement invalidates cached React Query data; new generations also invalidate MCP account and settings queries.
- The sidebar's manual **Reload connection** action follows a separate path: it requests `/connections/:id/health`, which tests that database profile. If the request itself rejects, the desktop marks the connection disconnected, shows an error toast, and logs `Connection reload failed: <message>` under `use-connections.refresh`. If the sidecar returns a health result with `success: false`, the hook shows the database result message or `Connection failed` instead.

## Authorization & constraints

- Recovery handlers are installed only in the Tauri runtime. The `online` browser event is a trigger; it is not proof that a database network path has recovered.
- The health probe targets `127.0.0.1` and uses the sidecar token installed by `setApiBase`.
- If the native child is still alive but its health endpoint does not respond, `start_sidecar` reuses that child. The frontend reports the failed health check; this path does not force-kill a live process.

## Error paths

- A Tauri invoke or event-listener setup failure sets the hook error and leaves the app not ready.
- If health polling fails, the hook reports `Sidecar started but health check failed`. While not ready, `App` displays **Sidecar failed to start**, the returned error, and generic Node.js/restart guidance.
- A manual connection reload whose HTTP request rejects is logged by `use-connections.refresh`; that log message alone does not establish whether the sidecar, local network request, or database endpoint caused the rejection.

## Tests

Tests: none found for the resume handlers or manual reload hook. An FFF search over `*.{test,spec}.{ts,tsx,rs}` for `useSidecar`, `start_sidecar`, `sidecar-ready`, `useRefreshConnection`, and `checkConnectionHealth` returned no matches. This repository search does not exercise macOS sleep/wake behavior.

## Related

- [Architecture overview](../architecture/overview.md)

## Sources

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/sidebar.tsx`
- `apps/desktop/src/hooks/use-connections.ts`
- `apps/desktop/src/hooks/use-sidecar.ts`
- `apps/desktop/src/lib/api-client.ts`
- `apps/desktop/src/lib/api.ts`
- `apps/desktop/src/lib/query-keys.ts`
- `apps/desktop/src/lib/tauri.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/sidecar/src/index.ts`
- `apps/sidecar/src/routes/connections.ts`
