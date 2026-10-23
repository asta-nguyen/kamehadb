# SQL Workspace

Verification: [~] Confirmed content gap: the sidecar descriptions and pre-change requirements below are historical baselines, not current behavior. Whole-row byte budgets, exact paging, native PostgreSQL/SQLite CSV and smaller SQLite caches are implemented; verified requirement replacement and narrative refresh remain unfinished. This checkpoint does not mark the page current.

## Requirements

### SQL-gui-result-bounds

The system SHALL cap unpaginated GUI SQL results at 50,000 rows.

#### Scenario: row ceiling

- GIVEN a SQLite query producing 60,000 rows
- WHEN it runs through the GUI adapter
- THEN 50,000 rows are returned with truncation indicated

Evidence: `dbcore/engines/types.go`, `dbcore/providers/sqlite/sqlite.go`, `dbcore/providers/sqlite/sqlite_test.go`

### SQL-preview-paging

The system SHALL browse SQL table previews through limit/offset requests.

#### Scenario: sorted preview

- GIVEN a SQLite table with more than two rows
- WHEN a descending name preview requests two rows
- THEN two sorted rows are returned with further rows indicated

Evidence: `dbcore/providers/sqlite/sqlite.go`, `dbcore/providers/sqlite/sqlite_test.go`, `apps/desktop/src/components/table-view.tsx`

### SQL-result-export

The system SHALL export the displayed SQL result through frontend CSV, JSON, or SQL serialization.

#### Scenario: current result export

- GIVEN a displayed query result
- WHEN CSV export is selected
- THEN the frontend serializes those rows into a downloaded file

Evidence: `apps/desktop/src/lib/export.ts`

### SQL-sqlite-memory

The system SHALL configure SQLite with an approximately 64 MiB cache, a 256 MiB mmap allowance, and in-memory temporary storage.

#### Scenario: opening SQLite

- GIVEN a configured SQLite file
- WHEN the normal or MCP adapter opens it
- THEN the adapter applies the current cache, mmap, and temporary-storage PRAGMAs

Evidence: `dbcore/providers/sqlite/sqlite.go`

## Sources

- `dbcore/engines/types.go`
- `dbcore/providers/sqlite/sqlite.go`
- `dbcore/providers/sqlite/sqlite_test.go`
- `apps/desktop/src/components/table-view.tsx`
- `apps/desktop/src/lib/export.ts`

## SQL execution and results

### Business rules

- SQL-kind profiles use the shared SQL adapter route. MongoDB, Redis, Qdrant, and TigerBeetle use their dedicated routes.
- The saved profile's `readOnly` flag is the GUI write policy. New and migrated profiles default to read-only; the connection dialog shows a per-profile Read-only switch for SQL kinds, and turning it off permits SQL writes from the GUI. MCP stays unconditionally read-only and never consults this flag.
- While a profile is read-only, the frontend editor screens with `isQuerySafe` and the backend runs `dbcore/sqlsafety.Check`: statement chaining and destructive keywords are rejected, and only statements beginning with SELECT, WITH, SHOW, DESCRIBE, or EXPLAIN pass.
- While a profile is writable, the editor skips its safety gate and the backend runs `sqlsafety.CheckSingleStatement`, which still rejects a request containing more than one statement. A multi-statement editor batch is split and sent as a separate request per statement.
- This is keyword screening rather than a complete SQL parser. The database account's own permissions remain the final boundary.
- The editor supports completion, query results, query history, and exporting result data as CSV, JSON, or INSERT statements.

### Flow

1. The user edits a SQL workspace tab and runs the selected statement.
2. The desktop calls the bound `SqlService.RunQuery` for the connection.
3. The service reads the saved profile's `readOnly` flag and applies `sqlsafety.Check` or `sqlsafety.CheckSingleStatement` before adapter dispatch; a missing profile or policy-lookup error fails closed.
4. The editor renders columns, rows, duration, and errors; successful queries can be added to query history.
5. Export actions serialize the current result and download a dated file; `ExportQueryCSV` applies the same profile policy before creating the export file.

