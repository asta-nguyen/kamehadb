## Context

A full code review identified 14 findings (2 P0, 5 P1, 7 P2) across the sidecar and desktop app. The most critical is that `isQuerySafe` is imported in `sql.ts` but never called — destructive SQL runs unguarded on the primary execution path. Other findings involve silent error swallowing, sequential N+1 queries, and type-safety gaps.

## Goals / Non-Goals

**Goals:**

- Enforce `isQuerySafe` on both server and client SQL execution paths
- Add error logging to all 28 empty catch blocks in the sidecar
- Parallelize sequential N+1 queries in MongoDB and AI schema context
- Add exhaustiveness guard to `getProviderRequirements`
- Fix SSE abort registration order
- Return 400 on malformed JSON in schema watcher start

**Non-Goals:**

- File decomposition (sql-editor.tsx, metadata-store.ts, ai-chat-panel.tsx) — tracked as P2 but deferred to a separate change
- SQLite migration extraction — deferred to a separate change
- Per-connection read-only mode toggle — the server-side `isQuerySafe` check is the primary gate; a client toggle can be added later

## Decisions

### 1. Server-side `isQuerySafe` enforcement (Option A from review)

Add `isQuerySafe` check in `sql.ts` `/query` endpoint before `adapter.runQuery()`. Return 400 with `{ error: 'UNSAFE', message: safety.reason }` — consistent with the AI path in `ai.ts:377`.

**Rationale**: Server-side enforcement is the strongest guarantee. Even if a future client bypasses the check, the sidecar blocks destructive SQL. The AI path already uses this pattern.

### 2. Client-side `isQuerySafe` as pre-flight warning

Add `isQuerySafe` check in `sql-editor.tsx` `executeQuery()` before sending to backend. If unsafe, show a confirmation dialog to the user. This provides immediate feedback without a round-trip.

**Rationale**: The server-side check is the hard gate. The client-side check improves UX by warning before the request. For destructive queries that the user intentionally wants to run (e.g., `DROP TABLE` in a dev environment), the dialog allows proceeding — but the server still blocks it.

**Alternative considered**: Hard-block on client side without dialog. Rejected because users may legitimately want to run DDL in development. The server-side check is the real enforcement point.

### 3. Empty catch block logging

Add `log.warn({ err }, '<context>')` to all 28 empty catch blocks. For critical paths (backup/restore, AI schema context), use `log.error` and propagate the error to the caller where feasible.

**Rationale**: Silent error swallowing makes debugging impossible. Logging is the minimum viable fix. Propagation is added only where the caller can meaningfully act on the error.

### 4. Parallelize N+1 queries with `Promise.all`

Replace sequential `for` loops with `Promise.all(collections.map(...))` in `mongo.ts` and `ai.ts`. Add `Promise.allSettled` wrapper to handle individual collection failures gracefully.

**Rationale**: 50 collections × 2 sequential queries = 100 roundtrips. Parallelizing reduces wall time from ~100×RTT to ~2×RTT. `allSettled` preserves the existing "skip failed collections" behavior.

### 5. SSE abort registration order

Swap the `if (aborted)` check and `addEventListener` call in `connections.ts` so the listener is registered before the check. This eliminates the theoretical race where `abort()` fires between check and registration.

### 6. `getProviderRequirements` exhaustiveness guard

Add `default` arm with `const _exhaustive: never = provider; throw new Error(...)`. This forces a compile-time error when a new provider is added to the union without updating the switch.

## Risks / Trade-offs

- **[Risk] `isQuerySafe` blocks legitimate DDL in dev** → Mitigation: The check only blocks destructive keywords. Users who need DDL can use the AI path (which also blocks) or a future "unsafe mode" toggle. For now, consistency is more important than convenience.
- **[Risk] `Promise.all` increases concurrent DB connections** → Mitigation: MongoDB and AI paths are already bounded (10 collections for AI, autocomplete cache for MongoDB). The connection pool handles the concurrency.
- **[Risk] Logging 28 catch blocks adds noise** → Mitigation: Use `log.warn` (not `log.error`) for non-critical paths. Critical paths use `log.error` with specific context strings for easy filtering.
