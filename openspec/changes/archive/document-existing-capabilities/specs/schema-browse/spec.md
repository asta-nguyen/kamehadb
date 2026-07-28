## ADDED Requirements

### Requirement: Schema tree navigation

The system SHALL display a hierarchical tree of databases, schemas, tables, and columns in the sidebar, with lazy loading and expand/collapse support.

#### Scenario: Expand database node

- **WHEN** user expands a database node in the sidebar
- **THEN** the system loads and displays its schemas

#### Scenario: Expand schema node

- **WHEN** user expands a schema node
- **THEN** the system loads and displays its tables

#### Scenario: Expand table node

- **WHEN** user expands a table node
- **THEN** the system loads and displays its columns with type, nullable, primary key, and foreign key info

### Requirement: ERD graph visualization

The system SHALL render an entity-relationship diagram showing tables as nodes and foreign key relationships as edges.

#### Scenario: View schema graph

- **WHEN** user selects the schema graph view for a schema
- **THEN** the system displays tables as nodes with columns and foreign key edges between related tables

### Requirement: Table preview rows

The system SHALL fetch and display preview rows for a selected table with support for pagination, sorting, filtering, and search.

#### Scenario: Load preview rows

- **WHEN** user selects a table for preview
- **THEN** the system fetches the first page of rows with column metadata

#### Scenario: Sort preview rows

- **WHEN** user clicks a column header to sort
- **THEN** the system re-fetches rows sorted by that column in the chosen direction

#### Scenario: Filter preview rows

- **WHEN** user applies a filter on a column
- **THEN** the system re-fetches rows matching the filter criteria

### Requirement: Global schema search

The system SHALL provide a global search that matches table names and column names across schemas in the connected database.

#### Scenario: Search for table

- **WHEN** user types a search query in global search
- **THEN** the system returns matching tables and columns with schema, table, and column type info

### Requirement: Index browsing

The system SHALL display index information for a selected table, including index name, columns, uniqueness, primary key flag, and index method.

#### Scenario: View table indexes

- **WHEN** user selects a table and navigates to its indexes
- **THEN** the system displays all indexes with their metadata
