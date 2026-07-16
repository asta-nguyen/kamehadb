# Requirements: KamehaDB UI/UX Consistency

**Defined:** 2026-06-28
**Core Value:** Every supported database engine should feel equally first-class in the UI — consistent navigation, predictable interactions, and unified visual language across all explorers.

## v1 Requirements

Requirements for the UI/UX consistency initiative. Each maps to roadmap phases.

### Design Tokens

- [x] **DSN-01**: Establish spacing scale (4/8/12/16/24/32/48px) as TailwindCSS tokens used consistently across all components
- [x] **DSN-02**: Define color palette tokens for surface, border, text, accent, and status (success/warning/error/info) with semantic naming
- [x] **DSN-03**: Standardize typography scale (font sizes, weights, line heights) for headings, body, captions, and code
- [x] **DSN-04**: Define radius and shadow tokens for cards, dialogs, inputs, and popovers
- [x] **DSN-05**: Document all tokens in a style guide (DESIGN-SYSTEM.md) accessible from the codebase

### Component Patterns

- [x] **CMP-01**: Create a shared ExplorerToolbar component for database explorer views (Mongo, Redis, Qdrant, TigerBeetle) with consistent filter/refresh/action slots
- [x] **CMP-02**: Create a shared EmptyState component with icon, title, description, and optional action
- [x] **CMP-03**: Create a shared LoadingState component (skeleton or spinner) used by all data-dependent views
- [x] **CMP-04**: Create a shared ErrorState component with retry action for failed data loads
- [x] **CMP-05**: Standardize action button sizing and icon usage across all table row actions (edit, delete, view, copy)
- [x] **CMP-06**: Create a shared FilterBar component for structured filter building (reused by vector search and Mongo/Redis explorers)

### SQL Editor & Results

- [x] **SQL-01**: Unify SQL editor toolbar layout with consistent button placement, spacing, and grouping
- [x] **SQL-02**: Standardize query results table styling (header, row height, cell padding, truncation) across all SQL engines
- [x] **SQL-03**: Ensure table browser (schema sidebar) uses consistent tree indentation, icons, and hover states
- [x] **SQL-04**: Unify query history panel styling with results table

### Non-SQL Explorers

- [x] **EXP-01**: Mongo document table view — align toolbar, filter, and pagination with shared ExplorerToolbar pattern
- [x] **EXP-02**: Redis key list view — align toolbar, search, and key detail panel with shared patterns
- [x] **EXP-03**: Qdrant collection/point view — align toolbar, filter, and point table with shared patterns
- [x] **EXP-04**: TigerBeetle explorer — align toolbar and table with shared patterns
- [x] **EXP-05**: Ensure all explorers use consistent JSON/document rendering for nested data

### Vector Search UI

- [x] **VEC-01**: Unify pgvector and sqlite-vec search panels into a shared layout (search form + results + map toggle)
- [x] **VEC-02**: Standardize vector column selector, metric selector, and limit input styling
- [x] **VEC-03**: Ensure vector map (3D scatter) controls are consistent between pgvector and sqlite-vec
- [x] **VEC-04**: Align filter builder UI between pgvector and sqlite-vec search

### Chrome & Navigation

- [x] **CHR-01**: Audit sidebar for consistent connection card styling, spacing, and status badge placement
- [x] **CHR-02**: Standardize workspace tab bar — tab sizing, close button, active indicator, overflow handling
- [x] **CHR-03**: Ensure all dialogs (connection edit, backup/restore, settings) use consistent Dialog component with standardized header/footer
- [x] **CHR-04**: Unify toast/notification patterns for success, error, and info messages
- [x] **CHR-05**: Ensure keyboard shortcuts are consistent and discoverable (help overlay or hints)

## Out of Scope

| Feature                  | Reason                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Landing page redesign    | Separate Next.js marketing site, not desktop app                |
| Mobile/responsive design | Desktop-only Tauri app                                          |
| New theme/color scheme   | Dark/light mode works; focus is consistency not new themes      |
| New icon library         | Lucide icons are sufficient; standardize usage patterns instead |
| Animation/motion design  | Out of scope for consistency pass; may add later                |

## Traceability

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| DSN-01      | Phase 1 | Complete |
| DSN-02      | Phase 1 | Complete |
| DSN-03      | Phase 1 | Complete |
| DSN-04      | Phase 1 | Complete |
| DSN-05      | Phase 1 | Complete |
| CMP-01      | Phase 2 | Complete |
| CMP-02      | Phase 2 | Complete |
| CMP-03      | Phase 2 | Complete |
| CMP-04      | Phase 2 | Complete |
| CMP-05      | Phase 2 | Complete |
| CMP-06      | Phase 2 | Complete |
| SQL-01      | Phase 3 | Complete |
| SQL-02      | Phase 3 | Complete |
| SQL-03      | Phase 3 | Complete |
| SQL-04      | Phase 3 | Complete |
| EXP-01      | Phase 4 | Complete |
| EXP-02      | Phase 4 | Complete |
| EXP-03      | Phase 4 | Complete |
| EXP-04      | Phase 4 | Complete |
| EXP-05      | Phase 4 | Complete |
| VEC-01      | Phase 5 | Complete |
| VEC-02      | Phase 5 | Complete |
| VEC-03      | Phase 5 | Complete |
| VEC-04      | Phase 5 | Complete |
| CHR-01      | Phase 3 | Complete |
| CHR-02      | Phase 3 | Complete |
| CHR-03      | Phase 3 | Complete |
| CHR-04      | Phase 2 | Complete |
| CHR-05      | Phase 3 | Complete |

**Coverage:**

- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---

_Requirements defined: 2026-06-28_
_Last updated: 2026-07-16 after implementation verification_
