---
id: SEED-001
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: dashboard
---

# SEED-001: Wire up real TigerBeetle explorer (replace stub in workspace-content.tsx)

## Why This Matters

The TigerBeetle explorer tab currently renders a placeholder div instead of the real
explorer component. The sidecar already exposes a full TigerBeetle router (accounts,
balances, transfers) and a real `TigerBeetleExplorer` component already exists with
account/transfer/balance hooks — but `workspace-content.tsx` never wires it in. Users
opening a TigerBeetle connection see "TigerBeetle explorer" placeholder text instead of
their data. This is a low-effort, high-visibility gap.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the desktop dashboard or TigerBeetle support.

## Scope Estimate

**Unknown** — likely Small (wire-up + parity check against the Qdrant explorer pattern).
Run `/gsd-capture --seed --enrich SEED-001` to estimate effort.

## Breadcrumbs

- `apps/desktop/src/components/workspace-content.tsx:119-123` — stub returns placeholder `<div>` for `activeTab.type === 'tigerbeetle'`
- `apps/desktop/src/components/tigerbeetle-explorer.tsx` — real explorer component already implemented (accounts list, selected-account detail, transfers, balances)
- `apps/desktop/src/hooks/use-tigerbeetle.ts` — `useTbAccounts`, `useTbTransfers`, `useTbBalances` hooks already exist
- `apps/sidecar/src/routes/tigerbeetle.ts` — sidecar router with `/:connectionId/accounts`, `/:connectionId/accounts/:id`, balances, transfers
- Pattern to mirror: `apps/desktop/src/components/qdrant-explorer.tsx` + `qdrant-query.tsx` + `qdrant-stats.tsx`

## Notes

Captured via one-shot seed capture during gsd-progress routing. The component and
sidecar routes already exist — the gap is purely the wire-up in `workspace-content.tsx`
and possibly adding query/stats sub-panels to match the Qdrant explorer depth.
