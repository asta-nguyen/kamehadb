# Connection Root CA and TLS Mode

## Goal

Complete optional Root CA support for PostgreSQL, MySQL/MariaDB, and SQL Server
connection profiles. The `sslCaCert` field, Go profile field, SQLite column, and
profile migration are already present on the current baseline; this change wires
the field through connection testing, TLS setup, managed MCP connections, and the
desktop UI, and adds regression coverage for the existing persistence path.

## Decisions

- **SSL off:** preserve each engine's current connection behavior.
- **SSL on, no PEM:** keep each engine's current TLS behavior, so nothing that
  works or verifies today changes:
  - PostgreSQL verifies the server certificate chain and hostname against the
    system roots, with no plaintext fallback (the verified behavior already in
    the Unreleased changelog).
  - MySQL/MariaDB encrypts without verifying (`skip-verify`, as today).
  - SQL Server encrypts without verifying. SSL is ignored by SQL Server today, so
    this is the behavior of the new option, not a change.
- **SSL on, PEM supplied:** every in-scope engine verifies the server certificate
  chain and hostname against the supplied PEM only. An invalid PEM or a failed
  handshake returns an error before or during the dial and never retries
  without TLS. The PEM is used locally and never sent to the server.
- **Managed MCP account:** Root CA stays editable. It is client-side trust data
  and does not change the account's identity, and a lock would deadlock the
  common expired-certificate case because revoke connects with the saved Root CA.
  The existing locks on kind, target, credentials, and the SSL toggle are
  unchanged. A profile update already invalidates the cached MCP adapter, so a
  changed Root CA takes effect on the next MCP call.
- **Profile storage:** Root CA PEM is public trust data, stored with the profile
  in local metadata SQLite rather than in the credential vault. It is not a
  client certificate or private key.
- **Scope:** expose SSL and Root CA controls for PostgreSQL, MySQL, MariaDB, and
  SQL Server. Oracle and ClickHouse TLS configuration, a mode selector, and
  client-certificate/mTLS support are out of scope. The embedded `psql` shell and
  `pg_dump`/`pg_restore` keep `sslmode=require` (encrypted, not verified) and do
  not use the PEM.

## Design

1. **Profile contract and persistence:** keep the existing `sslCaCert` shared
   schema, `ConnProfile.SSLCACert`, profile storage, and SQLite migration as the
   single source of truth. Add coverage for profile round trips, clearing the
   field, old-schema migration, and profile-kind rebuilds so migration cannot
   discard a saved CA.
2. **Shared TLS helper:** one `engines.TLSConfig(cp, host, verifyWithoutCA)`
   returns nil when SSL is off, a PEM-rooted verifying config when a PEM is
   supplied (error on an invalid PEM), and otherwise a config that verifies
   against system roots or skips verification according to `verifyWithoutCA`.
   All three engines use it, so PEM parsing and the verification rules exist once.
   The shared `SQLAdapter` contract is untouched.
3. **Connection API:** pass `SSLCACert` from unsaved profile input through
   `TestConnection`. The AI pgvector probe builds its own `ConnProfile` and must
   also carry `SSLCACert`, otherwise a PEM profile fails verification there and
   the error is silently swallowed. Do not add Root CA to the managed-account
   protected fields.
4. **PostgreSQL:** replace `pgTLSConfig` with the helper (`verifyWithoutCA`
   true) at the pooled, notification, and test connection sites; keep TLS
   fallback disabled.
5. **MySQL/MariaDB:** set the driver `Config.TLS` from the helper
   (`verifyWithoutCA` false, which is `skip-verify` with no PEM) and open every
   connection through the driver connector, with the MCP session-timeout
   wrapper applied only when a timeout is configured. No global TLS
   registration. Export one opener for MCP provisioning in place of the DSN
   string.
6. **SQL Server:** SSL off keeps the current DSN and `sql.Open` path. SSL on
   parses the DSN, requires encryption, sets `TLSConfig` from the helper, and
   opens through the connector. The DSN `certificate` parameter takes a file
   path, so a PEM cannot be passed through the DSN. Each caller keeps its own
   connection timeout, including the 30-second MCP provisioning timeout. Export
   one opener for MCP provisioning in place of the DSN string.
7. **MCP connections:** the six hand-built SQL `ConnProfile` literals in
   `internal/mcp` become one `sqlProfileFor` helper that always carries SSL and
   Root CA (the SQL Server literals omit SSL today). Provisioning, verification,
   and the read-only query adapter all use it; MySQL and SQL Server admin and
   verification connections use the new openers; PostgreSQL paths pick the
   change up through `NewNotifyConn`.
8. **Desktop UI:** expose the SSL checkbox for the four in-scope kinds (today it
   is PostgreSQL only) and show a Root CA PEM textarea and file picker while SSL
   is enabled. Unchecking SSL keeps the entered PEM in the form and on save but
   it is ignored while SSL is off. Regenerate Wails models from the Go profile
   type.
9. **Documentation:** describe the per-engine no-PEM behavior, PEM verification,
   the editable Root CA, and the `psql`/backup limit in the connection,
   engine-support, and read-only MCP wiki pages; amend the existing
   Unreleased "PostgreSQL TLS verification" entry and add a Root CA entry. No
   requirement-format wiki block owns this behavior, so no `delta.md` is needed.

## Scope

- Do not add an `sslmode` selector, client certificate/private-key support,
  Oracle or ClickHouse TLS work, or a new credential-vault path.
- Do not change the shared `SQLAdapter` interface or add an external API.
- Reuse the existing profile fields and migration; do not add a duplicate CA
  column or shared field.

## Risks

- MySQL/MariaDB and SQL Server with SSL on and no PEM encrypt traffic but do not
  authenticate the server, so they are open to server impersonation. For MySQL
  this is the existing behavior; supplying a trusted Root CA enables
  verification.
- PostgreSQL with SSL on and a self-signed or private-CA server still fails
  until the user supplies that CA, as it does today. The Root CA field is the fix.
- A saved PEM is present in the local metadata database and its backups. It is
  public certificate material, not a secret or client-auth credential.
- An incorrect or outdated PEM makes verified connections fail, including MCP
  queries, until it is corrected; the user can correct it without revoking the
  managed account.
- `psql`, backup, and restore encrypt but do not verify the server and do not use
  the PEM, so a verified GUI connection does not imply a verified shell.

## Relevant Context

- [Connections and workspace](../../../../llm/workflows/connections-and-workspace.md)
- [Engine support](../../../../llm/architecture/engine-support.md)
- [Read-only MCP server](../../../../llm/integrations/read-only-mcp.md)
- [Review feedback hardening design](../2026-10-16-review-feedback-hardening/design.md)

## Task breakdown

- [Current implementation tasks](tasks.md)
- [Legacy plan pointer](../../../plans/2026-10-16-connection-root-ca-plan.md)

## Wiki Delta

No requirement delta applies. The relevant behavior is documented in existing
business-rule sections, and no requirement ID owns connection TLS behavior.
