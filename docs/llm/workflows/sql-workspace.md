# SQL Workspace

Verification: [x] Query safety, table/schema views, and result export paths were checked against current source and the listed tests.

## SQL execution and results

### Business rules

- SQL-kind profiles use the shared SQL adapter route. MongoDB, Redis, Qdrant, and TigerBeetle use their dedicated routes.
- The sidecar applies shared `isQuerySafe` screening before execution. The helper strips SQL comments and string literals, rejects statement chaining and destructive keywords, and accepts only statements beginning with SELECT, WITH, SHOW, DESCRIBE, or EXPLAIN.
- This is keyword screening rather than a complete SQL parser. The database account's own permissions remain relevant.
- The editor supports completion, query results, query history, and exporting result data as CSV, JSON, or INSERT statements.

### Flow

1. The user edits a SQL workspace tab and runs the selected statement.
2. The desktop calls the connection-scoped SQL query endpoint.
3. The route checks safety and dispatches to the adapter selected for the saved profile kind.
4. The editor renders columns, rows, duration, and errors; successful queries can be added to query history.
5. Export actions serialize the current result and download a dated file.

### State changes

- Query text and tab selection are held in workspace-tab state.
- Successful SQL executions can be persisted as query-history records by the desktop flow.

### Side effects

- A query reaches the configured database through the adapter.
- Export creates a browser download. CSV serialization prefixes formula-leading values with an apostrophe.

### Authorization & constraints

- The frontend and sidecar share the same query-safety helper.
- SQL identifiers used in generated SQL are quoted through the shared helper.
- The source safety check is not a database privilege boundary.

### Error paths

- Unsafe SQL is rejected before reaching the adapter.
- Adapter failures are returned to the editor, which displays the query error and records frontend diagnostics.
- Export with no columns or rows produces a SQL comment instead of INSERT statements.

### Tests

- apps/desktop/src/lib/sql-safety.test.ts covers accepted and rejected query patterns.
- apps/desktop/src/components/sql-editor.test.ts covers SQL editor behavior.

### Related

- [Query history](query-history.md)
- [Federated queries](federated-query.md)
- [Vector search](vector-search.md)

### Sources

- apps/desktop/src/components/sql-editor.tsx
- apps/desktop/src/hooks/use-query.ts
- apps/desktop/src/lib/export.ts
- apps/desktop/src/lib/sql-autocomplete.ts
- apps/desktop/src/lib/sql-safety.test.ts
- apps/desktop/src/components/sql-editor.test.ts
- apps/sidecar/src/routes/sql.ts
- apps/sidecar/src/adapters/factory.ts
- packages/shared/src/types.ts

## Table browsing, schema tree, and graph

### Business rules

- The sidebar schema tree loads database/schema/table structure through SQL metadata endpoints, supports filtering, and opens table views.
- Table preview and statistics use connection-scoped query hooks.
- Schema graph views are available for SQL connections; the graph is a visual view of discovered schema relationships.

### Flow

1. Expanding a SQL connection loads its database and schema nodes.
2. Selecting a table opens a table view and requests preview rows and metadata.
3. A graph action opens a schema graph tab for the active connection.

### State changes

- Expanded connections and active/open tabs are part of local workspace state.
- Table rows, columns, indexes, and statistics are query-cache data scoped to the connection.

### Side effects

- Expanding and opening views issues read requests to the sidecar metadata and preview endpoints.
- Manual connection reload invalidates the profile-scoped cache and refetches mounted schema views.

### Authorization & constraints

- Metadata operations follow the SQL adapters supported by the profile kind; optional metrics may return empty/default data where an adapter does not implement them.

### Error paths

- Failed schema, preview, or statistics requests are surfaced through the relevant query state; the view cannot provide fresh data while its sidecar request fails.

### Tests

The recorded FFF test-file search for schema tree and graph component terms found no matching direct UI tests.

