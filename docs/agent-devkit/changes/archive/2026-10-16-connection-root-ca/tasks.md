# Connection Root CA and TLS Mode tasks

## Design

[Connection Root CA and TLS Mode](design.md)

## Global Constraints

- SSL off preserves the engine's current connection behavior.
- SSL on with no PEM keeps each engine's current TLS behavior: PostgreSQL verifies against system roots with no plaintext fallback; MySQL/MariaDB encrypts without verification; SQL Server encrypts without verification (new option).
- SSL on with a PEM verifies the server certificate chain and hostname against that PEM only; an invalid PEM or a failed TLS handshake returns an error and never retries without TLS.
- Root CA PEM is client-side trust data, remains local, and is never sent to the server.
- Root CA is not a managed-account protected field; the existing locks on kind, target, credentials, and the SSL toggle are unchanged.
- SSL and Root CA controls are limited to PostgreSQL, MySQL, MariaDB, and SQL Server.
- TLS-aware MCP connection paths preserve their current timeout and session initialization behavior, including SQL Server's 30-second provisioning timeout.
- One shared `engines.TLSConfig` owns PEM parsing and the verification rules; engines do not re-implement them.

## Impact map

Entry: `internal/api/connections.go::ConnectionsService.TestConnection`; MCP query entry: `internal/mcp/manager.go::createSqlAdapter`.
Flow: connection dialog → Wails `ConnectionsService` → profile input/store → `engines.ConnProfile` → `engines.TLSConfig` → PostgreSQL, MySQL/MariaDB, or SQL Server adapter. MCP provisioning, revoke, and read-only SQL queries rebuild the same profile settings from the saved profile before opening a connection. A profile update already invalidates the cached MCP adapter through `onCacheClear`.
State changes: Root CA is stored as `connection_profiles.ssl_ca_cert` in metadata SQLite; unsaved connection tests use the input value without persisting it.
External effects: TLS handshakes to the selected database from normal, test, AI pgvector, schema-watcher, and MCP connections; the PEM is not transmitted. No new external service or credential is introduced.
Change candidates: `internal/store/profiles_test.go`; new `internal/engines/tls.go`; `internal/api/connections.go`, `internal/api/ai.go`, `internal/api/api_test.go`; PostgreSQL, MySQL, and SQL Server adapters and tests; `internal/mcp/provisioner.go`, `internal/mcp/manager.go`, and a focused test; desktop connection dialog, generated Wails models, UI tests; three existing wiki pages and `CHANGELOG.md`.
Verification: focused Go tests per task; desktop component tests and typecheck; then `go test ./...`, `go build ./...`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
Verified at: `51879a664842795db303317400cde224a6c64d21`

## Tasks

### Task 1 — Verify profile persistence and migration coverage

Files:

- `packages/shared/src/schemas.ts::ConnectionProfile`
- `internal/engines/registry.go::ConnProfile`
- `internal/store/profiles.go::ProfileForConnect`
- `internal/store/migrate.go::addColumn`, `::rebuildProfiles`
- `internal/store/profiles_test.go::TestProfileRootCACertRoundTrip`, `::TestProfileMigrationPreservesRootCACert` (new)

Interfaces: Consumes the existing `sslCaCert`/`SSLCACert` profile field and `ssl_ca_cert` column. Produces verified store behavior for the API, adapters, MCP paths, and UI; do not add a duplicate field or column.

Change: Confirm create, scan, update, and `ProfileForConnect` preserve the field. Add regression coverage for a non-empty PEM round trip, clearing to an empty PEM, upgrading a database without the column, and preserving a saved PEM through a profile-kind rebuild. Fix only a confirmed gap in the existing path.

Verify: `go test ./internal/store -run 'TestProfileRootCACertRoundTrip|TestProfileMigrationPreservesRootCACert'` — both tests pass, including preservation of unrelated profile data during migration.

Progress: done
Result: `go test ./internal/store -run 'TestProfileRootCACertRoundTrip|TestProfileMigrationPreservesRootCACert'` passed. The existing persistence path had no confirmed gap; regression tests cover create/list/connect/update, clearing, adding a missing column, and preserving saved CA plus unrelated profile fields through kind rebuilds. Corrected the shared type comment so an omitted CA follows the engine's TLS default.

