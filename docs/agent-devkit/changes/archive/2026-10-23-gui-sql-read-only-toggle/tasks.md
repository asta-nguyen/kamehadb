# GUI SQL Read-Only Toggle tasks

## Design

[GUI SQL Read-Only Toggle](design.md)

## Global Constraints

- New profiles and profiles migrated from older databases default to read-only.
- The backend reads the policy from the persisted profile; query callers cannot override it, and a missing profile or policy-read error fails closed.
- The setting controls SQL GUI query execution, inline cell updates, and full-query CSV export only. AI chat only suggests SQL; user-run statements follow the editor policy. MCP remains read-only and never consults or obeys this setting; Mongo, Redis, shells, previews, metadata, and dedicated maintenance workflows remain unchanged.
- Each writable GUI API request still contains only one SQL statement; the editor's existing batch splitter sends multiple statements as separate requests. Database account grants remain the final permission boundary.

## Impact map

Entry: `apps/desktop/src/components/connection-dialog.tsx::ConnectionDialog`; `internal/api/sql.go::SqlService.RunQuery` and `internal/api/export.go::SqlService.ExportQueryCSV`
Flow: connection dialog → `useCreateConnection` / `useUpdateConnection` → `ConnectionsService` → `store.Store`; SQL editor or full CSV export → bound `SqlService` → `database.DB` lookup → SQL adapter. MCP uses its separate tool path and `sqlsafety.Check`.
State changes: a profile-scoped `read_only` value is stored in metadata SQLite; query execution itself adds no new state.
External effects: when a user disables read-only, a GUI statement can mutate the selected database; full CSV export writes its existing destination file. Saving the profile follows the existing profile-update invalidation path.
Change candidates: `internal/store/profiles.go`, `internal/store/migrate.go`, `internal/api/sql.go`, `internal/api/export.go`, `internal/api/connections.go`, `dbcore/sqlsafety/sqlsafety.go`, `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`, `apps/desktop/wailsjs/go/models.ts`, `apps/desktop/src/components/connection-dialog.tsx`, `apps/desktop/src/components/sql-editor.tsx`, tests, `CHANGELOG.md`, `docs/llm/workflows/connections-and-workspace.md`, `docs/llm/workflows/sql-workspace.md`.
Verification: Go store/API/sql-safety/MCP tests; desktop profile/editor/editability tests; Wails model generation; `go build ./...`; `pnpm typecheck`, `pnpm test`, and `pnpm lint`.
Verified at: `c35d46222b5837ecf44d9d4f770fcb06cedd9e6c` working tree; the map reflects the implemented change (profile persistence, SQL/CSV policy checks, dialog switch, editor gating) whose source and tests were landed against these working-tree contents.

## Tasks

### Task 1 — Persist the profile setting and shared contract

Files: `internal/store/profiles.go::Profile`; `internal/store/profiles.go::ProfileInput`; `internal/store/profiles.go::profileColumns`; `internal/store/profiles.go::Store.CreateProfile`; `internal/store/profiles.go::Store.UpdateProfile`; `internal/store/profiles.go::Store.ProfileReadOnly`; `internal/store/profiles.go::Store.scanProfile`; `internal/store/migrate.go::Store.migrate`; `internal/store/migrate.go::Store.rebuildProfiles`; `internal/store/profiles_test.go::TestProfileReadOnlyDefaultsAndUpdates`; `internal/store/store_test.go::TestLegacyConnectionProfilesMigrateReadOnly`; `packages/shared/src/types.ts::ConnectionProfile`; `packages/shared/src/schemas.ts::BaseCreateSchema`; `packages/shared/src/schemas.ts::UpdateConnectionProfileSchema`; generated `apps/desktop/wailsjs/go/models.ts::store.Profile`
Interfaces: add the persisted and frontend-facing `readOnly` property used by Tasks 2–3.
Change: add the migration-safe, default-true profile column; create with an omitted value as true; preserve the stored value when update omits it; round-trip an explicit false. Add a scalar `ProfileReadOnly` lookup that does not decrypt profile secrets. Regenerate the bound models after the Go profile shape changes.
Verify: store tests prove old rows migrate to true, omitted create is true, omitted update preserves state, explicit false survives save/read, and the scalar lookup returns the stored value without loading secrets; `wails generate module` emits a matching profile model.
Progress: done
Result: `go test ./internal/store/ -run 'TestProfileReadOnly|TestLegacyConnectionProfilesMigrateReadOnly'` — pass (`TestProfileReadOnlyDefaultsAndUpdates`, `TestProfileReadOnlyIgnoresUnreadableSecrets`, `TestLegacyConnectionProfilesMigrateReadOnly`); generated `models.ts` carries `readOnly` on `store.Profile` and `ProfileInput`.

### Task 2 — Enforce profile policy at every GUI SQL execution boundary

