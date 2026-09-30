# MCP-managed read-only database accounts

**Status:** Approved for planning; the implementation plan requires approval.

## Goal

Let users create a dedicated read-only database account from **API Settings → MCP**. MCP must authenticate to the database only with that account. The account's credentials live in the operating system Keychain; the local metadata SQLite database stores only an opaque Keychain reference and account state.

## Relationship to the existing MCP design

This extends the [Read-only Database MCP design](2026-09-30-read-only-database-mcp-design.md). It retains the listener, bearer token, supported tools, limits, clients, and SQLite read-only worker. It replaces the existing rule that MCP uses credentials from the selected connection profile and that KamehaDB does not provision database permissions.

## Scope

- Provision accounts for PostgreSQL, MySQL, MariaDB, SQL Server, and MongoDB.
- SQLite has no database account model; MCP continues to open its file read-only and shows that account provisioning is not applicable.
- The generated account is scoped to the database configured in the selected KamehaDB profile. Tools cannot use the managed MCP account to query a different database.
- No other engine, client, remote access, or database write capability is added.

## Approved design

### Provisioning and runtime identity

- API Settings → MCP offers **Create read-only account** for supported server-database profiles. The user initiates each provisioning operation and confirms its database scope before KamehaDB changes database security metadata.
- KamehaDB uses the profile's saved credentials only to create or revoke the dedicated account. Those credentials are never used by MCP query adapters.
- The generated account receives only database read privileges on the profile's configured database. It is not made an owner, administrator, or member of a write-capable role. MongoDB uses its database-scoped `read` role. SQLite continues using the existing read-only file adapter.
- The desktop creates a random opaque Keychain reference before preparation. KamehaDB derives a deterministic, engine-compatible database principal name from that reference; the generated credential bundle stores the same username plus its random password in Keychain. Revoke derives the exact principal name from the stored reference, so it can remove the account even if the Keychain item is missing.
- Account creation requires the saved profile account to have the engine privileges needed to create users and grant read access. Failure leaves MCP disabled for that profile and reports the failure; KamehaDB never falls back to the profile's original credentials.
- MCP can be enabled only after provisioning succeeds and the new credential is available from Keychain. Migration disables existing MCP-enabled server-database profiles that lack a managed credential, while preserving SQLite profiles because SQLite has no provisioned account.
- The MCP adapter manager uses the dedicated account's credentials for SQL and MongoDB. It rejects calls when that credential is missing or cannot be loaded. It never reads the profile password or MongoDB connection string as a fallback.
- Managed accounts are limited to the profile's configured database. MCP tools reject database arguments that differ from the profile database, and database-list tools expose only that database. The database grants remain the enforcement boundary for SQL statements that name another database directly.
- MongoDB provisioning first probes the same endpoint with credentials removed and runs `listCollections` against the configured database without `authorizedCollections` or `nameOnly`. Success means unauthenticated reads are allowed, so provisioning is refused. MongoDB `Unauthorized` (code 13) means access control is enforced; network and other errors fail closed as an inconclusive check. This uses the command's documented `listCollections` privilege requirement when access control is enforced ([MongoDB `listCollections` documentation](https://www.mongodb.com/docs/manual/reference/command/listcollections/)).

### Credential storage and sidecar access

- Store the generated read-only credential bundle (username/password or MongoDB URI) in the OS Keychain using the existing Tauri `keyring` commands.
- SQLite stores only the opaque Keychain reference and non-secret provisioning state. It does not store the generated username, password, MongoDB URI, or a copy of the credential bundle.
- Whenever the managed sidecar becomes ready, including after a restart, the desktop reads saved Keychain references, retrieves each credential from Keychain, and sends it to the sidecar through the existing authenticated local management API. A sidecar-ready event must trigger this same hydration path; it cannot depend on the desktop component mounting again. The sidecar keeps credentials in process memory only; they are not persisted or logged. Replacing or clearing a hydrated credential invalidates the profile's cached MCP adapter.
- If Keychain access fails or a reference is missing, that MCP profile returns a stable credential-unavailable error. The desktop shows the unavailable state and does not use the normal profile credentials.
- Revoke does not require the managed password from Keychain: the sidecar derives the generated principal name from the metadata reference and uses the saved profile credential to drop only that principal. A missing Keychain item therefore prevents MCP queries but does not strand the database account.
- This change does not migrate or encrypt existing regular connection-profile passwords, which currently remain in the metadata database.
- Generated credentials pass briefly through desktop JavaScript from prepare to Keychain and then from Keychain to the authenticated sidecar hydration request. The later provision request carries only the opaque reference. Keep secrets in short-lived local variables; do not put them in React state, React Query caches, logs, URLs, or clipboard.

### Account lifecycle