### Task 2 — Add the shared TLS helper

Files:

- `internal/engines/tls.go::TLSConfig` (new)
- `internal/engines/tls_test.go::TestTLSConfigSSLOff`, `::TestTLSConfigVerifiesWithRootCA`, `::TestTLSConfigRejectsInvalidPEM`, `::TestTLSConfigNoPEM` (new)

Interfaces: Consumes `ConnProfile.SSL` and `ConnProfile.SSLCACert`. Produces `TLSConfig(cp ConnProfile, host string, verifyWithoutCA bool) (*tls.Config, error)` for Tasks 4–6.

Change: Return nil when SSL is off. With a PEM, build a root pool from it (error when no certificate parses) and return a config with `RootCAs` and `ServerName: host`. With no PEM, return `ServerName: host` using system roots when `verifyWithoutCA` is true, otherwise `InsecureSkipVerify: true` with a short comment naming the selected behavior.

Verify: `go test ./internal/engines -run 'TestTLSConfig'` — SSL off returns nil; a test TLS server handshake succeeds with the trusted PEM and host, fails with a different root, and fails on a host-name mismatch (this moves the checks from `postgres_test.go::TestPGTLSConfigVerifiesServer`); an invalid PEM errors; no PEM yields system-roots verification when `verifyWithoutCA` is true and skip-verify otherwise.

Progress: done
Result: `go test ./internal/engines -run 'TestTLSConfig'` passed (4 tests), including successful PEM trust, rejection of an unrelated CA and hostname mismatch, invalid PEM, SSL-off, system-root defaults, and skip-verify defaults. `go test ./internal/engines/postgres` also passed after moving its TLS handshake coverage into the shared helper tests.

### Task 3 — Pass Root CA through connection tests and the AI pgvector probe

Files:

- `internal/api/connections.go::connProfileFromInput`
- `internal/api/ai.go::resolvePostgresVectorPrompt`
- `internal/api/api_test.go::TestConnProfileFromInputPreservesRootCA`, `::TestUpdateConnectionAllowsRootCAChangeWithManagedAccount` (new)

Interfaces: Consumes the profile input/store contract from Task 1. Produces a complete `engines.ConnProfile` for unsaved test requests and for the pgvector probe.

Change: Copy the input Root CA into the temporary profile built by `connProfileFromInput`. Add `SSLCACert` to the hand-built profile in `resolvePostgresVectorPrompt`; without it a PEM profile fails verification and the probe error is swallowed. Leave the `UpdateConnection` protected-field list unchanged.

Verify: `go test ./internal/api -run 'TestConnProfileFromInputPreservesRootCA|TestUpdateConnectionAllowsRootCAChangeWithManagedAccount'` — the unsaved test profile carries the PEM, and a Root CA change succeeds while a managed MCP account exists, and a changed SSL toggle is still rejected.

Progress: done
Result: `go test ./internal/api -run 'TestConnProfileFromInputPreservesRootCA|TestUpdateConnectionAllowsRootCAChangeWithManagedAccount'` passed. Unsaved connection input and the AI pgvector probe now carry Root CA; an update with a managed account accepts CA changes, invalidates its cached connection, and still rejects SSL-toggle changes.

### Task 4 — Apply the shared TLS helper to PostgreSQL

Files:

- `internal/engines/postgres/postgres.go::pgTLSConfig` (remove), `::NewNotifyConn`, `::newAdapter`, `::TestPostgresConnection`
- `internal/engines/postgres/postgres_test.go::TestPGTLSConfigVerifiesServer` (remove, moved to Task 2), `::TestNewAdapterRejectsInvalidRootCA`, `::TestNewNotifyConnRejectsInvalidRootCA`, `::TestPostgresConnectionRejectsInvalidRootCA` (new)

Interfaces: Consumes `engines.TLSConfig` from Task 2. Produces consistent TLS behavior for pooled queries, notifications, connection tests, and the schema watcher.

Change: Replace the three `pgTLSConfig(host, nil)` call sites with `engines.TLSConfig(cp, host, true)` and return its error before dialing. Keep `Fallbacks = nil` at all three sites and leave SSL-off behavior unchanged.

