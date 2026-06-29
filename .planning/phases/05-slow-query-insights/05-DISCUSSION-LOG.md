# Phase 5: Slow-Query Insights - Discussion Log

**Mode:** --auto (autonomous decisions)
**Date:** 2026-06-29

## Discussion

### Q: Client-side vs sidecar normalization?

**Decision:** Client-side. Query history entries already arrive client-side with raw SQL + `durationMs`. A sidecar normalization endpoint would add a round-trip and require persisting normalized patterns in the metadata store for no functional gain — the grouping is recomputed on each render from the fetched entries. Keep it in `apps/desktop/src/lib/query-normalize.ts`.

### Q: Full SQL parser vs heuristic regex normalizer?

**Decision:** Heuristic. A full parser (e.g. `node-sql-parser`) would be a heavy new dependency for a grouping key. The existing inline `normalizeQuery` already works with regexes; we extend it to cover decimals, booleans, `NULL`, hex, and `IN`-list collapse. Documented as a heuristic — two semantically identical queries with different casing/aliases will NOT merge, which is acceptable for a "find hotspots" feature.

### Q: How to surface the Slow queries view — new panel or tab?

**Decision:** Tab inside the existing `QueryHistoryPanel` using the shadcn `Tabs` primitive. A separate panel would duplicate the resize/search/header chrome. The tab keeps the panel's existing width/resize behavior and shares the search box.

### Q: p95 method?

**Decision:** Nearest-rank. Sort durations ascending, index `ceil(0.95 * n) - 1`. Simple, no interpolation, matches common APM tooling. Entries missing `durationMs` are excluded from the p95 set but counted in `count`.

### Q: AI pre-seed — reuse Phase 4 `pendingAiPrompt` or new mechanism?

**Decision:** Reuse `pendingAiPrompt`. It already carries `{ prompt, tableId? }` and `AIChatPanel` already consumes it. For slow queries `tableId` is omitted (not table-scoped); the sidecar uses full-schema DDL context. Two buttons per row: "Suggest index" and "Explain", with prompt templates in `lib/constants.ts` next to `AI_SCHEMA_ACTIONS`.

### Q: Top-N value?

**Decision:** `TOP_N_SLOW_QUERIES = 10` as a named constant. 10 rows fit the panel without scrolling for most viewports and is a common default for "top slow queries" views.

## Autonomous Decisions Confirmed

- D-01..D-09 in 05-CONTEXT.md are final. No blocking questions.
