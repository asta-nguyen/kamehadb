# MCP Call History — Implementation Plan

## Approved design

[MCP Call History design](../specs/2026-10-08-mcp-call-history-design.md)

## Global Constraints

- Record every database-backed MCP tool invocation except `list_mcp_profiles`.
- Store tool inputs and call metadata in local metadata SQLite. Do not store returned rows/documents or log tool inputs/results.
- Enable history by default for new and existing installs. Disabling recording retains existing entries; Clear History removes all entries; expire entries older than 30 days.
- Register database-backed tools through one shared wrapper in `registerMcpTools`; keep their callback bodies unchanged.
- `item_count` is the primary returned array length: SQL `rows`, MongoDB `documents`, or the metadata tool's returned list/describe array. Copy the existing `truncated` flag. Failed calls have no item count and `truncated: false`.
- If a history write fails, preserve the original MCP result and log a warning without input or result content.
- Keep the existing desktop SQL Query History, MCP authorization, read-only enforcement, adapter behavior, and public MCP tool response shapes unchanged.

## Tasks

### Task 1 — Add shared contracts and metadata-store persistence

Depends on: None.

Files:

- `packages/shared/src/schemas.ts::McpSettingsResponseSchema`
- `apps/sidecar/src/lib/constants.ts::MCP_HISTORY_RETENTION_DAYS`, `MCP_HISTORY_LIST_LIMIT`
- `apps/sidecar/src/db/metadata-store.ts::initMetadataStore`, `getMcpSettings`, `recordMcpCallHistory`, `listMcpCallHistory`, `clearMcpCallHistory`, `setMcpHistoryEnabled`
- `apps/sidecar/src/db/metadata-store.test.ts::MCP call-history persistence`

Interfaces:

- Export `McpCallHistoryEntrySchema` and its inferred type with `id`, `profileId`, `toolName`, JSON `input`, `executedAt`, `status` (`success` or `error`), `durationMs`, nullable `itemCount`, `truncated`, and optional `errorCode`.
- Export `McpCallHistoryResponseSchema` as `{ entries: McpCallHistoryEntry[] }` and `SetMcpHistoryEnabledSchema` as `{ enabled: boolean }`.
- Extend `McpSettingsResponseSchema` with `historyEnabled`.
- Export store operations `recordMcpCallHistory`, `listMcpCallHistory`, `clearMcpCallHistory`, and `setMcpHistoryEnabled`; `getMcpSettings` returns the persisted flag.
- Add named constants `MCP_HISTORY_RETENTION_DAYS = 30` and `MCP_HISTORY_LIST_LIMIT = 50` for expiry and the recent-history response cap.

Change:

1. Add `history_enabled INTEGER NOT NULL DEFAULT 1` to `mcp_settings`, including a migration that enables history for existing metadata databases.
2. Create `mcp_call_history` with profile ID, tool name, serialized input, timestamp, outcome, duration, item count, truncation flag, and stable error code. Do not add a result-payload column.
3. Add an index for newest-first history reads. Prune entries older than 30 days at metadata-store startup, before recording a call, and before listing history.
4. Make `listMcpCallHistory` return the newest 50 entries. Make `clearMcpCallHistory` remove every entry. When recording is disabled, `recordMcpCallHistory` writes nothing.

Verify:

- Run `pnpm --filter @kamehadb/sidecar test -- src/db/metadata-store.test.ts`. Expect fresh and legacy stores to default history on, settings to persist across reopen, records to round-trip without result payloads, entries older than 30 days to be pruned, and clear to remove all records.

### Task 2 — Capture calls through one MCP tool-registration wrapper

Depends on: Task 1.

Files:

- `apps/sidecar/src/mcp/tools.ts::registerMcpTools`
- `apps/sidecar/src/mcp/tools.test.ts::database tool history summaries` (new)
- `apps/sidecar/src/mcp/runtime.test.ts::SQL history integration`

Interfaces:

- Consume `recordMcpCallHistory` and the persisted `historyEnabled` setting from Task 1.
- Add one local database-tool registration helper in `registerMcpTools`. It wraps a tool callback and receives the tool name, validated arguments, elapsed duration, original MCP result, and a summary derived from that result.
- The wrapper reads the existing JSON text response after the callback returns, extracts only the summary, persists it, and then returns that same response to the MCP client.

Change:

1. Register all nine SQL and MongoDB database-backed tools through the shared helper. Leave `list_mcp_profiles` on its current path and leave each database tool callback body unchanged.
2. Capture each database tool invocation's profile ID and validated input. Mark returned error results as failures and persist only the stable error code, not the formatted error message.
3. Derive the item array by tool name: `sql_query` uses `rows`; `mongo_find` and `mongo_aggregate` use `documents`; list and describe tools use their corresponding primary array (`databases`, `schemas`, `tables`, `columns`, or `collections`). Persist only the array length and the existing `truncated` flag.
4. Return the exact original tool result. If summary extraction or persistence fails, log a warning with tool/profile identifiers only; never log input or result content.

Verify:

- Run `pnpm --filter @kamehadb/sidecar test -- src/mcp/tools.test.ts src/mcp/runtime.test.ts`. Expect SQL rows, Mongo documents, and metadata arrays to produce the defined counts; truncation to match the original result; failed calls to store only status/error code; `list_mcp_profiles` and disabled history to create no record; a history-store failure to leave the MCP response unchanged; and an end-to-end SQL tool call to return the same rows while storing only call metadata.

