# 02-02 Summary: Client-Side UNION ALL Merge Utility

## Status: COMPLETE

## What was done

Created `apps/desktop/src/lib/federated-merge.ts` — a pure utility module with no React dependencies:

- `PerConnectionResult` type: per-connection outcome with `connectionId`, `connectionName`, `result` (null on failure), `error`
- `MergedFederatedResult` type: merged `QueryResult` (or null if all failed) + `perConnection` breakdown
- `mergeQueryResults()` function implementing UNION ALL by column name semantics:
  - Columns unioned by first appearance order (D-09)
  - Missing columns filled with `null` via `name in row ? row[name] : null`
  - `rowCount` summed, `durationMs` = max, `truncated` = any (D-10)
  - Failed connections omitted from rows but retained in `perConnection` (D-11)
  - Returns `result: null` when all connections failed

## Verification

- `pnpm --filter @kamehadb/desktop exec tsc --noEmit` — passes with zero errors
- No React imports in the module (pure utility)
