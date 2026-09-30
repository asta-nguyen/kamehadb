# MCP-managed read-only database accounts — Implementation Plan

## Approved design

[MCP-managed read-only database accounts design](../specs/2026-09-30-mcp-managed-readonly-accounts-design.md)

## Global Constraints

- Support account provisioning only for PostgreSQL, MySQL, MariaDB, SQL Server, and MongoDB. SQLite continues using its existing read-only worker and has no provisioned database account.
- Provision a dedicated account scoped to the database configured in the selected KamehaDB profile. MCP database arguments outside that scope are rejected, and database-list tools expose only the configured database.
- Use the saved profile credential only for explicit account provisioning and revoke operations. MCP query adapters must use only the managed read-only credential and must fail closed if it is unavailable.
- Store the complete managed credential bundle in OS Keychain. SQLite stores only a Keychain reference and non-secret state; the sidecar may hold the credential only in process memory.
- Disabling MCP retains the provisioned account. Revoke is explicit, disables MCP first, and removes the Keychain item only after database revocation succeeds. Target edits, provisioning username/password edits, and profile deletion require Revoke first.
- Do not migrate regular connection-profile passwords in this change. Do not add a new dependency; reuse the existing Tauri `keyring` commands and installed database drivers.

## Tasks

### Task 1 — Add managed-account state and fail-closed profile contracts

Depends on: None.

Files:

- `packages/shared/src/schemas.ts` and `packages/shared/src/types.ts` — add the safe provisioning-state response and account-operation request schemas.
- `apps/sidecar/src/db/metadata-store.ts:67-130,404-535` — add the credential-reference store and migration.
- `apps/sidecar/src/db/metadata-store.test.ts` — extend migration and persistence coverage.
- `apps/sidecar/src/mcp/adapter-manager.ts:1-100` — stop using profile credentials for MCP adapter creation.
- `apps/sidecar/src/mcp/errors.ts` — add stable managed-credential-unavailable and account-state errors.

Interfaces:

- Persist `profile_id`, opaque `keychain_ref`, and a state (`prepared`, `provisioning`, `recovery_required`, `ready`, or `revoke_failed`) in a dedicated metadata table. Do not persist the generated username, password, MongoDB URI, or credential bundle.
- Export metadata operations to start/complete/mark-failed/clear managed account state and query references for desktop Keychain hydration.
- MCP adapter creation consumes only the in-memory managed credential supplied to the manager. An absent credential rejects the call before any adapter is created.

Change:

1. Add the new metadata table through the existing manual migration pattern.
2. Disable only existing `mcp_enabled` server-database profiles with no managed-account row; preserve SQLite MCP settings because SQLite has no account model and already uses its read-only worker.
3. Require a `ready` managed-account row before enabling MCP for server-database profiles. Keep SQLite governed by its existing read-only adapter.
4. Add a fail-closed manager path that does not call `getProfilePassword` or use `profile.connectionString` to create MCP adapters.
5. During metadata startup, transition stale `provisioning` rows to `recovery_required`; leave MCP disabled and retain the Keychain reference so the user can explicitly revoke a possibly-created account. Keep `prepared` rows distinct because no database write has started.
6. Keep all account state responses credential-free and expose only profile ID, status, and safe database summary.

Verify:

- Run the sidecar metadata and adapter-manager tests. Assert that legacy enabled server-database profiles become disabled while enabled SQLite profiles stay enabled, credential references survive metadata-store reopen, and an MCP call with no loaded managed credential is rejected without constructing an adapter.
- Run `pnpm typecheck` for the shared contract, `pnpm --filter @kamehadb/sidecar build`, and `pnpm --filter @kamehadb/desktop exec tsc --noEmit`; the root typecheck script does not typecheck the sidecar or desktop consumers.

Files inspected, no change:

- `apps/sidecar/src/db/metadata-store.ts:67-130,409-434` — profiles and MCP settings use the local SQLite metadata store; profile passwords are read directly from `connection_profiles.password`.
- `apps/sidecar/src/mcp/adapter-manager.ts:21-72` — MCP currently builds SQL adapters from the profile password and Mongo adapters from the profile connection string.
- `apps/desktop/src-tauri/src/lib.rs:443-466` — generic Keychain store/get/delete commands already use the Rust `keyring` crate.

