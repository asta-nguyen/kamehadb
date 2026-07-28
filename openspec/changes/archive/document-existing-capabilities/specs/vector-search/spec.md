## ADDED Requirements

### Requirement: pgvector capability detection

The system SHALL detect pgvector availability on PostgreSQL connections, including extension version, vector columns with dimensions, and vector indexes with method and operator.

#### Scenario: pgvector installed

- **WHEN** user connects to a PostgreSQL database with pgvector extension installed
- **THEN** the system reports available=true with version, vector columns, and vector indexes

#### Scenario: pgvector not installed

- **WHEN** user connects to a PostgreSQL database without pgvector
- **THEN** the system reports available=false

### Requirement: pgvector similarity search

The system SHALL perform similarity search on pgvector columns, supporting L2, cosine, and inner product distance metrics with optional filtering and configurable result limit.

#### Scenario: Search with cosine distance

- **WHEN** user submits a vector search with cosine metric
- **THEN** the system returns matching rows ranked by cosine similarity with scores

#### Scenario: Search with filter

- **WHEN** user submits a vector search with a SQL filter clause
- **THEN** the system applies the filter before returning ranked results

### Requirement: pgvector sample extraction

The system SHALL extract sample vectors from a pgvector column for visualization, returning point IDs, vectors, and associated metadata.

#### Scenario: Sample points

- **WHEN** user requests a sample from a vector column
- **THEN** the system returns a configurable number of sample points with vectors and metadata

### Requirement: sqlite-vec capability detection

The system SHALL detect sqlite-vec availability on SQLite connections, including extension version, vector columns with dimensions, and metadata columns.

#### Scenario: sqlite-vec installed

- **WHEN** user connects to a SQLite database with sqlite-vec extension
- **THEN** the system reports available=true with version, vector columns, and metadata columns

### Requirement: sqlite-vec similarity search

The system SHALL perform similarity search on sqlite-vec columns, supporting cosine, L2, and inner product metrics with optional filtering.

#### Scenario: Search sqlite-vec with L2 distance

- **WHEN** user submits a vector search with L2 metric on a SQLite connection
- **THEN** the system returns matching rows ranked by L2 distance with scores

### Requirement: 3D vector visualization

The system SHALL render a 3D scatter plot of vector samples using PCA dimensionality reduction, with point coloring and hover tooltips showing payload data.

#### Scenario: View 3D vector map

- **WHEN** user opens the 3D vector map for a set of sample points
- **THEN** the system reduces vectors to 3D via PCA and renders an interactive scatter plot

#### Scenario: Hover point for details

- **WHEN** user hovers over a point in the 3D map
- **THEN** the system displays the point's payload metadata in a tooltip
