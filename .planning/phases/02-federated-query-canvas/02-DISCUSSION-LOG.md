# Phase 2: Federated Query Canvas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 2-Federated Query Canvas
**Mode:** `--auto` (autonomous — user delegated all decisions: "make ur best choice")
**Areas discussed:** Aggregation Location, Read-Only Safety Layer, Connection Picker Scope, Result Merge Semantics, Tab Type & Entry Point, Editor Reuse

---

## Aggregation Location

|| Option | Description | Selected |
||--------|-------------|----------|
|| Client-side merge | Desktop fires N parallel `POST /sql/:connectionId/query` requests and merges `QueryResult[]` in the frontend. No new sidecar route. | ✓ |
|| Sidecar federated endpoint | New `POST /sql/federated/query` route that takes multiple connectionIds + a query, runs against each via the adapter factory, merges server-side. | |

**Auto-selected:** Client-side merge (recommended default)
**Notes:** The sidecar's adapter factory is per-connection and cached. A server-side federated endpoint would still loop over connections internally — no efficiency gain. Client-side keeps the sidecar unchanged, reuses the existing query route + `QueryResult` type, and aligns with AGENTS.md §2 (minimum viable code, no over-abstraction).

---

## Read-Only Safety Layer

|| Option | Description | Selected |
||--------|-------------|----------|
|| Client-side only | Federated canvas calls `isQuerySafe()` from `@kamehadb/shared` before dispatching. Existing `/sql/:connectionId/query` route unchanged. | ✓ |
|| Sidecar-only | New federated endpoint validates with `isQuerySafe()` server-side. | |
|| Both (defense in depth) | Check at both layers. | |

**Auto-selected:** Client-side at the federated dispatch point (with defense-in-depth noted)
**Notes:** The existing `POST /sql/:connectionId/query` route does NOT enforce read-only (runs any query). This phase does NOT modify that route — the safety gate lives in the federated canvas, keeping the change surgical. `isQuerySafe()` is a keyword-prefix check (`DESTRUCTIVE_KEYWORDS` regex + `SAFE_KEYWORDS` prefix) — sufficient for v1. A parser-based check is deferred.

---

## Connection Picker Scope

|| Option | Description | Selected |
||--------|-------------|----------|
|| SQL-kind only | Filter connections by `isSqlKind(kind)` — postgres, mysql, sqlite, sqlserver, oracle, clickhouse, mariadb, duckdb. Non-SQL engines excluded. | ✓ |
|| All 12 engines | Allow any connection kind. | |
|| SQL + TigerBeetle | SQL engines plus TigerBeetle (which has a query-like API). | |

**Auto-selected:** SQL-kind only
**Notes:** Non-SQL engines (Redis, MongoDB, Qdrant, TigerBeetle) have incompatible query languages — a shared SQL statement cannot run against them. Federation is a SQL concept (UNION). Restricting to `SQL_KINDS` matches the "union read-only results" language and avoids a broken UX. The picker uses `useConnections()` filtered by `isSqlKind`, with toggle buttons + selected `Badge`s (no new shadcn component needed).

---

## Result Merge Semantics

|| Option | Description | Selected |
||--------|-------------|----------|
|| UNION ALL by column name | Concatenate rows; column set is the union of all columns (ordered by first appearance); missing columns filled with `null`. | ✓ |
|| Side-by-side grids | Each connection's results in a separate sub-grid. | |
|| Union by column position | Align columns by ordinal position, ignore names. | |

**Auto-selected:** UNION ALL by column name
**Notes:** Matches the success criterion "unions results from multiple connections into one grid." Side-by-side would be "multiple grids," not "a single grid." Column-position alignment is fragile across engines with different default column naming. Merged `rowCount` = sum of all; `durationMs` = max (wall-clock); `truncated` = true if any connection truncated. Per-connection errors do not abort the federation — failed connections are omitted with an error notice, remaining results still merge.

---

## Tab Type & Entry Point

|| Option | Description | Selected |
||--------|-------------|----------|
|| New `federated-query` tab type, connection-agnostic button in tab bar | Add variant to `WorkspaceTab` union holding `connectionIds: readonly string[]`. Always-visible button in `workspace-tab-bar.tsx`. | ✓ |
|| Reuse `query` tab type with multi-connection mode | Overload the existing query tab with an optional `connectionIds` field. | |
|| Dialog-on-create | Open a dialog to pick connections when creating the tab. | |

**Auto-selected:** New `federated-query` tab type + connection-agnostic tab bar button
**Notes:** The existing `query` tab is single-`connectionId` and deeply wired (sidebar dropdown, tab bar `+` button, `SqlEditor`). Overloading it risks collateral damage (AGENTS.md §3). A dedicated variant with `connectionIds` (plural) is cleaner. The entry button must be connection-agnostic since federated tabs don't belong to one connection — placed in the tab bar's trailing action area, always visible. Also add `openFederatedQueryTab()` to `workspace-tabs.ts` following the `openNewQueryTab` pattern.

---

## Editor Reuse

|| Option | Description | Selected |
||--------|-------------|----------|
|| New `FederatedQueryCanvas` component | Reuses Monaco `Editor` lazy import + `DataTable`, but purpose-built. Not a wrapper around `SqlEditor`. | ✓ |
|| Wrap `SqlEditor` | Reuse the existing 1080-line component with conditional multi-connection props. | |

**Auto-selected:** New `FederatedQueryCanvas` component
**Notes:** `SqlEditor` (1080 lines, flagged as a large-file concern in CONCERNS.md) is tightly coupled to a single `connectionId` — it uses `useRunQuery(connectionId)`, per-connection pagination, cell editing, and per-connection history save. Wrapping it would require invasive prop drilling and conditional branches, violating AGENTS.md §2 (no over-abstraction) and §3 (surgical changes). A new component reusing Monaco + `DataTable` + `isQuerySafe` is cleaner and minimal. Layout: connection picker panel (top) + Monaco editor with Run button (middle) + merged `DataTable` (bottom), using the existing split-panel `splitRatio` pattern.

---

## Claude's Discretion

All gray areas were auto-resolved in `--auto` mode (user delegated: "make ur best choice"). Claude has flexibility on: exact picker panel layout, "select all" convenience button, error notice styling, loading state during parallel dispatch, and whether to surface federated query in the global shortcuts dialog.

## Deferred Ideas

- Parser-based read-only enforcement (heavy dependency for v1)
- Federated query history (per-connection store doesn't fit)
- Per-connection pagination in federated results
- Non-SQL engine federation (incompatible query languages)
- Side-by-side result view (alternate UX, could be a view toggle later)
- Federated query autocomplete (complex cross-connection schema suggestion)
