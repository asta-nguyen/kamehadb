# Phase 1: TigerBeetle Explorer Wire-Up - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase replaces the TigerBeetle placeholder stub in `workspace-content.tsx` with the real `TigerBeetleExplorer` component, and adds depth to match the Qdrant explorer pattern (stats panel + account search/filter). Read-only — no transfer submission UI.

Scope: desktop app only (`apps/desktop`). Sidecar routes already exist.

</domain>

<decisions>
## Implementation Decisions

### Query Tab Scope

- **D-01:** Explorer-only for this phase. The `TigerBeetleExplorer` component already exists (153 lines) with accounts list, account detail (expand/collapse), transfers, and balances. Wire it into `workspace-content.tsx` replacing the stub at lines 119-123.
- **D-02:** No "TigerBeetle Query" tab type (like `qdrant-search`) in this phase. TigerBeetle transfers are write operations — a transfer submission UI is a separate phase. The explorer already shows transfers read-only via `useTbTransfers`.
- **D-03:** The wire-up follows the exact Qdrant pattern: `if (activeTab.type === 'tigerbeetle') { return <TigerBeetleExplorer key={activeTab.id} connectionId={activeTab.connectionId} />; }`

### Stats Panel Depth

- **D-04:** Add a `TigerBeetleStatsPanel` component matching `qdrant-stats.tsx` (51 lines). Shows: total accounts, total transfers, aggregate balance by currency code.
- **D-05:** Stats data comes from existing sidecar endpoints (`GET /tigerbeetle/accounts` for count, `GET /tigerbeetle/transfers` for count). Aggregate balance is computed client-side from the accounts list (summing `balance` grouped by `ledger`).
- **D-06:** Add a `tigerbeetle-stats` tab type to `packages/shared` workspace tab types, and wire it into `workspace-content.tsx` with `Suspense` (matching the Qdrant stats lazy-load pattern).
- **D-07:** The stats panel uses shadcn `Card` + `Table` components (per AGENTS.md rule: always use shadcn, never raw HTML).

### Account Search/Filter

- **D-08:** Add a search/filter input to `TigerBeetleExplorer` matching the Qdrant explorer pattern (`qdrant-explorer.tsx` has `Input` + `Search` icon). Filter by account ID (128-bit hex string) or ledger number.
- **D-09:** Use the same `useMemo` filter pattern as Qdrant: filter `accounts` by `searchQuery.toLowerCase()` match against `account.id` stringified.
- **D-10:** The search input uses shadcn `Input` with `Search` icon from lucide-react, matching Qdrant's exact styling (`pl-6 pr-2 h-6 text-xs`).

### Claude's Discretion

- Exact layout of the stats panel cards (grid vs list) — follow existing Qdrant stats layout
- Error states for failed TigerBeetle connections — match existing error patterns
- Loading states — use existing `Spinner` component
- Whether to add a "refresh" button to the stats panel — the explorer already has one

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning

- `.planning/ROADMAP.md` §Phase 1 — Phase goal, requirements (TBEX-01, TBEX-02), success criteria, plans 01-01 and 01-02
- `.planning/REQUIREMENTS.md` — REQ-IDs TBEX-01, TBEX-02
- `.planning/PROJECT.md` — Core value, constraints (Tauri + sidecar, shadcn, KIND constants)

### Codebase Conventions

- `AGENTS.md` — shadcn component mapping rules, KIND constant usage, no magic strings, logger usage
- `.planning/codebase/ARCHITECTURE.md` — Desktop app component structure, workspace tab orchestration
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, code style, import organization

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/desktop/src/components/tigerbeetle-explorer.tsx` (153 lines) — Real explorer component with accounts list, AccountNode (expand/collapse), transfers, balances. Already imports `useTbAccounts`, `useTbTransfers`, `useTbBalances` hooks.
- `apps/desktop/src/hooks/use-tigerbeetle.ts` — TanStack Query hooks for accounts, transfers, balances. Already wired to sidecar.
- `apps/sidecar/src/routes/tigerbeetle.ts` — Sidecar routes: `GET /tigerbeetle/accounts`, `GET /tigerbeetle/accounts/:id/balances`, `GET /tigerbeetle/transfers`. Already implemented.
- `apps/desktop/src/components/qdrant-explorer.tsx` (77 lines) — Pattern to mirror: search filter, collection list, error/loading states.
- `apps/desktop/src/components/qdrant-stats.tsx` (51 lines) — Pattern to mirror for stats panel.
- `apps/desktop/src/components/workspace-content.tsx:119-123` — The stub to replace.
- `apps/desktop/src/components/workspace-content.tsx:70-93` — Qdrant wire-up pattern to follow (including `Suspense` for stats).
- `packages/shared/src/index.ts` — Workspace tab types. Needs `tigerbeetle-stats` tab type added.
- `@kamehadb/shared` `KIND.TIGERBEETLE` — Use this constant, never raw string `'tigerbeetle'`.

### Established Patterns

- Tab type dispatch in `workspace-content.tsx`: `if (activeTab.type === 'X') return <Component key={activeTab.id} connectionId={activeTab.connectionId} />`
- Lazy-loaded stats panels wrapped in `Suspense` (see Qdrant stats at line 87-93)
- shadcn components from `apps/desktop/src/components/ui/` — never raw HTML (AGENTS.md rule)
- TanStack Query hooks in `apps/desktop/src/hooks/` for data fetching
- `KIND` constants from `@kamehadb/shared` for all database kind comparisons

### Integration Points

- `workspace-content.tsx:119-123` — Replace stub with real `TigerBeetleExplorer` component
- `packages/shared/src/index.ts` — Add `tigerbeetle-stats` to `WorkspaceTab` union type
- `apps/desktop/src/components/tigerbeetle-explorer.tsx` — Add search/filter input (modify existing component)
- New file: `apps/desktop/src/components/tigerbeetle-stats.tsx` — Stats panel matching Qdrant pattern
- `apps/desktop/src/hooks/use-tigerbeetle.ts` — May need a `useTbStats` hook or reuse existing `useTbAccounts` for aggregate computation

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing Qdrant explorer pattern for consistency.

</specifics>

<deferred>
## Deferred Ideas

- **Transfer submission UI** — A "TigerBeetle Query" tab that creates transfers (write operation). This is a separate phase — TigerBeetle is a ledger and transfer creation has safety implications.
- **TigerBeetle vector map** — Qdrant has a 3D vector map; TigerBeetle has no vector data. Not applicable.

</deferred>

---

_Phase: 1-TigerBeetle Explorer Wire-Up_
_Context gathered: 2026-06-29_