### Related

- [Connections and workspace](connections-and-workspace.md)
- [Schema lifecycle](schema-lifecycle.md)

### Sources

- apps/desktop/src/components/sidebar.tsx
- apps/desktop/src/components/schema-tree.tsx
- apps/desktop/src/components/table-view.tsx
- apps/desktop/src/components/schema-graph.tsx
- apps/desktop/src/hooks/use-schema.ts
- apps/desktop/src/hooks/use-query.ts
- apps/sidecar/src/routes/sql.ts

## Inline cell editing

### Business rules

- The UI enables cell edits only for a direct, single-table SELECT result with direct table columns and a writable profile.
- If a table has no primary key, the UI builds a match from all returned columns and warns that duplicate rows may be ambiguous.

### Flow

1. The table view infers the source table and checks result columns against table metadata.
2. Editing a cell builds an UPDATE statement with a WHERE clause based on the primary key, or all columns when no primary key exists.
3. The desktop sends that statement through the normal SQL query hook to /sql/:id/query.
4. The route applies `isQuerySafe`, which rejects UPDATE because it is not an allowed read statement.

### State changes

- The edit form holds a proposed value in UI state; the source currently routes the generated update through the same SQL execution path.

### Side effects

- An attempted update is sent to the SQL sidecar route and rejected by the route's shared safety check before the adapter executes it.

### Authorization & constraints

- A profile marked read-only disables cell editing in the UI.
- Direct-table inference excludes joins, unions, grouping, computed or duplicate result columns, and subqueries.
- Current source therefore contains a frontend/backend mismatch: the UI can offer editing for an otherwise eligible result, but the route rejects its generated UPDATE. The wiki records this as observed behavior, not as a supported successful write path.

### Error paths

- Metadata not yet loaded prevents editing and displays a loading warning.
- Unsupported query shapes or read-only profiles leave cells non-editable with an explanatory message.
- If an enabled edit is submitted, the SQL route rejects the UPDATE as unsafe.

### Tests

The recorded FFF test-file search for `getTableEditabilityState` and `buildRowUpdateQuery` in test/spec files returned no matches.

### Related

- [SQL execution and results](sql-workspace.md)

### Sources

- apps/desktop/src/components/table-view.tsx
- apps/desktop/src/components/sql-editor.tsx
- apps/desktop/src/lib/table-editability.ts
- apps/desktop/src/hooks/use-query.ts
- apps/sidecar/src/routes/sql.ts
- packages/shared/src/types.ts

## SQL schema search and autocomplete

### Business rules

- Schema search returns matches for SQL profiles through the SQL schema route.
- Completion data is requested per active connection and derives from discovered database metadata.

### Flow

1. Global search requests schema matches across SQL profiles; editor completion requests suggestions for the active SQL connection.
2. Sidecar SQL schema endpoints read adapter metadata and return matches or completion items.
3. The UI presents those results in the search dialog or editor.

### State changes

- Search text and result lists are transient frontend state; schema metadata is cached by the sidecar and desktop query cache.

### Side effects

- Search/completion operations perform metadata reads and may populate schema caches.

### Authorization & constraints

- Global schema search is restricted to SQL-kind profiles and requires at least two query characters.
- Some adapters may report schema search as unsupported.

### Error paths

- Unsupported schema-search responses are tracked by the search dialog; other fetch failures are skipped there.
- Completion failures leave the current editor without new suggestions.

### Tests

The recorded FFF test-file search for GlobalSearch and SQL schema search/completion component terms returned no matching direct feature tests.

### Related

- [Connections and workspace](connections-and-workspace.md)

### Sources

- apps/desktop/src/components/global-search.tsx
- apps/desktop/src/components/sql-editor.tsx
- apps/desktop/src/lib/sql-autocomplete.ts
- apps/sidecar/src/routes/sql-schema.ts
- apps/sidecar/src/routes/sql.ts