Verify: `go test ./internal/engines/postgres -run 'TestNewAdapterRejectsInvalidRootCA|TestNewNotifyConnRejectsInvalidRootCA|TestPostgresConnectionRejectsInvalidRootCA'` and `go build ./...` — an invalid PEM fails before any dial and no `pgTLSConfig` source reference remains.

Progress: done
Result: The three invalid-PEM-before-dial tests passed, `go build ./...` succeeded, and FFF found no `pgTLSConfig` references in source. The helper now covers pooled queries, watcher notifications, and connection tests with system-root verification when the PEM is absent and TLS fallback disabled.

### Task 5 — Apply the shared TLS helper to MySQL and MariaDB

Files:

- `internal/engines/mysql/mysql.go::driverConfig`, `::openDB`, `::OpenDB`, `::TestMysqlConnection`
- `internal/engines/mysql/mysql_test.go::TestOpenDBTLSConfig` (new)

Interfaces: Consumes `engines.TLSConfig` from Task 2. Produces TLS-aware normal, connection-test, and MCP-provisioning database opening.

Change: Build the driver config once and set `Config.TLS` from `engines.TLSConfig(cp, host, false)`, which is `skip-verify` with no PEM. Open every connection through `mysqldrv.NewConnector` and `sql.OpenDB`, wrapping with `sessionInitConnector` only when a session timeout statement exists. Route `TestMysqlConnection` and the new exported `OpenDB(cp)` through the same path. Do not register a global TLS config. Remove the exported `DSN` once the provisioner no longer calls it (Task 7).

Verify: `go test ./internal/engines/mysql` — the config has no TLS with SSL off, skip-verify with SSL and no PEM, `RootCAs` plus the profile host as `ServerName` with a PEM, and an error for an invalid PEM; the existing session-timeout tests still pass.

Progress: done
Result: `go test ./internal/engines/mysql` passed (17 tests). Normal adapters and connection tests now use the per-profile connector path; SSL-off has no TLS config, no PEM retains skip-verify, PEM config sets the custom roots and host, and invalid PEM fails before opening a connection. Session timeout initialization remains wrapped only when configured; Task 7 moved MCP callers to `OpenDB` and removed the obsolete DSN builder.

### Task 6 — Apply the shared TLS helper to SQL Server

Files:

- `internal/engines/sqlserver/sqlserver.go::dsn`, `::OpenDB`, `::NewWithTimeout`, `::TestSqlServerConnection`
- `internal/engines/sqlserver/sqlserver_test.go::TestOpenDBTLS`, `::TestOpenDBPreservesConnectionTimeout` (new)

Interfaces: Consumes `engines.TLSConfig` from Task 2. Produces TLS-aware normal and test connections and an exported opener for MCP provisioning.

Change: With SSL off, keep the current DSN and `sql.Open` path unchanged. With SSL on, parse the DSN with `msdsn.Parse`, require encryption, set `TLSConfig` from `engines.TLSConfig(cp, host, false)`, and open through `mssql.NewConnectorConfig` and `sql.OpenDB`. Before relying on it, confirm in the go-mssqldb v1.11.2 source that a caller-set `TLSConfig` is honored. Each caller keeps its own `connection timeout`, including the 30-second provisioning value. Remove the exported `DSN` once the provisioner no longer calls it (Task 7).

Verify: `go test ./internal/engines/sqlserver -run 'TestOpenDBTLS|TestOpenDBPreservesConnectionTimeout'` — SSL off leaves the DSN identical to today's; SSL on without a PEM requires encryption and skips verification; a PEM sets `RootCAs` and the host; an invalid PEM errors; the `connection timeout` equals the value each caller passes (30 for provisioning).

Progress: done
Result: `go test ./internal/engines/sqlserver -run 'TestOpenDBTLS|TestOpenDBPreservesConnectionTimeout'` passed. SSL-off preserves the existing DSN/sql.Open path; SSL uses `msdsn.Parse`, required encryption, the shared TLS config, and `sql.OpenDB`; parsed timeouts remain intact. Confirmed in pinned go-mssqldb v1.11.2 source that `NewConnectorConfig` carries `msdsn.Config` through to the TDS TLS handshake, which reads `Config.TLSConfig`. Task 7 moved MCP callers to `OpenDB` and removed the obsolete exported DSN wrapper.