- Turning MCP off closes the MCP adapter but keeps the provisioned database account and Keychain credential so the user can enable it again.
- **Revoke** is an explicit operation. It disables MCP first and closes the adapter. If provisioning reached the database, it asks the database to drop the generated account and deletes the Keychain item and SQLite reference only after database revocation succeeds. If the state is only `prepared`, it discards the unused item after the sidecar confirms no database write started.
- If revoke fails, MCP stays disabled and the account state, opaque reference, and any existing Keychain item remain so the user can retry. Errors and logs do not contain credentials.
- While a managed account exists, changes to the profile's database target, saved provisioning username/password, and deletion of the profile are blocked until the user revokes the account. This preserves the connection details and authorization needed to revoke it; the privileged profile credential is not copied to Keychain.
- The desktop supplies an opaque Keychain reference when it asks the sidecar to prepare credentials. The sidecar first records `prepared`, then returns the generated bundle. The desktop stores it in Keychain and hydrates it into sidecar memory before requesting provisioning. The sidecar changes state to `provisioning` immediately before the first database write.
- If account creation partially succeeds and a later step fails, KamehaDB attempts to remove the database account. If cleanup also fails, it retains the Keychain reference and a recoverable state for explicit revoke; it does not enable MCP.
- If the app or sidecar stops while the state is `provisioning`, startup changes it to `recovery_required`, keeps MCP disabled, and retains the Keychain reference. The UI offers explicit Revoke; startup does not silently change database grants. If the state is only `prepared`, no database write has started, so explicit Revoke discards the pending Keychain item without connecting to the database. A missing account is treated as a successful no-op during exact-principal revoke.

## Acceptance criteria

1. A user can create a read-only account for a supported server database from MCP Settings using the saved profile as the provisioning connection.
2. The account has read permissions only for the configured database; it cannot write, create, or drop application data.
3. MCP identifies itself to the database as the dedicated generated account. Tests or live checks verify the database principal, and attempts to write are rejected by the database.
4. The managed credential exists only in OS Keychain at rest. SQLite and API responses contain only its reference/state; logs and error messages contain no credential.
5. On restart, the desktop restores credentials from Keychain to the sidecar. Missing Keychain credentials make MCP fail closed without using the saved profile account.
6. Turning MCP off retains the account. Explicit Revoke removes it and deletes the Keychain item only after database revocation succeeds.
7. Profile database-target and provisioning-credential edits, plus profile deletion, are rejected while a managed account exists; they become available after Revoke.
8. Existing MCP-enabled server-database profiles without managed accounts are disabled during migration; SQLite MCP settings remain enabled and continue using the read-only worker.
9. SQLite remains available through its existing `readonly: true` adapter and does not offer user provisioning.
10. MongoDB account provisioning is refused when a credential-free `listCollections` probe succeeds, and fails closed when the probe returns an error other than MongoDB Unauthorized (code 13).
11. An interrupted `provisioning` state becomes `recovery_required` on startup, stays disabled, and can be cleared only by the user's explicit Revoke action.
12. Revoke can drop the exact generated principal using the opaque metadata reference even when its Keychain item is missing; MCP querying remains unavailable until the secret is restored.
13. A `prepared` state interrupted before database writes can be discarded by explicit Revoke without a database connection.

### Provisioning state shown in MCP Settings

| Persisted/runtime state                          | User-visible state                   |
| ------------------------------------------------ | ------------------------------------ |
| No managed-account record                        | Not configured                       |
| `prepared`                                       | Setup incomplete — Revoke to discard |
| `provisioning`                                   | Setting up                           |
| `recovery_required`                              | Setup interrupted — Revoke required  |
| `ready` with hydrated Keychain secret            | Ready                                |
| `ready` with missing/unavailable Keychain secret | Keychain unavailable                 |
| `revoke_failed`                                  | Revoke failed                        |

SQLite keeps its existing read-only status and shows that account provisioning does not apply.

### Development limitation

The browser-only Vite runtime cannot call Tauri Keychain commands. Unit/component tests mock the Keychain bridge; provisioning end-to-end checks require a Tauri runtime or packaged desktop app.

## Decision log

- User chose OS Keychain for the managed MCP credential bundle; SQLite stores only an opaque reference.
- User chose to retain the provisioned account when MCP is disabled and revoke it only after an explicit **Revoke** action.
- User chose to require **Revoke** before changing a profile's database target or deleting that profile.
- Preserve SQLite MCP during migration because its existing file adapter is already read-only and has no database account.
- Detect MongoDB access control with an unauthenticated `listCollections` probe; only MongoDB Unauthorized (code 13) proves that the probe was denied by access control.
- Do not retain a copy of the privileged provisioning credential in Keychain. Block app-side edits to the profile target and saved provisioning username/password while its managed account exists.
- Derive the generated database principal name from the opaque Keychain reference so a missing Keychain item does not prevent explicit account revocation.
- Keep generated credentials in `prepared` state until the sidecar has hydrated them, then enter `provisioning` immediately before any database writes. Recover interrupted database provisioning to explicit `recovery_required`; do not auto-revoke because database account removal requires the user's explicit action.

## Base design

- [Read-only Database MCP design](2026-09-30-read-only-database-mcp-design.md)

## Execution

- [MCP-managed read-only database accounts implementation plan](../plans/2026-09-30-mcp-managed-readonly-accounts-plan.md)

## Related context

- [[integrations/read-only-mcp|Read-only MCP server]]
