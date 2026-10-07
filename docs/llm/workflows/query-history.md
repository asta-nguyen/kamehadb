# Query History

Verification: [x] Query saving, history actions, and slow-query aggregation were checked against the desktop caller, sidecar route, metadata store, and normalization test.

## Saved SQL history

### Business rules

- Successful SQL runs can be stored with query text, connection identity, execution duration, and row count.
- The history panel can reopen a query, mark it as a favorite, assign a name, and delete a history item.
- Query history is local application metadata, not a database server log.

### Flow

1. The SQL editor submits a query and, for a successful result, sends history details to the sidecar.
2. The query-history route reads or mutates the metadata store.
3. The desktop panel fetches history for the selected connection and exposes reopen, favorite, rename, and delete actions.

### State changes

- Query-history records and favorites are stored in metadata SQLite.
- Reopening an item creates or reuses a SQL workspace tab with the stored query text.

### Side effects

- A successful SQL query creates a local history record.
- Favorite/name/delete actions write the local metadata store and invalidate the desktop history query.

### Authorization & constraints

- History is scoped by connection ID in the desktop and sidecar API.
- History is independent of database-native query logging and is retained in the local metadata database.

### Error paths

- Invalid history IDs or missing records return route errors.
- Failed history writes leave the item unchanged and the desktop mutation reports the failure.

### Tests

The recorded FFF test-file search for queryHistoryRouter in test/spec files returned no direct route test. apps/desktop/src/lib/query-normalize.test.ts tests the separate slow-query normalization utility.

### Related

- [SQL workspace](sql-workspace.md)
- [AI assistant](../integrations/ai-assistant.md)

### Sources

- apps/desktop/src/components/query-history-panel.tsx
- apps/desktop/src/components/sql-editor.tsx
- apps/desktop/src/hooks/use-query-history.ts
- apps/desktop/src/lib/api.ts
- apps/desktop/src/lib/query-normalize.ts
- apps/desktop/src/lib/query-normalize.test.ts
- apps/sidecar/src/routes/query-history.ts
- apps/sidecar/src/db/metadata-store.ts

## Slow-query patterns and AI actions

### Business rules

- The history panel groups normalized SQL patterns and calculates count and p95 duration from saved local history.
- Pattern normalization strips changing values heuristically; it is not a database query-plan identity.
- The panel can ask the configured AI assistant to explain a query or suggest an index.

### Flow

1. The panel normalizes saved query strings and aggregates counts and duration statistics.
2. It sorts and presents the highest-p95 patterns, capped by the top-N constant.
3. An AI action builds a prompt from the selected query pattern and sends it through the AI chat flow.

### State changes

- Aggregates are computed from saved history in the frontend and are not stored as separate records.
- AI action prompts become chat messages when submitted through the assistant.

### Side effects

- Slow-query analysis reads local history and computes values in the desktop.
- AI explain/index suggestions send prompt content through the selected provider.

### Authorization & constraints

- The percentile calculation uses the project's nearest-rank helper.
- AI suggestions depend on the active AI provider and its credentials/model.

### Error paths

- Empty history produces no slow-pattern aggregates.
- AI provider or stream failures follow the AI chat error path.

### Tests

- apps/desktop/src/lib/query-normalize.test.ts covers query normalization and percentile calculation.
- The recorded FFF test-file search for query-history panel AI action identifiers returned no direct component test.

### Related

- [AI assistant](../integrations/ai-assistant.md)

### Sources

- apps/desktop/src/components/query-history-panel.tsx
- apps/desktop/src/lib/query-normalize.ts
- apps/desktop/src/lib/query-normalize.test.ts
- apps/desktop/src/hooks/use-chat.ts
- apps/sidecar/src/routes/ai.ts
