# Vector Search

Verification: [x] PostgreSQL and SQLite vector route behavior and desktop callers were checked against current source. Direct route tests were searched.

## PostgreSQL pgvector search and map

### Business rules

- PostgreSQL vector tools expose capability discovery, similarity search, and point sampling for map views.
- Similarity metrics include L2, cosine, and inner product.
- Search validates the selected table/column and vector dimension before running.
- Sample requests are bounded to 500 rows.

### Flow

1. The user opens a PostgreSQL vector search tab from the workspace or a table/column action.
2. The desktop hook requests capabilities and search/sample data for the selected schema, table, and vector column.
3. The sidecar validates identifiers, detects supported vector metadata, then asks the PostgreSQL adapter to calculate/sort results.
4. Search results or sampled points are rendered in the vector view/map.

### State changes

- Search options are stored on the workspace tab. The vector-map camera state is also stored on its tab.
- Database rows are read from PostgreSQL; the vector feature does not persist a separate search history.

### Side effects

- Capability and search/sample calls execute metadata or SELECT work against PostgreSQL.

### Authorization & constraints

- The route is PostgreSQL-specific.
- Identifiers are validated/quoted before interpolation. Vector dimensions must match the selected column.
- Sample rows are capped at 500.

### Error paths

- Unsupported pgvector capability, missing table/column, invalid dimension, invalid metric, and adapter errors return route errors to the desktop.

### Tests

The recorded FFF test-file search for PostgreSQL vector route and hook identifiers in test/spec files returned no direct feature tests.

### Related

- [SQL workspace](sql-workspace.md)
- [Engine explorers](engine-explorers.md)

### Sources

- apps/desktop/src/components/postgres-vector-query.tsx
- apps/desktop/src/components/postgres-vector-map.tsx
- apps/desktop/src/hooks/use-postgres-vector.ts
- apps/desktop/src/store/workspace-tabs.ts
- apps/sidecar/src/routes/sql-vector-pg.ts
- apps/sidecar/src/routes/sql.ts

## SQLite vec0 search and map

### Business rules

- SQLite vector operations use the vec0 extension and a separate read-only route path.
- The route reports capability status and supports vector search and point sampling.

### Flow

1. The desktop opens a SQLite vector search or map tab for the selected file profile.
2. The hook requests capability information, search results, or sample points from the SQLite vector route.
3. The route opens the database in read-only mode, loads vec0 support, validates the requested vector table/column, and returns results.

### State changes

- Search and selected-table options are workspace tab state; the file database is not modified by this feature.

### Side effects

- The route opens a read-only SQLite connection and executes extension-backed vector reads.

### Authorization & constraints

- This path is SQLite-only and requires vec0 support in the file.
- The route uses read-only file access.

### Error paths

- Missing extension/capability, invalid vector table or column, invalid dimensions, and database errors are returned to the desktop.

### Tests

The recorded FFF test-file search for SQLite vector route and hook identifiers in test/spec files returned no direct feature tests.

### Related

- [SQL workspace](sql-workspace.md)
- [Engine explorers](engine-explorers.md)

### Sources

- apps/desktop/src/components/sqlite-vec-view.tsx
- apps/desktop/src/hooks/use-sqlite-vec.ts
- apps/desktop/src/store/workspace-tabs.ts
- apps/sidecar/src/routes/sql-vector-sqlite.ts
- apps/sidecar/src/routes/sql.ts
