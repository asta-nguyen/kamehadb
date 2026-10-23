# GUI SQL Read-Only Toggle

## Goal

Restore a user-controlled, per-profile read-only setting for SQL GUI work. A profile stays read-only by default; the user can turn that mode off to run SQL writes from the desktop GUI.

## Scope

- Put a `Read-only` switch in the connection create/edit dialog for SQL kinds. Explain that turning it off permits SQL writes from the GUI.
- Persist the setting with the saved connection profile and show its current value when editing the profile.
- Apply the setting to SQL editor execution, inline result-cell updates, and full-query CSV export.
- AI chat may suggest SQL but does not execute it; a statement the user runs in the SQL editor follows this profile setting.
- Leave Mongo, Redis, embedded shells, SQL preview/metadata operations, and dedicated maintenance actions outside this setting.
- Keep MCP independently and unconditionally read-only. MCP never consults or obeys this GUI setting.

## Behavior

- New SQL profiles start in read-only mode. Existing profiles migrate to read-only mode so the change cannot silently enable writes.
- The UI switch is profile-scoped and user-controlled. When enabled, the existing SQL screening rejects writes and inline result-cell editing is disabled; the current UI's hardcoded editability value must be replaced with the saved profile value. When disabled, the SQL GUI may send DML or DDL to the selected adapter.
- Backend policy comes from the persisted profile, never from a caller-provided query flag. If the profile or its setting cannot be read, reject the request before adapter dispatch.
- Both GUI query execution and full-query CSV export apply the same policy before adapter dispatch or export-file creation. Each API request must contain one SQL statement; a chain in one request remains rejected in either mode. The editor retains its existing batch splitter and sends each split statement as a separate request.
- The policy is checked when each SQL request starts. Saving the profile follows the existing connection-invalidation lifecycle.
- Turning read-only off does not change database credentials, MCP provisioning, or MCP policy. The database account's own grants remain the final permission boundary.

## Edge cases

- Legacy profile rows receive `read_only = true`; a missing create value also resolves to true, while an omitted update value preserves the stored value.
- The switch is hidden for non-SQL kinds. If a profile changes kind, its stored value is retained but ignored until the profile is SQL again.
- A read-only lookup error or missing profile fails closed and does not reach the adapter.
- One trailing SQL terminator is allowed; multiple statements in a single API request remain rejected for writable profiles as well as read-only profiles.
- A multi-statement editor batch remains a sequence of separate requests, so each statement gets its own policy check and a failure can follow earlier successful statements.
- A user may change this GUI-only setting while a managed MCP account exists. That action does not alter or unlock MCP access.
- A write submitted while the profile is writable can still fail because the remote database account lacks the needed grant; surface the adapter error normally.

## Interfaces

- Add `readOnly` to `store.Profile` and nullable `ProfileInput`; add a `read_only INTEGER NOT NULL DEFAULT 1` profile column after legacy profile-table rebuilds.
- Expose `readOnly` in the shared connection profile and create/update schemas, then regenerate Wails models.
- Add `Store.ProfileReadOnly(id) (bool, error)` as a scalar profile lookup and give `SqlService` access to it. `RunQuery` and `ExportQueryCSV` select either the existing read-only SQL check or `sqlsafety.CheckSingleStatement` before obtaining an adapter.
- Keep the existing `sqlsafety.Check` behavior for MCP and read-only GUI requests. Writable GUI validation may share its dialect-aware statement-chain scanner but must not weaken MCP's check.
- Use the saved profile property to drive the connection-dialog switch, editor safety prompts, and inline cell editability. Do not add a permission field to `RunQueryInput`.

## Verification

- Store tests cover migration of legacy profiles to read-only, omitted create/update values, and explicit false round-tripping.
- SQL API tests cover read-only rejection, writable single-statement execution, chain rejection in both modes, fail-closed profile lookup, and the same policy for CSV export.
- An MCP test confirms a profile with GUI read-only disabled still cannot execute a write through MCP.
- Desktop tests cover the defaulted SQL-only switch, the editor's separate per-statement batch requests, and inline-cell editability from the saved profile.
- Run `go test ./...` and `go build ./...`; regenerate Wails bindings and run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.

## Related context

- [SQL workspace](../../../../llm/workflows/sql-workspace.md)
- [Connections and workspace](../../../../llm/workflows/connections-and-workspace.md)