### Task 3 — Add authenticated history and recording settings routes

Depends on: Tasks 1 and 2.

Files:

- `apps/sidecar/src/routes/mcp-settings.ts::createMcpSettingsRouter`
- `apps/sidecar/src/routes/mcp-settings.test.ts::MCP call-history routes`

Interfaces:

- `GET /mcp/history` returns `McpCallHistoryResponseSchema` with the newest entries.
- `PATCH /mcp/settings/history` accepts `SetMcpHistoryEnabledSchema` and returns the updated MCP settings response.
- `DELETE /mcp/history` clears all history and returns HTTP 204.

Change:

1. Add these management routes to the existing MCP settings router so they use the same sidecar authentication boundary.
2. Reuse the metadata-store operations from Task 1. Do not add routes to the public MCP listener.

Verify:

- Run `pnpm --filter @kamehadb/sidecar test -- src/routes/mcp-settings.test.ts` and `pnpm --filter @kamehadb/sidecar build`. Expect history reads to be newest-first and capped, toggle input validation and persistence to work, and DELETE to remove all entries.

### Task 4 — Add MCP history controls and list to API Settings

Depends on: Task 3.

Files:

- `apps/desktop/src/lib/api.ts::api`
- `apps/desktop/src/lib/query-keys.ts::QUERY_KEYS`
- `apps/desktop/src/hooks/use-mcp-settings.ts::MCP history hooks`
- `apps/desktop/src/components/mcp-settings-section.tsx::McpSettingsSection`
- `CHANGELOG.md::Unreleased`

Interfaces:

- Add desktop API methods for `GET /mcp/history`, `PATCH /mcp/settings/history`, and `DELETE /mcp/history` using the shared response/input types.
- Add a React Query key for MCP call history and hooks for reading, toggling, and clearing it.

Change:

1. Add a history toggle, a Clear History action, and a recent-call list to the existing MCP Settings section. Show profile name when available and profile ID when the profile has been removed.
2. Display the input as text/JSON with a clear notice that inputs are stored locally. Show profile, tool, time, success/error, duration, item count, and truncation. Never display returned rows/documents.
3. Turning recording off retains existing entries; Clear History asks for confirmation and then refreshes the history query. Use the existing shadcn `Switch`, `Button`, and UI components.
4. Add an Unreleased changelog entry describing local MCP history, the 30-day retention, the default-on toggle, and that result payloads are not stored.

Verify:

- Run `pnpm --filter @kamehadb/desktop test`, `pnpm --filter @kamehadb/desktop build`, and `pnpm typecheck`. Expect the existing MCP Settings and API client consumers to compile. Verify in the MCP Settings UI that recording defaults on, turning it off retains old entries and stops new ones, Clear History removes entries, and the list shows inputs and summaries without returned database content.

## Files inspected, no change

- `apps/sidecar/src/mcp/runtime.ts::McpRuntime.handleRequest` — continues creating the MCP server and registering tools; capture stays inside `registerMcpTools`.
- `apps/sidecar/src/routes/query-history.ts::queryHistoryRouter` — existing desktop SQL history stays separate and unchanged.
- `apps/sidecar/src/index.ts::start` — the existing settings router mount and authentication wiring already cover the new management routes.
- `apps/desktop/src/components/api-settings-page.tsx::ApiSettingsPage` — already mounts `McpSettingsSection`; no new top-level app view is needed.
- `apps/desktop/src/components/sql-editor.tsx::executeQuery` — the existing desktop SQL history caller remains unchanged.

## Impact map

Entry: `apps/sidecar/src/mcp/tools.ts::registerMcpTools`

Flow: `apps/sidecar/src/mcp/runtime.ts::handleRequest` → `apps/sidecar/src/mcp/tools.ts::registerMcpTools` → MCP adapters → `apps/sidecar/src/db/metadata-store.ts::recordMcpCallHistory`

State changes: Add a local MCP call-history table and a `history_enabled` MCP settings flag to metadata SQLite; prune entries older than 30 days.

External effects: Authenticated sidecar management requests and local metadata reads/writes; no customer-database writes, notifications, or MCP response payload changes.

Change candidates: `packages/shared/src/schemas.ts`; `apps/sidecar/src/lib/constants.ts`; `apps/sidecar/src/db/metadata-store.ts`; `apps/sidecar/src/db/metadata-store.test.ts`; `apps/sidecar/src/mcp/tools.ts`; `apps/sidecar/src/mcp/tools.test.ts`; `apps/sidecar/src/mcp/runtime.test.ts`; `apps/sidecar/src/routes/mcp-settings.ts`; `apps/sidecar/src/routes/mcp-settings.test.ts`; `apps/desktop/src/lib/api.ts`; `apps/desktop/src/lib/query-keys.ts`; `apps/desktop/src/hooks/use-mcp-settings.ts`; `apps/desktop/src/components/mcp-settings-section.tsx`; `CHANGELOG.md`.

Verification: Sidecar metadata, tool wrapper, route, and runtime tests; desktop tests; sidecar and desktop builds; workspace typecheck.

Verified at: `5ed0b95e744dd7291761f471d52a7716a763f91e`

## Approval Gate

Required: yes

Reason: Adds a persisted local data schema, changes shared contracts, and spans sidecar and desktop packages.

Status: approved by user on 2026-10-08

## Decision Log

None.
