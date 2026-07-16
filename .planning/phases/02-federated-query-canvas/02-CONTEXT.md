# Phase 2: Federated Query Canvas - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds a "Federated Query" tab type that runs a single read-only SQL query against multiple selected SQL connections and unions the results into one grid. The federation is read-only by design — any write operation is rejected before dispatch.

Scope: desktop app (`apps/desktop`) for the canvas UI + tab orchestration, and `packages/shared` for the new tab type. The sidecar requires NO new routes — the existing `POST /sql/:connectionId/query` endpoint is reused per selected connection, with client-side result merging.

Out of scope: non-SQL engine federation (Redis/Mongo/Qdrant/TigerBeetle have incompatible query languages), cross-engine writes (explicitly out of scope per PROJECT.md), federated query history persistence, and per-connection pagination of federated results.

</domain>

<decisions>
## Implementation Decisions

### Aggregation Location

- **D-01:** Client-side aggregation. The desktop fires N parallel `POST /sql/:connectionId/query` requests (one per selected connection) via the existing `useRunQuery` hook pattern, then merges the `QueryResult[]` into a single `QueryResult` in the frontend. No new sidecar route is added.
- **D-02:** Rationale: The sidecar's adapter factory is per-connection and cached (`adapterCache` in `sql.ts`). A server-side federated endpoint would still loop over connections internally — no efficiency gain. Client-side keeps the sidecar unchanged, reuses the existing query route + `QueryResult` type, and aligns with "minimum viable code" (AGENTS.md §2). The merge is simple row concatenation done in the same layer that holds the selected-connection state.

### Read-Only Safety Layer

- **D-03:** Defense-in-depth, but the primary enforcement is client-side at the federated dispatch point. The federated canvas calls `isQuerySafe()` from `@kamehadb/shared` (already exported from `packages/shared/src/types.ts`) on the entered SQL before dispatching any query. If `safe === false`, the canvas shows the `reason` and dispatches nothing.
- **D-04:** The existing `POST /sql/:connectionId/query` route does NOT currently enforce read-only (it runs any query). This phase does NOT modify that route — the safety gate lives in the federated canvas. This keeps the change surgical and avoids altering the single-connection query tab behavior.
- **D-05:** The `isQuerySafe()` helper is a keyword-prefix check (`DESTRUCTIVE_KEYWORDS` regex + `SAFE_KEYWORDS` prefix). It is good enough for v1. A parser-based check is a deferred idea (see Deferred Ideas).

### Connection Picker Scope

- **D-06:** Only SQL-kind connections are eligible for federation. Use `isSqlKind(kind)` from `@kamehadb/shared` (checks against `SQL_KINDS`: postgres, mysql, sqlite, sqlserver, oracle, clickhouse, mariadb, duckdb). Non-SQL engines (Redis, MongoDB, Qdrant, TigerBeetle) are excluded — their query languages are incompatible with a shared SQL statement.
- **D-07:** The connection picker uses `useConnections()` (existing hook returning `ConnectionProfile[]`), filtered by `isSqlKind`. The user selects connections via toggle buttons in a picker panel within the federated tab. Selected connections show a shadcn `Badge` with the connection name and engine kind. No new shadcn component is needed — use existing `Button` (toggle variant) + `Badge` + `DbIcon`.
- **D-08:** At least one connection must be selected before the query can run. The Run button is disabled when the selected set is empty.

### Result Merge Semantics

- **D-09:** UNION ALL by column name. The merged `QueryResult` has a column set that is the union of all columns across all connection results (ordered by first appearance). Rows from each connection are concatenated; cells for columns not present in that connection's result are `null`. This matches the success criterion "unions results from multiple connections into one grid."
- **D-10:** The merged `rowCount` is the sum of all per-connection `rowCount` values. `durationMs` is the wall-clock time of the slowest request (max of all per-connection durations). `truncated` is `true` if any connection's result was truncated.
- **D-11:** Per-connection errors do not abort the whole federation. If a connection fails, its rows are omitted, an error `Badge`/notice is shown for that connection, and the remaining connections' results still merge. This is the most useful behavior for federated exploration.

### Tab Type & Entry Point

