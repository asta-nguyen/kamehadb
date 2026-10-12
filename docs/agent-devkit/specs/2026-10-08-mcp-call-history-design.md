# MCP Call History

**Status:** Approved; implementation plan approved by user on 2026-10-08.

## Goal

Let users inspect which database-backed MCP tools were called against their KamehaDB profiles, without copying returned database rows or documents into KamehaDB's metadata store.

## Current behavior

- `apps/sidecar/src/mcp/tools.ts::registerMcpTools` executes SQL and MongoDB tools and returns their results to the MCP client. It does not persist tool calls.
- The desktop SQL editor saves successful SQL executions through `apps/sidecar/src/routes/query-history.ts`; those entries contain query text, execution time, duration, and row count.
- MCP settings and credentials already use the local metadata SQLite database. The existing MCP settings UI lives in API Settings.

## Proposed behavior

- Record each database-backed MCP tool invocation, including SQL and MongoDB metadata/read tools. Exclude `list_mcp_profiles`, which reads local profile metadata and does not contact a customer database.
- Store the profile ID, tool name, tool input, timestamp, success/error status, duration, returned item count, truncation flag, and a stable error code when a call fails.
- Do not store returned SQL rows or MongoDB documents. Do not include tool inputs or results in sidecar logs.
- Store history in a new table in the existing local metadata SQLite database. Keep the existing `query_history` table and desktop Query History flow unchanged.
- Enable MCP history by default for new and existing installs. Add an MCP Settings toggle; turning it off stops new records but retains existing ones. Add a Clear History action that removes all MCP call records.
- Automatically expire records older than 30 days. Prune expired records when the sidecar starts, when a record is written, and when history is read.
- Add a recent-call list in MCP Settings that shows the profile, tool, call time, status, duration, item count, and input. It does not show returned database content.
- If recording a call fails, still return the MCP tool result to the caller and log a warning without logging the input or returned content.

## Interfaces

- Extend the persisted MCP settings with a `history_enabled` flag that defaults to enabled, including for existing metadata databases.
- Add authenticated management operations under the existing sidecar `/mcp` settings router to read recent history, toggle recording, and clear history. The public MCP listener and its tool contracts remain unchanged.
- Add shared request/response schemas, desktop API methods, React Query hooks, and controls/list UI within the existing API Settings → MCP Server section.
- Keep history records local to KamehaDB. They are not written to the customer database and are not sent to the MCP client as an extra response.
- Route all database-backed tool registrations through one shared wrapper inside `registerMcpTools`. Keep each tool callback body unchanged; the wrapper captures inputs, timing, outcome, and the result summary.

## Result summary

- `item_count` means the length of the primary returned item array: SQL `rows`, MongoDB `documents`, or the single list/describe array returned by a metadata tool.
- `truncated` copies the result's existing truncation flag. Failed calls store no item count and use `truncated: false`.
- The wrapper parses the callback's existing JSON response for the primary array and truncation flag, stores only these summary values, and then returns the same response to the MCP client.

## Privacy and lifecycle

- Tool inputs can contain sensitive literals, filters, or aggregation values. MCP Settings must explain that inputs are stored locally and provide a recording toggle and clear action.
- Inputs are stored in the local metadata database in the same plain-text form used by the existing SQL query history. The feature does not add a new encryption layer.
- Expired records are pruned when the sidecar starts, when a record is written, and when history is read. Disabling history does not delete existing records; Clear History does.
- Profile IDs remain attached to records through the retention period, including after a profile is removed. The UI can fall back to the ID when the profile no longer exists.

## Scope boundaries

- No returned rows/documents, schema snapshots, database-side logging, MCP client identity tracking, export, or per-profile history controls.
- No changes to MCP authorization, read-only enforcement, adapter behavior, or the existing desktop SQL Query History.

## Open questions

None. History expires after 30 days.

## Impact map

Entry: `apps/sidecar/src/mcp/tools.ts::registerMcpTools`

Flow: `apps/sidecar/src/mcp/runtime.ts::handleRequest` → `apps/sidecar/src/mcp/tools.ts::registerMcpTools` → MCP adapters and `apps/sidecar/src/db/metadata-store.ts`

State changes: Add a local SQLite MCP call-history table and a persisted history-enabled setting.

External effects: Local metadata writes and authenticated sidecar management requests; no customer-database writes or notifications.

Change candidates: `packages/shared/src/schemas.ts`; `apps/sidecar/src/db/metadata-store.ts`; `apps/sidecar/src/lib/constants.ts`; `apps/sidecar/src/mcp/tools.ts`; `apps/sidecar/src/mcp/tools.test.ts`; `apps/sidecar/src/routes/mcp-settings.ts`; `apps/sidecar/src/db/metadata-store.test.ts`; `apps/sidecar/src/routes/mcp-settings.test.ts`; `apps/sidecar/src/mcp/runtime.test.ts`; `apps/desktop/src/lib/api.ts`; `apps/desktop/src/hooks/use-mcp-settings.ts`; `apps/desktop/src/lib/query-keys.ts`; `apps/desktop/src/components/mcp-settings-section.tsx`; `CHANGELOG.md`.

Verification: Sidecar metadata, route, and MCP runtime tests; desktop tests; sidecar build; workspace typecheck; desktop build.

Verified at: `5ed0b95e744dd7291761f471d52a7716a763f91e`

## Related context

- [Read-only MCP server](../../llm/integrations/read-only-mcp.md)
- [Query History](../../llm/workflows/query-history.md)

## Execution

- [MCP Call History implementation plan](../plans/2026-10-08-mcp-call-history-plan.md)
