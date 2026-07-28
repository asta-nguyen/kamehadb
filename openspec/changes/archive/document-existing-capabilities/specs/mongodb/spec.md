## ADDED Requirements

### Requirement: MongoDB database and collection browsing

The system SHALL list MongoDB databases and collections with document counts, supporting filtering of system databases (admin, local, config).

#### Scenario: List databases

- **WHEN** user connects to MongoDB and expands the connection
- **THEN** the system displays user databases excluding admin, local, and config

#### Scenario: List collections

- **WHEN** user expands a database node
- **THEN** the system displays collections with type (collection, view, timeseries) and document counts

### Requirement: MongoDB document CRUD

The system SHALL support finding, inserting, updating, and deleting documents in MongoDB collections via the sidecar adapter.

#### Scenario: Find documents with filter

- **WHEN** user queries a collection with a filter
- **THEN** the system returns matching documents with total count and pagination support

#### Scenario: Update document

- **WHEN** user edits a document in the UI
- **THEN** the system updates the matching document and reports matched and modified counts

#### Scenario: Delete document

- **WHEN** user deletes a document
- **THEN** the system removes the matching document and reports deleted count

### Requirement: MongoDB aggregation pipeline

The system SHALL support executing aggregation pipelines on MongoDB collections with configurable limit and skip.

#### Scenario: Run aggregation

- **WHEN** user submits an aggregation pipeline
- **THEN** the system executes the pipeline and returns the result documents

### Requirement: Embedded mongosh shell

The system SHALL provide an embedded mongosh shell, resolving a local mongosh binary or installing an app-managed copy under the app data directory without modifying the user's global installation.

#### Scenario: mongosh available locally

- **WHEN** user opens a mongosh shell and mongosh is found on the system
- **THEN** the system launches the local mongosh binary

#### Scenario: mongosh not installed

- **WHEN** user opens a mongosh shell and mongosh is not found
- **THEN** the system installs an app-managed mongosh copy and launches it

### Requirement: MongoDB collection stats

The system SHALL retrieve collection statistics including document count and index information (name, key, unique flag).

#### Scenario: View collection stats

- **WHEN** user opens stats for a collection
- **THEN** the system displays document count and index list with metadata

### Requirement: MongoDB autocomplete

The system SHALL provide field-level autocomplete for MongoDB queries based on sampled document schemas.

#### Scenario: Field name completion

- **WHEN** user types a partial field name in the query editor
- **THEN** the system suggests matching field names from the collection's sampled schema