Files: `internal/api/sql.go::SqlService.RunQuery`; `internal/api/sql.go::NewSqlService`; `internal/api/export.go::SqlService.ExportQueryCSV`; `internal/api/connections.go::NewServices`; `dbcore/sqlsafety/sqlsafety.go::CheckSingleStatement`; `dbcore/sqlsafety/sqlsafety_test.go::TestCheckSingleStatement`; `internal/api/request-sql_test.go::TestRunQueryUsesProfileReadOnly`; `internal/api/export_test.go::TestNativeExportReadOnlyPolicy`; `internal/api/sql_sort_test.go::TestSortUsesCachedColumnsWithoutWeakeningValidation`; new `internal/api/connection-readonly_test.go::TestReadOnlySettingCanChangeWithManagedMCPAccount`; `internal/mcp/mcp_test.go::TestMCPRemainsReadOnlyWhenGUIProfileWritable`
Interfaces: consume Task 1's persisted read-only lookup; expose no policy override in `RunQueryInput` or export input.
Change: inject the scalar store lookup into `SqlService`; check the saved preference before adapter/exporter dispatch or temporary-file creation. Preserve the existing `sqlsafety.Check` for read-only profiles and MCP. Add `sqlsafety.CheckSingleStatement` for writable GUI profiles: allow one statement and reject chains with the existing dialect-aware scanner. Apply the same check to `RunQuery` and full-query CSV export; reject missing-profile or settings-store errors before dispatch.
Verify: API tests assert read-only `UPDATE` is rejected without adapter calls; writable single `UPDATE` reaches the adapter; a chained query is rejected in both modes; profile lookup failure is fail-closed; CSV export follows the same cases without creating an export file on rejection; an active managed MCP account does not prevent the user from changing this GUI-only preference; MCP still rejects writes when the associated GUI profile is writable.
Progress: done
Result: `go test ./internal/api/ ./internal/mcp/ ./dbcore/sqlsafety/ -run 'TestRunQueryUsesProfileReadOnly|TestNativeExportReadOnlyPolicy|TestSortUsesCachedColumnsWithoutWeakeningValidation|TestReadOnlySettingCanChangeWithManagedMCPAccount|TestMCPRemainsReadOnlyWhenGUIProfileWritable|TestCheckSingleStatement'` — all pass.

### Task 3 — Restore the user switch and reflect it in SQL editing UI

Files: `apps/desktop/src/components/connection-dialog.tsx::ConnectionDialog`; `apps/desktop/src/components/sql-editor.tsx::executeQuery`; `apps/desktop/src/components/sql-editor.tsx::QueryResultTable`; new `apps/desktop/src/components/connection-dialog.test.tsx::SQLReadOnlySwitch`; `apps/desktop/src/components/sql-editor.test.ts::SQLReadOnlyExecution`; `apps/desktop/src/lib/table-editability.test.ts::getQueryResultEditabilityState`
Interfaces: consume Task 1's `ConnectionProfile.readOnly` field and Task 2's stored-policy enforcement.
Change: add the shadcn switch to create/edit dialogs for SQL kinds only, checked by default and accompanied by text explaining that disabling it allows SQL writes from the GUI. Preserve its state on edit/save. Gate the editor's read-only prompt and inline cell editing from the saved profile instead of hardcoded state; allow editor-side write statements only when that profile is writable.
Verify: UI tests assert the switch defaults on for new and legacy-shaped profiles, appears only for SQL kinds, persists an explicit off value, sends each writable batch statement as a separate request, and keeps inline edits disabled while read-only.
Progress: done
Result: `pnpm vitest run` — 153 tests pass, including `SQLReadOnlySwitch`, `SQLReadOnlyExecution`, and `getQueryResultEditabilityState` coverage; `tsc --noEmit` and `eslint` clean after rebuilding `@kamehadb/shared` dist and removing orphaned imports.

### Task 4 — Update product documentation and run the feature checks

Files: `CHANGELOG.md::[Unreleased]`; `docs/llm/workflows/connections-and-workspace.md::Connection profiles`; `docs/llm/workflows/sql-workspace.md::SQL execution and results`; `docs/llm/workflows/sql-workspace.md::Inline cell editing`
Interfaces: document only the behavior implemented by Tasks 1–3; the old feature is being restored, so no requirement delta is planned.
Change: record the user-visible toggle in the changelog and update the existing wiki profile and SQL-editing narratives. Keep unrelated `[~]` verification markers unless their full page evidence is refreshed.
Verify: run wiki validation, `go test ./...`, and `go build ./...`; run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.
Progress: done
Result: `validate-llm-wiki.mjs` 0 errors; `go test ./...` green except `internal/database::TestWithMaintenanceRunsAfterHookBeforeReleasingReaders`, an unrelated flaky timing test that passes 3/3 standalone; `go build ./...`, `pnpm typecheck`, desktop `tsc --noEmit`, `pnpm test` (153), `pnpm lint`, `pnpm lint:go` (0 issues), and `pnpm build` (wails production build with regenerated bindings) all pass.

## Files inspected, no change

- `apps/desktop/src/hooks/use-query.ts` — query calls and cache invalidation flow.
- `apps/desktop/src/lib/table-editability.ts` — `getQueryResultEditabilityState` already accepts an `isReadOnly` input; the implementation only threads the saved profile value through `QueryResultTable`, so no change is needed here.
- `internal/mcp/tools.go` — separate MCP SQL execution boundary that must remain read-only.
- `internal/api/ai.go` — AI chat returns SQL suggestions for user review and does not execute them.
- `docs/llm/INDEX.md` — current wiki pages and registered `SQL` requirement prefix.
- `docs/llm/workflows/sql-workspace.md` — current SQL execution and inline-edit documentation; page still has legacy business-rule sections and a `[~]` verification marker.
- `docs/llm/workflows/connections-and-workspace.md` — current profile behavior and documentation status.

## Approval Gate

Status: approved

## Decision Log

None.