### State changes

- Query text and tab selection are held in workspace-tab state.
- The profile's `readOnly` value is persisted in the metadata SQLite `read_only` column; query execution adds no new state.
- Successful SQL executions can be persisted as query-history records by the desktop flow.

### Side effects

- A query reaches the configured database through the adapter; on a writable profile it can modify the database.
- Export creates a browser download. CSV serialization prefixes formula-leading values with an apostrophe.

### Authorization & constraints

- The frontend safety prompt and inline editability read the saved profile's `readOnly`; an unresolved profile is treated as read-only.
- The backend reads the policy from the persisted profile; request callers cannot override it.
- SQL identifiers used in generated SQL are quoted through the shared helper.
- The source safety check is not a database privilege boundary.

### Error paths

- Unsafe SQL on a read-only profile, or a multi-statement request on a writable one, is rejected before reaching the adapter.
- A write submitted on a writable profile can still fail at the database for missing grants; the adapter error is surfaced.
- Adapter failures are returned to the editor, which displays the query error and records frontend diagnostics.
- Export with no columns or rows produces a SQL comment instead of INSERT statements.

### Tests

- apps/desktop/src/lib/sql-safety.test.ts covers accepted and rejected query patterns.
- apps/desktop/src/components/sql-editor.test.ts covers statement detection, dialect-aware limits, and read-only/writable batch execution.
- dbcore/sqlsafety/sqlsafety_test.go covers the backend screening and single-statement checks; internal/api/request-sql_test.go and internal/api/export_test.go cover profile-policy enforcement on query and export.

### Related

- [Query history](query-history.md)
- [Federated queries](federated-query.md)
- [Vector search](vector-search.md)

### Sources

- internal/api/sql.go
- internal/api/export.go
- dbcore/sqlsafety/sqlsafety.go
- dbcore/sqlsafety/sqlsafety_test.go
- internal/store/profiles.go
- apps/desktop/src/components/sql-editor.tsx
- apps/desktop/src/hooks/use-query.ts
- apps/desktop/src/lib/export.ts
- apps/desktop/src/lib/sql-autocomplete.ts
- apps/desktop/src/lib/sql-safety.test.ts
- apps/desktop/src/components/sql-editor.test.ts
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

1. The result view infers the source table and checks result columns against table metadata.
2. Editing a cell builds an UPDATE statement with a WHERE clause based on the primary key, or all columns when no primary key exists.
3. The desktop sends that statement through the normal SQL query hook to `SqlService.RunQuery`.
4. The backend applies the profile's stored `readOnly` policy: on a writable profile the UPDATE reaches the adapter and the database account's grants decide success; on a read-only profile the edit is never offered.

### State changes

- The edit form holds a proposed value in UI state; the generated update travels the same SQL execution path and profile policy as editor statements.

### Side effects

- An enabled update is sent to the backend and, on a writable profile, executes against the database through the adapter.

### Authorization & constraints

- A profile marked read-only disables cell editing in the UI, and the same persisted flag would reject the generated UPDATE at the backend.
- Direct-table inference excludes joins, unions, grouping, computed or duplicate result columns, and subqueries.

### Error paths

- Metadata not yet loaded prevents editing and displays a loading warning.
- Unsupported query shapes or read-only profiles leave cells non-editable with an explanatory message.
- A submitted update can still fail at the adapter (missing grants, constraint violations); the error is surfaced like any query error.

### Tests

- apps/desktop/src/lib/table-editability.test.ts covers editability gating for read-only/writable profiles and update-query building.

### Related

- [SQL execution and results](sql-workspace.md)

### Sources

- apps/desktop/src/components/table-view.tsx
- apps/desktop/src/components/sql-editor.tsx
- apps/desktop/src/lib/table-editability.ts
- apps/desktop/src/lib/table-editability.test.ts
- apps/desktop/src/hooks/use-query.ts
- internal/api/sql.go
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