### Task 7 — Carry TLS settings through MCP provisioning and queries

Files:

- `internal/mcp/provisioner.go::sqlProfileFor` (new), `::adminSQLProfile`, `::mysqlAdminDB`, `::verifyMysqlAccount`, `::sqlServerAdminDB`, `::verifySqlServerAccount`
- `internal/mcp/manager.go::createSqlAdapter`
- `internal/mcp/root_ca_test.go::TestSQLProfileForCarriesRootCA`, `::TestProvisionTimeoutIs30Seconds` (new)

Interfaces: Consumes the openers from Tasks 5–6 and the profile field from Task 1. Produces TLS settings for provisioning, verification, revoke, and the read-only query adapter.

Change: Replace the six hand-built `engines.ConnProfile` literals with one `sqlProfileFor(profile, database, username, password)` that always copies Kind, Host, Port, SSL, and Root CA, including the SQL Server paths that omit SSL today. Open MySQL/MariaDB and SQL Server admin and verification connections with the new `OpenDB` helpers. PostgreSQL paths pick up the change through `NewNotifyConn`. Keep the 30-second provisioning timeout and existing MySQL session initialization.

Verify: `go test ./internal/mcp -run 'TestSQLProfileForCarriesRootCA|TestProvisionTimeoutIs30Seconds'` — every kind carries SSL and the PEM, and `provisionTimeout` is 30 seconds. `grep -n 'engines.ConnProfile{' internal/mcp/*.go` shows only `sqlProfileFor` outside tests, and no caller of the removed `DSN` exports remains.

Progress: done
Result: `go test ./internal/mcp -run 'TestSQLProfileForCarriesRootCA|TestProvisionTimeoutIs30Seconds'` passed. `sqlProfileFor` now supplies SSL and Root CA to PostgreSQL, MySQL/MariaDB, SQL Server provisioning and verification, and MCP read-only adapters. MySQL and SQL Server callers use their connector openers; SQL Server keeps `provisionTimeout`. FFF found the only `engines.ConnProfile` literal in `internal/mcp` inside `sqlProfileFor`; unused MySQL and SQL Server DSN exports were removed after the MCP callers moved to `OpenDB`.

### Task 8 — Expose SSL and Root CA in the connection dialog

Files:

- `apps/desktop/src/lib/constants.ts::SSL_KINDS`
- `apps/desktop/src/components/connection-dialog-fields.tsx::ConnectionDialogFields`
- `apps/desktop/src/components/connection-dialog.tsx::ConnectionDialog`
- `apps/desktop/src/components/connection-dialog-fields.test.tsx::Root CA form cases` (new)
- `apps/desktop/wailsjs/go/models.ts::store.Profile`

Interfaces: Consumes the existing shared `sslCaCert` profile shape and Go profile model. Produces a saved/editable Root CA form field for PostgreSQL, MySQL, MariaDB, and SQL Server.

Change: Build `SSL_KINDS` from the `KIND` constants and show the SSL checkbox for those kinds (today it renders only for PostgreSQL). When SSL is enabled, show a shadcn `Textarea` for the PEM and a file picker, following the existing file input in this component, that loads the file contents into the same form field. Preserve the PEM in create/edit defaults and update payloads, and keep it when SSL is unchecked. Regenerate Wails models from the Go profile type; do not hand-edit generated bindings.

Verify: Add desktop tests for kind-specific SSL visibility, conditional Root CA field visibility, edit-value retention, PEM retention after unchecking SSL, and file contents populating the field. Run `pnpm --dir apps/desktop test -- connection-dialog-fields.test.tsx`, `pnpm --dir apps/desktop exec tsc --noEmit`, and `wails generate module`; confirm `store.Profile` exposes `sslCaCert` in the generated model.