### Task 2 — Provision and revoke database read-only accounts

Depends on: Task 1.

Files:

- `apps/sidecar/src/mcp/account-provisioner.ts` — new engine-specific create/revoke operations using installed drivers, including an unauthenticated MongoDB access-control probe.
- `apps/sidecar/src/mcp/account-provisioner.test.ts` — new SQL/grant and failure-cleanup coverage.
- `apps/sidecar/src/adapters/postgres.ts`, `mysql.ts`, `sqlserver.ts`, and `mongodb.ts` — change only if an existing adapter needs a narrow reusable connection helper.
- `docker-init/MCP-READONLY.md` and existing per-engine fixture scripts — align repeatable local verification with the app-managed grant scope.

Interfaces:

- `prepareMcpAccount(profile, keychainRef)` derives an engine-compatible username from the opaque reference and creates a strong password/URI without changing the database. Use the same derived name for the lifetime of that reference.
- `provisionMcpAccount(profile, adminCredential, generatedCredential)` creates the account, grants read-only access to the configured database, verifies login identity and grant behavior, and returns no secret-bearing error text.
- `revokeMcpAccount(profile, adminCredential, keychainRef)` derives and drops only the generated principal for that profile; revocation does not require the generated secret to be present in Keychain.
- Before MongoDB provisioning, create a separate client with all credentials removed but the same endpoint/TLS settings and run `listCollections` on the configured database without `authorizedCollections` or `nameOnly`. A successful result proves that unauthenticated reads are allowed and provisioning is rejected; MongoDB Unauthorized (code 13) proves access control denied the request; network and all other errors fail closed as inconclusive. The command requires the `listCollections` action when access control is enforced ([MongoDB documentation](https://www.mongodb.com/docs/manual/reference/command/listcollections/)).
- PostgreSQL/MySQL/MariaDB/SQL Server use their existing installed drivers; MongoDB uses the existing MongoDB driver. No new package is introduced.

Change:

1. Derive a unique engine-compatible principal name from the desktop-generated opaque Keychain reference using a stable hash and engine-specific prefix/length limits. Do not accept arbitrary role names or SQL identifiers from the user. Persist `provisioning` immediately before the first database write so startup can distinguish a possibly-created account from a prepared-but-unused credential.
2. Grant only selected-database read permissions: PostgreSQL connect/schema/table SELECT privileges, MySQL/MariaDB SELECT on the configured database, SQL Server `db_datareader` only in the configured database, and MongoDB's `read` role only in the configured database.
3. Preserve the existing database/application data. The only database writes are account and privilege metadata required for provisioning or explicit revocation.
4. Reject SQLite provisioning requests and MongoDB instances where the credential-free `listCollections` probe succeeds or returns an inconclusive error.
5. Compensate for partial provisioning failures by removing the newly created principal. If compensation fails, leave a recoverable managed-account state for explicit Revoke and keep MCP disabled.
6. Revoke only the exact generated principal. Do not revoke it automatically when MCP is disabled.

Verify:

- Run sidecar account-provisioner tests for deterministic identifier derivation, identifier escaping, generated credentials, scoped grants, duplicate/permission failures, partial-failure cleanup, and exact-principal revocation with and without the Keychain secret.
- Use live PostgreSQL, MySQL, MariaDB, and auth-enabled MongoDB instances to verify the generated account can read the configured database and server-side write attempts are rejected. Verify the MongoDB probe rejects an auth-disabled instance and accepts an Unauthorized response from an auth-enabled instance. Run the SQL Server script against an external SQL Server instance because the repository Compose file has no SQL Server service.

Files inspected, no change:

- `docker-init/MCP-READONLY.md` and its linked SQL/Mongo scripts — existing fixtures already create read-only principals for verification.
- `apps/sidecar/src/adapters/mongodb.ts` — the existing adapter exposes the underlying read operations but MCP must use the new generated credential.
- `apps/sidecar/package.json` — the required PostgreSQL, MySQL, SQL Server, and MongoDB drivers are already installed.

### Task 3 — Add sidecar credential hydration and managed-account routes

Depends on: Tasks 1 and 2.

Files:

- `apps/sidecar/src/mcp/adapter-manager.ts` — hold hydrated credentials in memory and pass them to SQL/Mongo adapter factories.
- `apps/sidecar/src/mcp/adapters/factory.ts` — accept an explicit managed credential bundle and enforce the configured-database scope.
- `apps/sidecar/src/mcp/types.ts` — update the MCP adapter/factory contract for explicit managed credentials and database scope.
- `apps/sidecar/src/mcp/tools.ts` — reject out-of-scope database arguments and make SQL/Mongo database-list tools return only the configured database.
- `apps/sidecar/src/routes/mcp-settings.ts` — add internal authenticated prepare/provision/revoke/reference/hydration endpoints.
- `apps/sidecar/src/routes/connections.ts:395-470` — prevent database-target or saved provisioning username/password edits and profile deletion until Revoke.
- `apps/sidecar/src/routes/mcp-settings.test.ts` and `apps/sidecar/src/routes/connections.test.ts` — cover authorization boundaries, state changes, and credential non-leak.

Interfaces:

- `GET /mcp/credential-refs` returns only profile IDs and Keychain references for `prepared`, ready, `recovery_required`, or `revoke_failed` accounts.
- `PUT /mcp/credentials/:profileId` accepts the matching managed credential bundle over the existing sidecar-authenticated management API and places it in process memory; it never writes the request body to SQLite or logs. Replacing or clearing the in-memory credential invalidates the profile's cached MCP adapter.
- `POST /mcp/profiles/:profileId/account/prepare` accepts a desktop-generated opaque Keychain reference, records `prepared`, derives the stable database principal name from the reference, and only then returns a one-time generated credential bundle.
- The desktop stores the bundle in Keychain and sends it to `PUT /mcp/credentials/:profileId`. `POST /mcp/profiles/:profileId/account/provision` accepts only the reference, requires the credential to be hydrated in memory, records `provisioning` immediately before database writes, verifies the database account, then marks it ready.
- `POST /mcp/profiles/:profileId/account/revoke` disables MCP and closes the adapter. For `prepared`, it clears the unused metadata without database calls; for any state where database writes may have begun, it derives and revokes the exact principal from the opaque reference, even if Keychain hydration failed. It clears metadata and in-memory credentials only after cleanup succeeds.

Change:

1. Authenticate all new routes with the existing sidecar token; do not mount them on the public MCP listener.
2. Never log request bodies for credential routes. Sanitize all database driver errors before returning them.
3. Reject `mcpEnabled: true` until the account state is ready and the credential is hydrated. Return a stable unavailable error when Keychain load fails.
4. In `tools.ts`, reject SQL/Mongo database arguments that differ from the profile's configured database and have both database-list tools expose only that database. Continue relying on server-side grants to block cross-database SQL embedded in a query string.
5. On revoke failure, keep the Keychain reference and state for retry and leave MCP disabled. Do not delete the Keychain entry until database revocation succeeds; an unused `prepared` credential may be discarded only after the sidecar confirms no database operation began. Revoke uses the derived principal name, so it remains available when the Keychain item is missing.
6. Reject edits that change the profile kind, endpoint, database/file path, Mongo connection string, or saved provisioning username/password, and reject profile deletion while a managed account exists. Allow them after explicit Revoke. Do not save a copy of the privileged provisioning credential in Keychain.

Verify:

- Run route, tool, and manager tests for SQLite-preserving migration; prepared/provisioning/ready/recovery-required/revoke-failed transitions; crash recovery; unhydrated/replaced credentials; forbidden cross-database arguments; database-list filtering; no fallback to profile credentials; credential-free responses/logs; and blocked target/username/password edits and profile deletion.
- Run `pnpm --filter @kamehadb/sidecar build` and `pnpm --filter @kamehadb/sidecar lint`.

Files inspected, no change:

- `apps/sidecar/src/routes/mcp-settings.ts` — current routes are mounted on the internal Hono listener, separate from MCP transport.
- `apps/sidecar/src/routes/connections.ts:395-470` — connection update/delete and MCP toggle lifecycle live together and invalidate cached adapters.

### Task 4 — Connect the Tauri Keychain and sidecar startup flow

Depends on: Tasks 1 and 3.

Files:

- `apps/desktop/src/hooks/use-sidecar.ts:25-68` — hydrate managed credentials after the sidecar health check.
- `apps/desktop/src-tauri/src/lib.rs` — emit a `sidecar-ready` event with the existing `SidecarInfo` whenever the managed child process is spawned/restarted; it contains the sidecar API connection info but no managed database credential.
- `apps/desktop/src/lib/tauri.ts:15-22` — reuse `invokeTauri` for existing Rust Keychain commands.
- `apps/desktop/src/lib/api.ts` — add credential-reference, hydration, prepare, provision, and revoke requests.
- `apps/sidecar/src/mcp/adapter-manager.ts` and `apps/sidecar/src/routes/mcp-settings.ts` — keep restored credentials in memory and reject missing Keychain values.
- `apps/desktop/src/hooks/use-sidecar.test.ts` — add startup hydration behavior coverage.

Interfaces:

- The desktop uses `store_credential`, `get_credential`, and `delete_credential` with a fixed KamehaDB service name and the persisted opaque reference as the Keychain account. Revoke may proceed without a Keychain item because the sidecar derives the database principal name from that reference.
- Subscribe to `sidecar-ready` before starting the initial sidecar. A shared ready handler updates the sidecar API base, waits for health, and calls `hydrateMcpCredentials()` for both the initial command result and later restart events. Deduplicate the initial result/event by child PID so one process generation hydrates once. The desktop retrieves each reference and sends the credential bundle through `PUT /mcp/credentials/:profileId`; successful hydration is acknowledged without returning the secret.

Change:

1. Generate the opaque Keychain reference, ask the sidecar to record `prepared` and return the generated bundle, store the bundle in Keychain, hydrate it through `PUT /mcp/credentials/:profileId`, then request provisioning with only the reference. If provisioning fails and the database account is cleanly rolled back, delete the Keychain item; retain it when cleanup fails so explicit Revoke remains possible.
2. On every sidecar-ready event, hydrate stored references after health succeeds. A Keychain error marks that profile unavailable without blocking the normal KamehaDB workspace and without sending its saved profile password to MCP. Revoke stays available because the principal name is derived from the persisted reference.
3. Keep generated credential values in short-lived local variables while passing prepare output to Keychain and the authenticated hydration request. The provision request carries only the reference. Never put credentials in React component state, React Query caches, logs, clipboard, or URLs.
4. Mock Tauri Keychain commands in unit/component tests. Browser-only Vite mode (`pnpm dev:desktop`) cannot provision accounts; end-to-end Keychain verification requires a Tauri runtime or packaged desktop app.

Verify:

- Run desktop hook tests for initial and restart-event hydration, repeated hydration, missing Keychain entries, sidecar failures, mocked browser-only Keychain behavior, and no fallback behavior.
- Run the desktop TypeScript build and `cargo test --quiet` in `apps/desktop/src-tauri` to verify the existing Keychain commands remain callable.

Files inspected, no change:

- `apps/desktop/src/hooks/use-sidecar.ts:25-68` — Tauri starts the sidecar, sets its authenticated API base, waits for health, then marks it ready.
- `apps/desktop/src-tauri/src/lib.rs:443-466` — Keychain commands already store, retrieve, and delete string credentials.

### Task 5 — Add provisioning and revoke controls to MCP Settings

Depends on: Tasks 1-4.

Files:

- `apps/desktop/src/components/mcp-settings-section.tsx` — show provisioning state and account actions beside each supported profile.
- `apps/desktop/src/components/connection-dialog.tsx` — surface the API's Revoke-first error when a user edits a profile with a managed account.
- `apps/desktop/src/components/sidebar.tsx` — keep the delete confirmation open and surface the API's Revoke-first error if deletion is blocked.
- `apps/desktop/src/hooks/use-mcp-settings.ts` — add create/revoke mutations and refresh profile/account state.
- `apps/desktop/src/lib/api.ts` — expose the account management calls defined in Task 3.
- `apps/desktop/src/components/mcp-settings-section.test.tsx` — cover user-visible create, enable, disable, and revoke states.

Interfaces:

- Map persisted/runtime states to UI explicitly: no record → `Not configured`; `prepared` → `Setup incomplete — Revoke to discard`; `provisioning` → `Setting up`; `recovery_required` → `Setup interrupted — Revoke required`; hydrated `ready` → `Ready`; `ready` with a missing Keychain secret → `Keychain unavailable`; `revoke_failed` → `Revoke failed`.
- The MCP toggle is disabled until provisioning is ready. **Create read-only account** confirms the selected database and grants before invoking provisioning. **Revoke** is explicit and disables MCP before attempting revocation.
- SQLite shows that it uses a read-only file connection and offers no account controls.

Change:

1. Replace the current instruction to make a separate database profile with an app-managed account setup flow.
2. Keep the existing endpoint, token, port, Retry, client snippets, and English UI copy unchanged except for updated guidance about account provisioning.
3. Display clear errors when the profile credentials cannot create a database user, Keychain is unavailable, MongoDB access-control probing finds unauthenticated reads or is inconclusive, or revoke fails. Keep Revoke available if Keychain is unavailable. Surface the Revoke-first API response when profile credentials/target or profile deletion are blocked. Never offer the normal saved account as an MCP fallback.
4. Explain that turning the MCP toggle off retains the account; use **Revoke** to remove the database account and Keychain item.

Verify:

- Run desktop component tests and build. Confirm the screen never renders a password or credential bundle and profile toggles cannot be enabled before the Keychain credential is ready. Confirm SQLite remains enabled through migration and retains its no-account read-only status.

Files inspected, no change:

- `apps/desktop/src/components/mcp-settings-section.tsx` — current API Settings section owns profile toggles and English MCP setup copy.
- `apps/desktop/src/hooks/use-mcp-settings.ts` — existing mutations invalidate both MCP settings and connection profile queries.

### Task 6 — Update user and product documentation

Depends on: Task 5.

Files:

- `CHANGELOG.md` — record managed account provisioning and Keychain storage under Unreleased.
- `README.md` — explain account creation, selected-database scope, Keychain storage, and explicit Revoke.
- `docs/llm/integrations/read-only-mcp.md` — replace claims that MCP uses profile credentials and never manages grants with source-verified behavior after implementation.
- `docker-init/MCP-READONLY.md` — distinguish test fixtures from app-managed provisioning and retain manual verification instructions.
- `landing/src/components/home-view.tsx`, `landing/src/app/layout.tsx`, `landing/src/app/opengraph-image.tsx`, `landing/scripts/render-og-animated.mjs`, and `landing/public/og-animated.gif` — keep MCP feature copy and generated metadata aligned with the updated setup flow.

Interfaces:

- Documentation describes the same account setup, scope, Keychain and revoke behavior exposed by the UI; it does not claim that normal connection-profile passwords are encrypted.

Change:

1. Update the existing read-only MCP wiki page only after verifying the corresponding source paths and tests.
2. Keep the marketing page's supported-engine/client list consistent with the approved MCP design. Regenerate the animated OG asset with the existing renderer if its source changes.

Verify:

- Run `pnpm build`, `npm --prefix landing run lint`, and `npm --prefix landing run build`; verify internal wiki links and all process-artifact links resolve.

Files inspected, no change:

- `docs/llm/AGENTS.md`, `docs/llm/INDEX.md`, and `docs/llm/integrations/read-only-mcp.md` — the wiki records current verified MCP behavior and must be refreshed after implementation.
- `AGENTS.md:194-216` — material product changes require landing metadata, Open Graph, and README surfaces to be checked together.

### Task 7 — Verify security and packaged lifecycle

Depends on: Tasks 1-6.

Files:

- `apps/sidecar/src/mcp/account-provisioner.test.ts`
- `apps/sidecar/src/mcp/adapter-manager.test.ts`
- `apps/sidecar/src/routes/mcp-settings.test.ts`
- `apps/sidecar/src/routes/connections.test.ts`
- `apps/desktop/src/hooks/use-sidecar.test.ts`
- `apps/desktop/src/components/mcp-settings-section.test.tsx`
- `apps/desktop/src-tauri/src/lib.rs` — verify sidecar-ready event behavior and existing Keychain commands.

Interfaces:

- Exercise database provision/revoke through authenticated management routes, Keychain storage through Tauri commands, credential hydration, and the existing MCP Streamable HTTP client protocol.

Change:

1. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm --filter @kamehadb/sidecar bundle:tauri`, and `pnpm --filter @kamehadb/desktop tauri build`.
2. Verify generated PostgreSQL/MySQL/MariaDB/SQL Server/MongoDB identities can read only the selected database and that direct write attempts are rejected by each database.
3. Verify SQLite remains file-read-only; MongoDB provisioning fails without server authorization; permission failures never enable MCP or fall back to profile credentials.
4. Verify startup/restart-event hydration, missing Keychain entry, prepared-state discard, explicit revoke success/failure with and without Keychain, re-enable after disable, interrupted provisioning recovery, blocked profile target/username/password edits/deletion, server-only migration with SQLite preserved, MCP token auth, database-list scoping, and credential redaction.
5. Verify the compiled desktop bundle retains the existing Keychain support and the MCP transport still uses the current Codex, Claude Code, Devin CLI, and OpenCode snippets.

Verify:

- Every listed command exits successfully. Live database permission checks pass for engines with available services. SQL Server requires an external instance; MongoDB must run with authorization enabled. Record either live evidence or a specific verification limitation for each.

Files inspected, no change:

- `apps/desktop/src-tauri/Cargo.toml` — the Tauri app already depends on `keyring = "3"` and `rusqlite`; no new dependency is planned.
- `apps/sidecar/package.json` — PostgreSQL, MySQL, SQL Server, and MongoDB drivers are already installed.

## Approval Gate

Required: yes
Reason: The change adds database-user provisioning and revocation, a persisted credential-reference schema, sidecar/desktop management APIs, Keychain hydration, and a new database authorization boundary.
Status: approved

## Decision Log

### D1 — Keep the managed credential outside SQLite

Question: Where should the dedicated MCP database credential be stored?
Decision: Store the complete read-only credential bundle in OS Keychain; SQLite stores only an opaque reference and non-secret provisioning state.
Impact: Metadata migration, Tauri Keychain bridge, sidecar credential hydration, logging and API-response redaction.
Confirmed by user: 2026-09-30

### D2 — Revoke only on explicit request

Question: Should disabling MCP revoke the database account?
Decision: Disabling MCP only closes MCP access. Revoke the database account only after the user explicitly selects **Revoke**.
Impact: Account lifecycle controls, credential retention, retry behavior, and tests.
Confirmed by user: 2026-09-30

### D3 — Revoke before changing or deleting the source profile

Question: Can the user change the database target, provisioning login, or delete a profile while its generated MCP account exists?
Decision: Require explicit Revoke before changing the target or saved provisioning username/password, or deleting the profile.
Impact: Connection update/delete routes and settings error handling.
Confirmed by user: 2026-09-30

### D4 — Preserve existing SQLite MCP access

Decision: The migration disables only server-database profiles without a managed account. SQLite stays enabled because it has no account model and already opens its worker read-only.
Impact: Migration filtering and upgrade verification.

### D5 — Verify MongoDB authorization with an unauthenticated operation

Decision: Probe `listCollections` on the configured database with credentials removed. Only MongoDB Unauthorized (code 13) proves access control denied the probe; success or any inconclusive error blocks provisioning.
Impact: MongoDB provisioning code and auth-enabled/auth-disabled fixtures.

### D6 — Derive the generated principal name from the opaque reference

Decision: Generate the database username deterministically from the opaque Keychain reference, with engine-specific name limits. This lets explicit Revoke find the exact account even if the Keychain item is missing.
Impact: Account provisioning/revocation helpers and stable-name tests.

### D7 — Recover interrupted setup without automatic account removal

Decision: Keep `prepared` separate from `provisioning`; a stale `provisioning` row becomes `recovery_required` and stays disabled. Only explicit Revoke removes a possibly-created database account.
Impact: Metadata migration, settings states, and restart verification.