- **D-12:** Add a `federated-query` variant to the `WorkspaceTab` discriminated union in `apps/desktop/src/lib/types.ts`. The variant holds: `id`, `type: 'federated-query'`, `title`, `connectionIds: readonly string[]` (the selected connection IDs — plural, not a single `connectionId`), and `sql?: string`. This is connection-independent — it does NOT set `activeConnectionId` when activated (the tab bar's connection-status dot logic should handle a null `connectionId` gracefully for this tab type).
- **D-13:** Add `openFederatedQueryTab()` to `apps/desktop/src/store/workspace-tabs.ts`, following the existing `openNewQueryTab` pattern (nanoid ID, title "Federated Query N"). The tab opens with an empty `connectionIds` array — the user picks connections inside the tab.
- **D-14:** Entry point: a dedicated button in `workspace-tab-bar.tsx` (a `Share2` or `Network` lucide icon) that is always visible (not gated on `activeConnectionId`), placed in the tab bar's trailing action area. This mirrors how the existing `Plus` button opens a single-connection query tab, but is connection-agnostic. Also add a "Federated Query" entry to the global command palette / shortcuts dialog if one exists (check `App.tsx` shortcuts dialog).
- **D-15:** Wire the new tab type into `workspace-content.tsx` with a dedicated `FederatedQueryCanvas` component: `if (activeTab.type === 'federated-query') { return <FederatedQueryCanvas key={activeTab.id} tab={activeTab} />; }`. Lazy-load it with `Suspense` (matching the Qdrant/TigerBeetle stats pattern) since it pulls in Monaco.

### Editor Reuse

- **D-16:** New `FederatedQueryCanvas` component (in `apps/desktop/src/components/federated-query-canvas.tsx`). It reuses the Monaco `Editor` lazy import (`@monaco-editor/react`) and the `DataTable` component, but is purpose-built — it is NOT a wrapper around `SqlEditor`. The existing `SqlEditor` (1080 lines) is tightly coupled to a single `connectionId` (uses `useRunQuery(connectionId)`, per-connection pagination, cell editing, per-connection history save). Wrapping it would require invasive prop drilling and conditional branches.
- **D-17:** The canvas layout: top = connection picker panel (toggle buttons + selected badges), middle = Monaco editor + Run button, bottom = merged `DataTable` result grid. Use the existing split-panel pattern from `SqlEditor` (the `splitRatio` state + drag handle) for editor/result split.
- **D-18:** The Run action: on click, call `isQuerySafe(sql)`. If unsafe, show the reason inline (shadcn `Badge` variant "destructive" or a notice block) and abort. If safe, dispatch parallel `api.request<QueryResult>('POST', '/sql/${id}/query', { query: sql })` calls for each selected connection ID via a single `useMutation`-style handler (or `Promise.allSettled` over the existing api client). Merge per D-09/D-10/D-11.

### Claude's Discretion

- Exact layout of the connection picker panel (horizontal toggle row vs vertical list) — follow whichever fits the tab header area cleanly
- Whether to add a "select all SQL connections" convenience button — nice-to-have, not required by FED-03
- Error notice styling for failed connections — match existing error patterns (shadcn `Badge` / toast)
- Loading state during parallel dispatch — use existing `Spinner` component, show per-connection status if feasible
- Whether to surface federated query in the global shortcuts dialog — check `App.tsx` and add if the dialog exists

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning

- `.planning/ROADMAP.md` §Phase 2 — Phase goal, requirements (FED-01, FED-02, FED-03), success criteria, plans 02-01/02-02/02-03
- `.planning/REQUIREMENTS.md` — REQ-IDs FED-01, FED-02, FED-03 (lines 17-19)
- `.planning/PROJECT.md` — Core value, constraints (§Engine safety: "Federated/multi-engine features must be strictly read-only where cross-engine"; §Out of Scope: "Cross-engine writes in federated query — safety risk; federation is read-only by design")

### Codebase Conventions

- `AGENTS.md` — shadcn component mapping rules, KIND constant usage (`isSqlKind`, `SQL_KINDS`), no magic strings, simplicity-first, surgical changes
- `.planning/codebase/ARCHITECTURE.md` — Workspace tab orchestration (§Desktop Frontend), query execution flow (§Data Flow), `WorkspaceTab` discriminated union
- `.planning/codebase/CONVENTIONS.md` — File naming (kebab-case), export conventions (PascalCase components, `use*` hooks), shadcn UI rules, state management (TanStack Store + Query)
- `.planning/codebase/CONCERNS.md` — Zero test coverage (not blocking v1.0), `sql-editor.tsx` is 38KB (do not bloat further — new component is correct call)

### Shared Contract

- `packages/shared/src/types.ts` §lines 1-14 — `QueryResult` type (`columns`, `rows`, `rowCount`, `durationMs`, `truncated`) — the merge target shape
- `packages/shared/src/types.ts` §lines 587-623 — `DESTRUCTIVE_KEYWORDS`, `SAFE_KEYWORDS`, `isQuerySafe()` helper — the read-only safety gate to reuse
- `packages/shared/src/schemas.ts` §lines 4-63 — `KIND`, `SQL_KINDS`, `isSqlKind()` — connection eligibility filter

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/desktop/src/lib/types.ts` — `WorkspaceTab` discriminated union. Add the `federated-query` variant here (line 1-126). This is a desktop-local type (NOT in `packages/shared` — the shared package has no `WorkspaceTab`).
- `apps/desktop/src/store/workspace-tabs.ts` — `openTab()` + per-type open helpers (e.g. `openNewQueryTab` at line 25). Add `openFederatedQueryTab()` following the same pattern.
- `apps/desktop/src/components/workspace-content.tsx` — Tab type dispatch (lines 34-137). Add the `federated-query` branch; lazy-load the new component with `Suspense` (see Qdrant stats pattern at lines 91-96).
- `apps/desktop/src/components/workspace-tab-bar.tsx` — Tab bar with trailing action buttons (lines 136-190). Add a connection-agnostic "Federated Query" button. Also add `federated-query` to `tabIcon()` (line 18-44).
- `apps/desktop/src/hooks/use-connections.ts` — `useConnections()` hook (line 15) returns `ConnectionProfile[]`. Reuse for the connection picker.
- `apps/desktop/src/hooks/use-query.ts` — `useRunQuery(connectionId)` mutation (line 15). The federated canvas dispatches one mutation per selected connection, OR calls `api.request` directly via `Promise.allSettled`.
- `apps/desktop/src/lib/api.ts` — `api.request<QueryResult>('POST', '/sql/${connectionId}/query', { query })` is the underlying call (used by `useRunQuery`).
- `apps/desktop/src/components/data-table.tsx` — `DataTable` component with `ColumnDef<T>` (line 9-17). Reuse for the merged result grid.
- `apps/desktop/src/components/sql-editor.tsx` — Reference for Monaco `Editor` lazy import (line 16: `lazy(() => import('@monaco-editor/react'))`) and the split-panel `splitRatio` pattern. Do NOT wrap this component.
- `packages/shared/src/types.ts` — `isQuerySafe()` (line 603) + `QueryResult` (line 8). Import both in the new canvas.
- `packages/shared/src/schemas.ts` — `isSqlKind()` (line 57), `SQL_KINDS` (line 44). Use for connection filtering.
- `apps/desktop/src/components/ui/badge.tsx`, `button.tsx`, `db-icon.tsx` — shadcn primitives for the connection picker toggles + selected badges.

### Established Patterns

- Tab type dispatch in `workspace-content.tsx`: `if (activeTab.type === 'X') return <Component key={activeTab.id} ... />`
- Lazy-loaded heavy components wrapped in `Suspense` (Qdrant stats at line 91-96, TigerBeetle stats at line 126-132)
- shadcn components from `apps/desktop/src/components/ui/` — never raw HTML (AGENTS.md rule)
- TanStack Query hooks in `apps/desktop/src/hooks/` for data fetching; `useStore(appStore, selector)` for app state
- `KIND` / `isSqlKind` constants from `@kamehadb/shared` for all database kind comparisons — never raw string literals
- Tab open helpers in `workspace-tabs.ts` use `nanoid()` for IDs and `openTab()` for state mutation
- `SQL_TAB_ACTIONS` / `ENGINE_TAB_ACTIONS` in `apps/desktop/src/lib/constants.ts` drive the sidebar dropdown menu actions per connection kind

### Integration Points

- `apps/desktop/src/lib/types.ts` — Add `federated-query` to `WorkspaceTab` union (new variant with `connectionIds: readonly string[]`)
- `apps/desktop/src/store/workspace-tabs.ts` — Add `openFederatedQueryTab()` + `updateTabFederatedConnections()` + `updateTabFederatedSql()` helpers
- `apps/desktop/src/components/workspace-content.tsx` — Add dispatch branch + lazy import for `FederatedQueryCanvas`
- `apps/desktop/src/components/workspace-tab-bar.tsx` — Add always-visible "Federated Query" button + `tabIcon` entry
- New file: `apps/desktop/src/components/federated-query-canvas.tsx` — The canvas component (Monaco editor + connection picker + merged DataTable)
- `apps/desktop/src/lib/constants.ts` — Optionally add a federated entry to `SQL_TAB_ACTIONS` or a new global action list (if the tab bar button needs a constant)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing query-tab and DataTable patterns for consistency. The federation is a SQL UNION ALL across same-shape result sets from different SQL engines.

</specifics>

<deferred>
## Deferred Ideas

- **Parser-based read-only enforcement** — `isQuerySafe()` is a keyword-prefix regex check. A true SQL parser (e.g. `pg-query-parser`) would catch obfuscated writes (e.g. `/* comment */ DROP`). Deferred — the keyword check is sufficient for v1 and a parser adds a heavy dependency.
- **Federated query history** — Saving federated queries to the per-connection `query-history` store doesn't fit (history is keyed by single `connectionId`). A separate federated history store is a future concern.
- **Per-connection pagination in federated results** — The merged grid is a single flat result set. Pagination/LIMIT per connection is a future enhancement.
- **Non-SQL engine federation** — Redis/Mongo/Qdrant/TigerBeetle have incompatible query languages. A cross-paradigm federation (e.g. SQL + Mongo aggregation) is a separate, larger phase.
- **Side-by-side result view** — Showing each connection's results in a separate sub-grid (instead of UNION ALL merge) is an alternate UX that could be added as a view toggle later.
- **Federated query autocomplete** — Schema-aware autocomplete across multiple connections is complex (which connection's schema to suggest from?). Deferred.

</deferred>

---

_Phase: 2-Federated Query Canvas_
_Context gathered: 2026-06-29_
