# Federated Queries

Verification: [x] Desktop dispatch, safety checks, merge behavior, and per-connection error aggregation were checked against current source.

## Multi-profile SQL query

### Business rules

- Federated queries send the same read-safe SQL to selected SQL profiles in parallel.
- Results merge by the union of column names. Rows from a result missing a union column receive null for that column.
- Per-profile errors are retained alongside successful results.
- Combined row count is the sum of returned rows; reported duration is the slowest profile duration.

### Flow

1. The user selects SQL connections and enters one query in the federated-query canvas.
2. The frontend checks the query with the shared isQuerySafe helper.
3. It sends the query to each selected profile concurrently through the normal SQL query API.
4. The merge helper combines rows and columns and retains connection-scoped errors for rendering.

### State changes

- Selected profiles, SQL text, and displayed results are frontend workspace state.
- Federated results are not saved as a separate database object by this flow.

### Side effects

- Each selected profile receives an independent SQL query request to its configured database.

### Authorization & constraints

- Only SQL-kind profiles are valid targets.
- Query safety uses the same heuristic as the regular SQL workspace; it does not replace target database privileges.
- Parallel calls do not imply a shared transaction or consistent snapshot across different database servers.

### Error paths

- Unsafe SQL prevents dispatch.
- A failure from one profile is preserved in the combined result while other profiles can still return rows.
- If all selected profiles fail, the canvas has errors and no merged rows.

### Tests

The recorded FFF test-file search for FederatedQueryCanvas, federated-merge, and federated route identifiers in test/spec files returned no matching direct feature test.

### Related

- [SQL workspace](sql-workspace.md)
- [Connections and workspace](connections-and-workspace.md)

### Sources

- apps/desktop/src/components/federated-query-canvas.tsx
- apps/desktop/src/lib/federated-merge.ts
- apps/desktop/src/hooks/use-query.ts
- apps/desktop/src/lib/api.ts
- packages/shared/src/types.ts