Progress: done
Result: `wails generate module`; `pnpm --dir apps/desktop test -- connection-dialog-fields.test.tsx` — 24 files/105 tests passed; `pnpm --dir packages/shared build`; `pnpm --dir apps/desktop exec tsc --noEmit` — passed. Generated `store.Profile` and `store.ProfileInput` expose `sslCaCert`.

### Task 9 — Update connection, engine, MCP, and release documentation

Files:

- `docs/llm/workflows/connections-and-workspace.md::Connection profiles`
- `docs/llm/architecture/engine-support.md::Supported engines and paths`
- `docs/llm/integrations/read-only-mcp.md::State changes`
- `CHANGELOG.md::Unreleased`

Interfaces: Consumes the verified behavior from Tasks 1–8. Produces user-facing TLS guidance and Unreleased entries.

Change: Document the per-engine no-PEM behavior (PostgreSQL verifies against system roots; MySQL/MariaDB and SQL Server encrypt without verification), chain/hostname verification against a supplied PEM, that the PEM stays local, and that `psql`, backup, and restore encrypt but do not verify and do not use the PEM. In `read-only-mcp.md` update the managed-account bullet that lists locked SSL settings to say the Root CA stays editable. In `CHANGELOG.md` amend the existing "PostgreSQL TLS verification" entry so it stays accurate with the Root CA option, and add an entry for the new Root CA option. Preserve the `WSP-preview-lifetime` and `ENG-duckdb-runtime` requirement blocks byte-for-byte.

Verify: Run `git diff --check`; inspect the three wiki-page diffs and confirm both requirement blocks are byte-for-byte unchanged. After all tasks, run `go test ./...`, `go build ./...`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; all must pass. Smoke-test a Root CA connection against the Docker PostgreSQL or SQL Server instance if a TLS-enabled one is available, and say so in the result if it is not.

Progress: done
Result: Wiki validator — 17 Markdown files/16 requirements, 0 errors and warnings; `git diff --check` passed; WSP/ENG requirement hashes unchanged. `go test ./...` — 266 tests/25 packages; `go build ./...`, `pnpm typecheck`, `pnpm test` — 24 files/105 tests, and `pnpm build` passed. No TLS-enabled Docker instance was available for smoke testing.

## Files inspected, no change

- `internal/engines/oracle/` and `internal/engines/clickhouse/` — TLS support for these engines is outside the approved scope.
- `internal/store/vault.go` — Root CA is public server-trust data, not a credential or client private key.
- `internal/engines/registry.go::SQLAdapter` — the existing adapter contract is sufficient; do not add a shared-interface method.
- `apps/desktop/src/lib/api.ts` — frontend calls continue through the existing Wails binding wrapper.
- `internal/api/terminal.go` and `internal/maintenance/pgtools.go` — `psql`, `pg_dump`, and `pg_restore` keep `sslmode=require` and ignore the PEM; documented as a limit in Task 9.
- `internal/schema/watcher.go` — builds its profile from `ProfileForConnect` and reaches the shared TLS path through `NewNotifyConn`.

## Approval Gate

Status: approved

## Decision Log

- 2026-10-17 — Material revision after code-path review and the user's confirmation: no PEM means encrypted TLS without server-certificate verification; a supplied PEM verifies the server; Root CA changes are locked while a managed MCP account exists. Added the MCP read-only query path and preserved provisioning timeout requirements. The prior legacy approval status is reset because this design and task breakdown have not yet been jointly presented for approval.
- 2026-10-17 — Second revision after plan review, confirmed by the user. (1) No PEM now keeps each engine's current TLS behavior; PostgreSQL stays verified against system roots, which reverses the earlier uniform no-verify rule so the Unreleased PostgreSQL verification hardening is not undone. (2) The managed-account Root CA lock is removed: revoke connects with the saved Root CA, so an expired certificate would otherwise deadlock. (3) Added the shared `engines.TLSConfig` helper, the AI pgvector `ConnProfile` call site, a single MCP `sqlProfileFor`, the SQL Server connector path (the DSN `certificate` parameter takes a file path), the psql/backup limit, and corrected the wiki and changelog targets. Approval stays pending until the revised files are jointly presented.
- 2026-10-17 — The user then instructed implementation of these current `design.md` and `tasks.md` files, approving the revised scope and behavior. This task file records the implementation results.
