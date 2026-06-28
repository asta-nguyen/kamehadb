# Requirements: KamehaDB UI/UX Consistency

**Defined:** 2026-06-28
**Core Value:** Every supported database engine should feel equally first-class in the UI — consistent navigation, predictable interactions, and unified visual language across all explorers.

## v1 Requirements

Requirements for the UI/UX consistency initiative. Each maps to roadmap phases.

### Design Tokens

- [ ] **DSN-01**: Establish spacing scale (4/8/12/16/24/32/48px) as TailwindCSS tokens used consistently across all components
- [ ] **DSN-02**: Define color palette tokens for surface, border, text, accent, and status (success/warning/error/info) with semantic naming
- [ ] **DSN-03**: Standardize typography scale (font sizes, weights, line heights) for headings, body, captions, and code
- [ ] **DSN-04**: Define radius and shadow tokens for cards, dialogs, inputs, and popovers
- [ ] **DSN-05**: Document all tokens in a style guide (DESIGN-SYSTEM.md) accessible from the codebase

### Component Patterns

- [ ] **CMP-01**: Create a shared ExplorerToolbar component for database explorer views (Mongo, Redis, Qdrant, TigerBeetle) with consistent filter/refresh/action slots
- [ ] **CMP-02**: Create a shared EmptyState component with icon, title, description, and optional action
- [ ] **CMP-03**: Create a shared LoadingState component (skeleton or spinner) used by all data-dependent views
- [ ] **CMP-04**: Create a shared ErrorState component with retry action for failed data loads
- [ ] **CMP-05**: Standardize action button sizing and icon usage across all table row actions (edit, delete, view, copy)
- [ ] **CMP-06**: Create a shared FilterBar component for structured filter building (reused by vector search and Mongo/Redis explorers)

### SQL Editor & Results

- [ ] **SQL-01**: Unify SQL editor toolbar layout with consistent button placement, spacing, and grouping
- [ ] **SQL-02**: Standardize query results table styling (header, row height, cell padding, truncation) across all SQL engines
- [ ] **SQL-03**: Ensure table browser (schema sidebar) uses consistent tree indentation, icons, and hover states
- [ ] **SQL-04**: Unify query history panel styling with results table

### Non-SQL Explorers

- [ ] **EXP-01**: Mongo document table view — align toolbar, filter, and pagination with shared ExplorerToolbar pattern
- [ ] **EXP-02**: Redis key list view — align toolbar, search, and key detail panel with shared patterns
- [ ] **EXP-03**: Qdrant collection/point view — align toolbar, filter, and point table with shared patterns
- [ ] **EXP-04**: TigerBeetle explorer — align toolbar and table with shared patterns
- [ ] **EXP-05**: Ensure all explorers use consistent JSON/document rendering for nested data

### Vector Search UI

- [ ] **VEC-01**: Unify pgvector and sqlite-vec search panels into a shared layout (search form + results + map toggle)
- [ ] **VEC-02**: Standardize vector column selector, metric selector, and limit input styling
- [ ] **VEC-03**: Ensure vector map (3D scatter) controls are consistent between pgvector and sqlite-vec
- [ ] **VEC-04**: Align filter builder UI between pgvector and sqlite-vec search

### Chrome & Navigation

- [ ] **CHR-01**: Audit sidebar for consistent connection card styling, spacing, and status badge placement
- [ ] **CHR-02**: Standardize workspace tab bar — tab sizing, close button, active indicator, overflow handling
- [ ] **CHR-03**: Ensure all dialogs (connection edit, backup/restore, settings) use consistent Dialog component with standardized header/footer
- [ ] **CHR-04**: Unify toast/notification patterns for success, error, and info messages
- [ ] **CHR-05**: Ensure keyboard shortcuts are consistent and discoverable (help overlay or hints)

## Out of Scope

| Feature                  | Reason                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Landing page redesign    | Separate Next.js marketing site, not desktop app                |
| Mobile/responsive design | Desktop-only Tauri app                                          |
| New theme/color scheme   | Dark/light mode works; focus is consistency not new themes      |
| New icon library         | Lucide icons are sufficient; standardize usage patterns instead |
| Animation/motion design  | Out of scope for consistency pass; may add later                |

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| DSN-01      | Phase 1 | Pending |
| DSN-02      | Phase 1 | Pending |
| DSN-03      | Phase 1 | Pending |
| DSN-04      | Phase 1 | Pending |
| DSN-05      | Phase 1 | Pending |
| CMP-01      | Phase 2 | Pending |
| CMP-02      | Phase 2 | Pending |
| CMP-03      | Phase 2 | Pending |
| CMP-04      | Phase 2 | Pending |
| CMP-05      | Phase 2 | Pending |
| CMP-06      | Phase 2 | Pending |
| SQL-01      | Phase 3 | Pending |
| SQL-02      | Phase 3 | Pending |
| SQL-03      | Phase 3 | Pending |
| SQL-04      | Phase 3 | Pending |
| EXP-01      | Phase 4 | Pending |
| EXP-02      | Phase 4 | Pending |
| EXP-03      | Phase 4 | Pending |
| EXP-04      | Phase 4 | Pending |
| EXP-05      | Phase 4 | Pending |
| VEC-01      | Phase 5 | Pending |
| VEC-02      | Phase 5 | Pending |
| VEC-03      | Phase 5 | Pending |
| VEC-04      | Phase 5 | Pending |
| CHR-01      | Phase 3 | Pending |
| CHR-02      | Phase 3 | Pending |
| CHR-03      | Phase 3 | Pending |
| CHR-04      | Phase 2 | Pending |
| CHR-05      | Phase 3 | Pending |

**Coverage:**

- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---

_Requirements defined: 2026-06-28_
_Last updated: 2026-06-28 after initialization_
