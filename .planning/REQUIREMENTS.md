# Requirements: KamehaDB

**Defined:** 2026-06-29
**Core Value:** Developers can browse, query, and understand any local database from a single desktop app without touching the command line.

## v1 Requirements

Requirements for milestone v1.0 (Dashboard & Landing Polish). Each maps to roadmap phases.

### TigerBeetle Explorer

- [ ] **TBEX-01**: User opening a TigerBeetle connection sees the real explorer (accounts list, account detail, transfers, balances) instead of a placeholder
- [ ] **TBEX-02**: TigerBeetle explorer matches the Qdrant explorer depth (query and stats sub-panels where applicable)

### Federated Query

- [ ] **FED-01**: User can open a read-only "Federated Query" tab that unions results from multiple connections into one grid
- [ ] **FED-02**: Federated query enforces read-only safety (no cross-engine writes)
- [ ] **FED-03**: User can select which connections contribute results to the federated canvas

### Schema Timeline

- [ ] **SCHTL-01**: User can enable an opt-in watcher that snapshots schema on a configurable cadence (e.g. hourly)
- [ ] **SCHTL-02**: User can enable PostgreSQL pg_notify-triggered snapshots that capture schema changes automatically
- [ ] **SCHTL-03**: Auto-snapshots appear in the existing schema timeline and diff views

### AI Chat Actions

- [ ] **AICHAT-01**: User can right-click a table in the schema tree and choose "Explain this schema" to pre-seed the AI chat with scoped context
- [ ] **AICHAT-02**: User can right-click a table and choose "Generate test data" to trigger AI-generated test data scoped to that table
- [ ] **AICHAT-03**: User can right-click a table and choose "Suggest index" to trigger an AI index recommendation scoped to that table

### Slow-Query Insights

- [ ] **SLOWQ-01**: User can open a "Slow queries" view in the query history panel showing top-N queries by p95 duration
- [ ] **SLOWQ-02**: Slow queries are grouped by normalized pattern (not raw SQL text)
- [ ] **SLOWQ-03**: User can pre-seed the AI chat from a slow query to request an index suggestion or explanation

### Landing Engine Matrix

- [ ] **LMAT-01**: Landing site visitor sees an interactive engine matrix with status badges (SQL/document/cache/vector/ledger) per engine
- [ ] **LMAT-02**: Each engine card shows a supported-features matrix kept in sync with the app's canonical engine list
- [ ] **LMAT-03**: Each engine card offers a one-click "Try in Docker" snippet

### Landing Screenshot CI

- [ ] **LCI-01**: A CI workflow runs the AI Compare screenshot capture script on every release tag
- [ ] **LCI-02**: Updated screenshots are committed automatically by the CI workflow

### Landing Schema-Graph Demo

- [ ] **LGRAPH-01**: Landing site visitor sees an interactive read-only sample ER diagram using the same ReactFlow + dagre stack as the desktop app
- [ ] **LGRAPH-02**: The demo loads instantly from a bundled static sample schema (no backend connection required)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Testing Foundation

- **TEST-01**: Unit tests for the 12 DB adapters
- **TEST-02**: Integration tests for Hono route handlers
- **TEST-03**: Tests for shared Zod schemas and utility functions

### Observability

- **OBS-01**: Query plan visualization (EXPLAIN) for SQL engines
- **OBS-02**: Connection health dashboard across all engines

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                       | Reason                                                           |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Cross-engine writes in federated query        | Safety risk; federation is read-only by design                   |
| Mobile app                                    | Desktop-first; Tauri targets desktop platforms                   |
| Cloud-hosted version                          | Local-first is a core value; no server-side component            |
| Real-time collaboration                       | Single-user local tool; not a team product                       |
| Live connection for landing schema-graph demo | Demo must be read-only with bundled static data for instant load |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| TBEX-01     | Phase 1 | Pending |
| TBEX-02     | Phase 1 | Pending |
| FED-01      | Phase 2 | Pending |
| FED-02      | Phase 2 | Pending |
| FED-03      | Phase 2 | Pending |
| SCHTL-01    | Phase 3 | Pending |
| SCHTL-02    | Phase 3 | Pending |
| SCHTL-03    | Phase 3 | Pending |
| AICHAT-01   | Phase 4 | Pending |
| AICHAT-02   | Phase 4 | Pending |
| AICHAT-03   | Phase 4 | Pending |
| SLOWQ-01    | Phase 5 | Pending |
| SLOWQ-02    | Phase 5 | Pending |
| SLOWQ-03    | Phase 5 | Pending |
| LMAT-01     | Phase 6 | Pending |
| LMAT-02     | Phase 6 | Pending |
| LMAT-03     | Phase 6 | Pending |
| LCI-01      | Phase 6 | Pending |
| LCI-02      | Phase 6 | Pending |
| LGRAPH-01   | Phase 6 | Pending |
| LGRAPH-02   | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---

_Requirements defined: 2026-06-29_
_Last updated: 2026-06-29 after initial definition_
