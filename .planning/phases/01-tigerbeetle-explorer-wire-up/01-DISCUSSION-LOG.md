# Phase 1: TigerBeetle Explorer Wire-Up - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 1-TigerBeetle Explorer Wire-Up
**Areas discussed:** Query tab scope, Stats panel depth, Account search/filter

---

## Query Tab Scope

| Option        | Description                                                                   | Selected |
| ------------- | ----------------------------------------------------------------------------- | -------- |
| Explorer-only | Wire up existing TigerBeetleExplorer, no query tab                            | ✓        |
| Add query tab | Add a TigerBeetle Query tab type (like qdrant-search) for transfer submission |          |

**User's choice:** Claude decided (user said "make ur best choice")
**Notes:** Transfers are write operations — a transfer submission UI is a separate phase. The explorer already shows transfers read-only.

---

## Stats Panel Depth

| Option               | Description                                                                        | Selected |
| -------------------- | ---------------------------------------------------------------------------------- | -------- |
| Add TB stats panel   | Match qdrant-stats.tsx pattern: total accounts, total transfers, aggregate balance | ✓        |
| Inline balances only | Explorer's inline balances are sufficient                                          |          |

**User's choice:** Claude decided
**Notes:** TBEX-02 requires matching Qdrant explorer depth. Stats panel is the missing piece. Uses existing sidecar endpoints.

---

## Account Search/Filter

| Option               | Description                                   | Selected |
| -------------------- | --------------------------------------------- | -------- |
| Add search input     | Match Qdrant explorer's search/filter pattern | ✓        |
| Expand/collapse only | Current list is sufficient                    |          |

**User's choice:** Claude decided
**Notes:** TigerBeetle account IDs are 128-bit — users need filtering when there are many accounts. Same Input + Search icon pattern as Qdrant.

---

## Claude's Discretion

- Stats panel card layout (grid vs list)
- Error states for failed TigerBeetle connections
- Loading states
- Refresh button on stats panel

## Deferred Ideas

- Transfer submission UI (write operation — separate phase)
- TigerBeetle vector map (not applicable — no vector data)
