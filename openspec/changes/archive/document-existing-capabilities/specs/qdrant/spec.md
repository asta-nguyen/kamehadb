## ADDED Requirements

### Requirement: Qdrant collection browsing

The system SHALL list Qdrant collections with vector size, distance metric, points count, and status.

#### Scenario: List collections

- **WHEN** user connects to Qdrant and expands the connection
- **THEN** the system displays all collections with their metadata

### Requirement: Qdrant point scrolling

The system SHALL scroll through points in a Qdrant collection with cursor-based pagination, optional filtering, and configurable payload/vector inclusion.

#### Scenario: Scroll points

- **WHEN** user opens a collection and requests points
- **THEN** the system returns a page of points with payloads and a next offset for pagination

#### Scenario: Scroll with filter

- **WHEN** user applies a filter to the scroll request
- **THEN** the system returns only points matching the filter conditions

### Requirement: Qdrant similarity search

The system SHALL perform similarity search on Qdrant collections, accepting a vector and returning ranked hits with scores, optional filtering, and configurable result limit.

#### Scenario: Search by vector

- **WHEN** user submits a vector search query
- **THEN** the system returns ranked hits with scores and payloads

#### Scenario: Search with filter

- **WHEN** user submits a vector search with a filter
- **THEN** the system applies the filter and returns only matching hits

### Requirement: Qdrant recommend

The system SHALL perform recommend queries on Qdrant collections, accepting a point ID and returning similar points ranked by score.

#### Scenario: Recommend by point ID

- **WHEN** user requests recommendations for a specific point
- **THEN** the system returns similar points ranked by similarity score

### Requirement: Qdrant filter builder

The system SHALL provide a visual filter builder for constructing Qdrant filter conditions without writing raw JSON.

#### Scenario: Build filter visually

- **WHEN** user adds filter conditions via the filter builder UI
- **THEN** the system constructs the Qdrant filter JSON from the visual conditions

### Requirement: Qdrant collection stats

The system SHALL retrieve collection statistics including status, points count, vectors count, indexed vectors count, segments count, vector size, and distance metric.

#### Scenario: View collection stats

- **WHEN** user opens stats for a Qdrant collection
- **THEN** the system displays all available collection statistics

### Requirement: Qdrant vector map

The system SHALL render a 2D or 3D visualization of Qdrant vectors using dimensionality reduction, with point coloring and hover tooltips.

#### Scenario: View vector map

- **WHEN** user opens the vector map for a collection
- **THEN** the system samples points, reduces dimensions, and renders an interactive scatter plot
