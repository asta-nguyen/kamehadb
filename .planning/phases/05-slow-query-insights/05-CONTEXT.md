# Phase 5: Slow-Query Insights - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds a "Slow queries" view to the query history panel that groups executed queries by normalized pattern, computes p95 duration per group, and lets the user pre-seed the AI chat from a slow query to request an index suggestion or an explanation.

Scope: desktop app (`apps/desktop`) only — query normalization, p95 aggregation, the Slow queries tab, and the AI pre-seed buttons all live client-side in `query-history-panel.tsx` and a new `lib/query-normalize.ts` helper. No sidecar or `packages/shared` contract changes are required: query history entries already carry `durationMs`, and the existing `pendingAiPrompt` store field (from Phase 4) delivers cross-component prompts to `AIChatPanel`.

Out of scope: server-side slow-query log ingestion (e.g. parsing `pg_stat_statements`), real-time query tracing, and per-connection slow-query thresholds stored in the metadata DB. Normalization is intentionally a lightweight, heuristic client-side transform — not a full SQL parser — because query history already holds the raw SQL text and durations.

</domain>

<system>
## Relevant Codebase

### Query history panel — `apps/desktop/src/components/query-history-panel.tsx`

- Already groups history entries by a `normalizeQuery(sql)` heuristic (line 10-18) and renders grouped rows sorted by recency.
- The existing `normalizeQuery` strips single-quoted strings, double-quoted strings, integers, and UUIDs, then collapses whitespace. It does NOT handle decimals, booleans, `NULL`, hex literals, or `IN (?, ?, ?)` list collapsing.
- `QueryHistoryEntry` (from `packages/shared/src/types.ts`) carries `durationMs?: number`, `rowCount?`, `executedAt`, `query`, `favorite`.
- The panel fetches up to 100 entries via `useQueryHistory(connectionId, 100)`.

### AI pre-seed pattern — Phase 4 (SEED-004)

- `apps/desktop/src/store/ui-preferences.ts` exposes `openAiChatPanel(connectionId)` and `setPendingAiPrompt({ prompt, tableId? })`.
- `AIChatPanel` watches `pendingAiPrompt` via `useStore`, calls `chat.sendMessage(prompt)`, then `clearPendingAiPrompt()`.
- `tableId` is optional — for slow queries there is no single table, so only `prompt` is used.

### UI primitives

- `apps/desktop/src/components/ui/tabs.tsx` exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (base-ui). Used in `table-view.tsx`.
- shadcn `Button`, `Input`, `Spinner`, `Badge` available.
- `cnfast` `cn` helper for classnames.

### Tests

- `apps/desktop` uses `vitest run`. Existing test: `src/lib/utils.test.ts`. New unit tests for normalization + p95 go in `src/lib/query-normalize.test.ts`.

</system>

<decisions>
## Implementation Decisions

### Query Normalization (05-01)

- **D-01:** Normalization stays client-side in a new `apps/desktop/src/lib/query-normalize.ts` module, extracted from the inline `normalizeQuery` in `query-history-panel.tsx`. Rationale: query history already holds raw SQL client-side; a sidecar round-trip per group key would add latency for no benefit. The metadata store does not need to persist normalized patterns.
- **D-02:** The enhanced normalizer handles, in order: single-quoted strings, double-quoted identifiers, decimal numbers (e.g. `3.14`), integers, booleans (`true`/`false`), `NULL`, hex literals (`0x1A`), and collapses consecutive `?` placeholders produced by `IN (...)` lists into a single `IN (?)` so `IN (1,2,3)` and `IN (4,5)` share a pattern. Whitespace is collapsed and trimmed. This is a heuristic, not a parser — documented as such.
- **D-03:** Unit tests in `query-normalize.test.ts` cover each literal class, the `IN`-list collapse, whitespace normalization, and idempotency. AGENTS.md rule 4 (verifiable goals) is satisfied by `pnpm --filter @kamehadb/desktop test`.

### p95 Aggregation + Slow Queries View (05-02)

- **D-04:** p95 is computed client-side from the `durationMs` values of each normalized-pattern group. The helper `computeP95(durations: number[])` sorts ascending and picks the value at the `ceil(0.95 * n) - 1` index (nearest-rank method). Entries without `durationMs` are excluded from p95 but still counted in the group's `count`.
- **D-05:** The query history panel gains a two-tab layout via the existing `Tabs` primitive: "History" (the current recency-sorted grouped list) and "Slow queries" (top-N by p95, descending). The search/favorites controls remain shared above the tabs. `TOP_N_SLOW_QUERIES = 10` is a named constant (AGENTS.md rule 6 — no magic numbers).
- **D-06:** Each slow-query row shows: the normalized pattern (truncated), p95 ms, call count, and the most recent raw query preview. Clicking the row loads the raw query into the editor (reuses `onSelectQuery`).

### AI Pre-Seed from Slow Query (05-03)

- **D-07:** Each slow-query row has two action buttons: "Suggest index" (`KeyRound` icon) and "Explain" (`Sparkles` icon). Both reuse the Phase 4 `setPendingAiPrompt` + `openAiChatPanel` flow. No new store fields, no new sidecar routes.
- **D-08:** The pre-seeded prompt includes the normalized pattern, the most recent raw query sample, the p95 duration, and the call count, so the AI has concrete grounding. The prompt templates live in `apps/desktop/src/lib/constants.ts` next to the existing `AI_SCHEMA_ACTIONS` (consistent location, no magic strings).
- **D-09:** `tableId` is NOT set on the pending prompt (slow queries are not table-scoped). The sidecar falls back to full-schema DDL context, which is the correct behavior for a query that may span multiple tables.

</decisions>

<constraints>
## Constraints

- AGENTS.md rule 5: use shadcn `Tabs`/`Button`/`Input` — no raw HTML equivalents.
- AGENTS.md rule 6: no magic numbers — `TOP_N_SLOW_QUERIES` and the p95 percentile (`0.95`) are named constants.
- AGENTS.md rule 7: comment non-trivial logic (normalizer, p95 helper, IN-list collapse).
- Surgical changes: only `query-history-panel.tsx`, new `lib/query-normalize.ts`(+test), and `lib/constants.ts` are touched. No sidecar, no shared types.
- `pnpm -r typecheck` must pass after each wave.

</constraints>
