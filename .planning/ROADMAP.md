# Roadmap: KamehaDB

## Overview

Milestone v1.0 (Dashboard & Landing Polish) closes high-visibility dashboard gaps and elevates the landing site with interactive demos. The 8 planted seeds (SEED-001 through SEED-008) route into 6 phases: the first five address dashboard features (TigerBeetle wire-up, federated query, schema timeline auto-snapshots, AI chat actions, slow-query insights), and the final phase consolidates the three landing-site seeds into one cohesive landing polish phase.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: TigerBeetle Explorer Wire-Up** - Replace placeholder with real explorer component
- [ ] **Phase 2: Federated Query Canvas** - Read-only cross-engine result federation
- [ ] **Phase 3: Schema Timeline Auto-Snapshots** - Opt-in watcher and pg_notify snapshots
- [x] **Phase 4: AI Chat Schema-Tree Actions** - Right-click menu one-click AI actions
- [x] **Phase 5: Slow-Query Insights** - p95 by normalized pattern with AI pre-seed
- [x] **Phase 6: Landing Polish** - Engine matrix, screenshot CI, schema-graph demo

## Phase Details

### Phase 1: TigerBeetle Explorer Wire-Up

**Goal**: Users opening a TigerBeetle connection see their accounts, transfers, and balances instead of a placeholder
**Depends on**: Nothing (first phase)
**Requirements**: TBEX-01, TBEX-02
**Success Criteria** (what must be TRUE):

1. User opening a TigerBeetle connection sees the real TigerBeetleExplorer component (accounts list, selected-account detail, transfers, balances) in the workspace tab
2. TigerBeetle explorer depth matches the Qdrant explorer pattern (query and stats sub-panels where applicable)
3. No placeholder text remains for the TigerBeetle tab type in workspace-content.tsx

Plans:

- [x] 01-01: Wire TigerBeetleExplorer into workspace-content.tsx (replace stub at line 119-123)
- [x] 01-02: Add query/stats sub-panels to match Qdrant explorer depth

### Phase 2: Federated Query Canvas

**Goal**: Users can union read-only results from multiple connections into a single grid
**Depends on**: Phase 1
**Requirements**: FED-01, FED-02, FED-03
**Success Criteria** (what must be TRUE):

1. User can open a "Federated Query" tab type that unions results from multiple selected connections
2. Federated query rejects any write operation (read-only safety enforced)
3. User can select which connections contribute to the federated result set

Plans:

- [ ] 02-01: Define federated tab type in desktop WorkspaceTab union and wire into workspace tab orchestration
- [ ] 02-02: Implement client-side UNION ALL result merge utility (mergeQueryResults)
- [ ] 02-03: Implement full FederatedQueryCanvas (connection picker + Monaco editor + safety gate + parallel dispatch + merged DataTable)

### Phase 3: Schema Timeline Auto-Snapshots

**Goal**: Users can opt into automatic schema snapshots on a cadence or via pg_notify
**Depends on**: Phase 2
**Requirements**: SCHTL-01, SCHTL-02, SCHTL-03
**Success Criteria** (what must be TRUE):

1. User can enable an opt-in watcher that snapshots schema on a configurable cadence
2. User can enable PostgreSQL pg_notify-triggered snapshots that fire on schema change events
3. Auto-captured snapshots appear in the existing schema timeline and diff views
   **Plans**: TBD

Plans:

- [ ] 03-01: Implement cadence-based watcher lifecycle with persisted config in metadata store
- [ ] 03-02: Wire pg_notify listener for PostgreSQL schema-change events
- [ ] 03-03: Integrate auto-snapshots into existing timeline and diff views

### Phase 4: AI Chat Schema-Tree Actions

**Goal**: Users can trigger AI assistance scoped to a specific table via right-click
**Depends on**: Phase 3
**Requirements**: AICHAT-01, AICHAT-02, AICHAT-03
**Success Criteria** (what must be TRUE):

1. User can right-click a table in the schema tree and choose "Explain this schema" to pre-seed AI chat with scoped context
2. User can right-click a table and choose "Generate test data" to trigger AI test-data generation scoped to that table
3. User can right-click a table and choose "Suggest index" to trigger an AI index recommendation scoped to that table
   **Plans**: TBD

Plans:

- [x] 04-01: Add right-click context menu to schema tree with three AI actions
- [x] 04-02: Implement prompt templates reusing existing schema-context generation in apps/sidecar/src/ai/

### Phase 5: Slow-Query Insights

**Goal**: Users can identify performance hotspots via p95 slow-query grouping and AI remediation
**Depends on**: Phase 4
**Requirements**: SLOWQ-01, SLOWQ-02, SLOWQ-03
**Success Criteria** (what must be TRUE):

1. User can open a "Slow queries" view in the query history panel showing top-N queries by p95 duration
2. Slow queries are grouped by normalized pattern, not raw SQL text
3. User can pre-seed the AI chat from a slow query to request an index suggestion or explanation
   **Plans**: TBD

Plans:

- [x] 05-01: Implement query normalization logic (client-side or sidecar metadata store)
- [x] 05-02: Add p95 aggregation and "Slow queries" view to query-history-panel.tsx
- [x] 05-03: Wire AI pre-seed from slow query (reuse SEED-004 pattern)

### Phase 6: Landing Polish

**Goal**: Landing site showcases engine breadth and schema intelligence with interactive demos and automated screenshot freshness
**Depends on**: Phase 5
**Requirements**: LMAT-01, LMAT-02, LMAT-03, LCI-01, LCI-02, LGRAPH-01, LGRAPH-02
**Success Criteria** (what must be TRUE):

1. Landing visitor sees an interactive engine matrix with status badges (SQL/document/cache/vector/ledger) per engine
2. Each engine card shows a supported-features matrix in sync with the app's canonical engine list and offers a one-click "Try in Docker" snippet
3. A CI workflow runs the AI Compare screenshot capture script on every release tag and commits updated images
4. Landing visitor sees an interactive read-only sample ER diagram (ReactFlow + dagre) that loads instantly from bundled static data
   **Plans**: TBD

Plans:

- [x] 06-01: Build interactive engine matrix section (status badges, feature matrix, Docker snippets)
- [x] 06-02: Add screenshot refresh CI workflow keyed off release tags
- [x] 06-03: Embed read-only schema-graph demo with bundled static sample schema

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase                             | Plans Complete | Status      | Completed  |
| --------------------------------- | -------------- | ----------- | ---------- |
| 1. TigerBeetle Explorer Wire-Up   | 2/2            | Verified    | 2026-06-29 |
| 2. Federated Query Canvas         | 0/3            | Planned     | -          |
| 3. Schema Timeline Auto-Snapshots | 0/3            | Not started | -          |
| 4. AI Chat Schema-Tree Actions    | 2/2            | Verified    | 2026-06-29 |
| 5. Slow-Query Insights            | 3/3            | Verified    | 2026-06-29 |
| 6. Landing Polish                 | 3/3            | Verified    | 2026-06-29 |
