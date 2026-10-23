# Review Feedback Hardening Tasks

## Design

[Review Feedback Hardening design](design.md)

## Global Constraints

- **Per-task feedback review gate:** Before editing for a task, reread the task and its originating review finding, then trace the current HEAD behavior, callers, and tests. Report a short verdict with source evidence as confirmed, already fixed, or inaccurate before making that task's code changes. Implement only a confirmed finding. If it is already fixed or inaccurate, record the evidence and make no code change for it. If correction would change behavior, API, schema, or risk beyond this design, stop and return for user review.
- Keep the Go + Wails architecture and current Wails-facing shapes. Do not add dependencies or expand the approved behavior. If a confirmed fix requires a material change to behavior, API, schema, or risk beyond the design, stop for user review.
- Preserve existing data on reported operation errors. Never silently downgrade failed encryption/decryption to plaintext handling.

## Impact map

Entry: AiService.runChat, PostgreSQL adapter constructors, file database maintenance service, Store.Open and store accessors, the release workflow, and development Compose services.

Flow: AI request → provider response → chat event; saved profile → PostgreSQL TLS clients; saved file profile → backup/restore; metadata DB → credential migration and accessors; tagged release → checkout/build/publish; local Compose service → host port.

State changes: Generated SQL no longer triggers database queries from AI chat; existing profile and provider secrets are migrated to authenticated ciphertext; file backup/restore replaces staged file sets; no new public Wails contract is intended.

External effects: Remote AI requests continue to go directly to the selected provider with conversation and schema context but without query-result rows; PostgreSQL verifies certificates; release jobs receive narrower GitHub token permissions; published development ports listen only on loopback.

Change candidates: internal/api/ai.go, internal/engines/postgres/postgres.go, internal/maintenance/filedb.go, internal/store/, .github/workflows/release.yml, .github/scripts/, docker-compose.yml, README.md, landing/, docs/llm/, and CHANGELOG.md.

Verification: Targeted Go package tests, Go build, shell validation cases, docker compose config plus resolved bind inspection, desktop and landing builds after their documentation/public-copy edits. Planning only in this turn; no application checks have been run.

Verified at: 9041c1e8aaf0244c00d7b997a028ea61df31941f (reviewed source baseline).

## Tasks

### Task 1: Stop AI chat from executing generated SQL

Files:

- internal/api/ai.go::AiService.runChat
- internal/api/ai.go::extractSQLQueries (inspect; remove only if no remaining caller)
- internal/api/ai_test.go::AiService chat tests

Files inspected, no change:

- apps/desktop/src/components/ai-chat-panel.tsx::AiChatPanel
- apps/desktop/src/components/sql-editor.tsx::SqlEditor
- internal/sqlsafety/sqlsafety.go::Check (retain for its other callers)

Interfaces: Keep the existing chat request/event and Wails binding shapes. Continue emitting and saving the provider's generated response; the ordinary SQL editor remains the explicit query execution path.

Change: Remove AI-chat adapter acquisition, generated-query execution, and the follow-up provider request containing query rows. Fenced SQL remains visible in the chat response for the user to copy and review. Do not add an automatic run button or other execution path.

Verify:

- Add TestRunChatDoesNotExecuteGeneratedSQL: a provider response containing SELECT setval(...) is streamed to chat; the fake adapter records zero calls; the provider is called once and receives no result rows.
- go test ./internal/api passes, including the new regression case.

Progress: done
Result: `go test ./internal/api -run TestRunChatDoesNotExecuteGeneratedSQL` — pass; provider called once, adapter factory zero calls, response streamed verbatim.

### Task 2: Verify PostgreSQL server certificates

Files:

- internal/engines/postgres/postgres.go::NewNotifyConn
- internal/engines/postgres/postgres.go::newAdapter
- internal/engines/postgres/postgres.go::TestPostgresConnection
- internal/engines/postgres/postgres_test.go::TLS verification tests

Interfaces: Preserve engines.ConnProfile and all existing adapter constructors. Share one internal verified TLS configuration across the three connection paths.

Change: Remove all three PostgreSQL InsecureSkipVerify settings. SSL-enabled clients verify the server certificate chain against system roots and verify the configured host name. Do not add a custom-CA setting.

Verify:

- Test the shared verified TLS config with a test-only root pool: its trusted certificate succeeds for the matching host, while an unknown root and a mismatched host each fail the TLS handshake.
- go test ./internal/engines/postgres passes.

Progress: done
Result: `go test ./internal/engines/postgres` — pass; `TestPGTLSConfigVerifiesServer` proves trusted-root+matching-host success and unknown-root / mismatched-host handshake failures. All three `InsecureSkipVerify` sites replaced by `pgTLSConfig`; explicit SSL profiles drop the plaintext fallback.

### Task 3: Stage and safely replace file database backups/restores

Files:

- internal/maintenance/filedb.go::copyFile
- internal/maintenance/filedb.go::copyRelatedFiles
- internal/maintenance/filedb.go::backupSQLiteDatabase
- internal/maintenance/filedb.go::backupByCopy
- internal/maintenance/filedb.go::BackupFileDatabase
- internal/maintenance/filedb.go::RestoreFileDatabase
- internal/maintenance/filedb.go::replaceFileSet (new private helper)
- internal/maintenance/filedb_test.go::file database failure-preservation tests

Files inspected, no change:

- internal/api/connections.go::ConnectionsService.BackupFileDatabase (keep connection invalidation and service interface)
- apps/desktop/src/components/file-database-backup-dialog.tsx::FileDatabaseBackupDialog
- apps/desktop/src/components/file-database-restore-dialog.tsx::FileDatabaseRestoreDialog

Interfaces: Keep BackupFileDatabase, RestoreFileDatabase, MaintenanceResult, and their Wails-facing results unchanged. Keep the promotion-failure injection seam private to the maintenance package; production uses os.Rename.

Change: Write main files and supported sidecars to temporary siblings first. Preserve the current destination set until staging succeeds; promote the staged set with rollback of the previous set if promotion returns an error. Remove temporary files on failure and success. Keep SQLite VACUUM INTO snapshot behavior and existing connection invalidation.

Verify:

- Add TestBackupFileDatabaseFailurePreservesExistingOutput: use a directory as the DuckDB source so copy staging fails while an output file and sidecar exist; after the error, their original bytes are unchanged.
- Add TestRestoreFileDatabaseFailurePreservesExistingDatabaseAndSidecars: use a directory as the backup input so copy staging fails while the live database and sidecars exist; after the error, their original bytes are unchanged.
- Add TestReplaceFileSetRestoresPreviousFilesOnPromotionError: inject a rename failure after one staged member has been installed; verify every prior main/sidecar file is restored and staged files are removed.
- Existing SQLite WAL snapshot, DuckDB sidecar, successful backup, and successful restore cases continue to pass.
- go test ./internal/maintenance passes.

Progress: done
Result: `go test ./internal/maintenance` — pass. Backup/restore now stage into temp siblings (`stageCopy`/`stageFileSet`) and promote via `replaceFileSet`, which rolls back the previous set on a rename error and removes temps on both outcomes. `copyRelatedFiles`/`removeRelatedFiles` deleted; `renameFile` seam added for injection.

### Task 4: Encrypt persisted credentials and restrict metadata file permissions

Files:

- internal/store/vault.go::readMCPKey
- internal/store/vault.go::encryptMCPCredential
- internal/store/vault.go::decryptMCPCredential
- internal/store/vault.go::encryptStoredSecret (new)
- internal/store/vault.go::decryptStoredSecret (new)
- internal/store/store.go::Open
- internal/store/migrate.go::Store.migrate
- internal/store/migrate.go::migrateCredentialStorage (new)
- internal/store/profiles.go::CreateProfile
- internal/store/profiles.go::UpdateProfile
- internal/store/profiles.go::GetProfilePassword
- internal/store/profiles.go::ProfileForConnect
- internal/store/profiles.go::scanProfile
- internal/store/profiles.go::scanProfileRow
- internal/store/ai.go::GetAISettings
- internal/store/ai.go::SaveAISettings
- internal/store/vault_test.go::credential migration tests
- internal/store/profiles_test.go::profile credential tests
- internal/store/entities_test.go::AI provider credential tests
- internal/store/store_test.go::metadata permission tests

Files inspected, no change:

- apps/desktop/src/components/connection-dialog.tsx::ConnectionDialog (keep current Wails contract)
- apps/desktop/src/components/api-settings-page.tsx::ApiSettingsPage (keep current Wails contract)

Interfaces: Keep profile and AI settings values usable through existing store accessors and Wails models. Preserve MCP ciphertext format and managed-account behavior.

Change: Use the existing AES-GCM/keyring-first vault path for profile passwords, credential-bearing connection strings, and AI provider API keys, with authenticated data tied to the record and field. Encrypt new writes and decrypt at existing accessors. Use an internal version marker in the existing ai_settings key/value table so a legitimate legacy secret that resembles a ciphertext prefix is still treated as plaintext during migration. In one database transaction, encrypt every stored secret, verify every value by decrypting it, then set the marker; abort without replacing the plaintext source values on any error. After the marker is set, never fall back to plaintext if decryption fails. On POSIX, create/restrict the metadata directory to owner-only and the database file to owner read/write; do not change Windows ACLs.

Verify:

- Add migration coverage that starts with plaintext profile passwords, a connection string, and provider API keys; after opening, normal accessors return the original values and the stored columns contain no plaintext values.
- Include a legacy secret beginning with a ciphertext-looking prefix; it remains an ordinary plaintext value during migration and round-trips unchanged through the accessor.
- Cover a working OS keyring and the existing owner-only key-file fallback when the keyring is unavailable. Also cover an unavailable key plus an unusable fallback and a decrypt failure; those failures return errors and never report plaintext as a successful fallback.
- Verify a failed migration leaves its original plaintext rows intact for recovery and does not partially commit ciphertext.
- Verify MCP-managed credential encryption/decryption remains compatible with existing format tests.
- On POSIX, assert the metadata directory is owner-only and the database is owner read/write; skip mode assertions on Windows.
- go test ./internal/store ./internal/api ./internal/mcp and go build ./... pass.

Progress: done
Result: `go test ./internal/store ./internal/api ./internal/mcp` and `go build ./...` — pass. Added `s1` AES-GCM secret format with AAD-bound `encryptStoredSecret`/`decryptStoredSecret`; `migrateCredentialStorage` runs last, encrypts+verifies all profile passwords/connection strings and provider API keys in one transaction, then sets the `credentialStorageVersion` marker (`secretsEncrypted` flips accessors from plaintext passthrough to fail-closed ciphertext). POSIX dir `0700`/db `0600` enforced in `Open`. New `credentials_test.go` covers round-trip, prefix lookalike, keychain+file-fallback, failed-migration preservation, fail-closed decrypt, new-write encryption, and permissions.

### Task 5: Reduce release workflow permissions and validate release tags

Files:

- .github/workflows/release.yml::workflow permissions
- .github/workflows/release.yml::Resolve release tag
- .github/workflows/release.yml::build jobs
- .github/workflows/release.yml::create-release and publish-release jobs
- .github/scripts/resolve-release-tag.sh::main
- .github/scripts/resolve-release-tag.test.sh::tag validation cases

Interfaces: Keep tag-triggered and workflow-dispatch release inputs and the current release assets. The resolver emits one validated tag for later checkout and release steps.

Change: Set workflow permissions to contents: read; grant contents: write only to jobs that create the release or publish assets. Move tag resolution and validation into the shell script, pass the input via an environment variable, require a valid v tag/ref before checkout, and set persist-credentials: false on build checkouts.

Verify:

- The resolver accepts v1.2.3 and v1.2.3-rc.1, and rejects a non-v ref, an invalid Git ref, and a newline/injection payload without emitting a tag.
- bash -n .github/scripts/resolve-release-tag.sh, bash -n .github/scripts/resolve-release-tag.test.sh, and bash .github/scripts/resolve-release-tag.test.sh pass.
- Review the resulting workflow to confirm only release mutation jobs declare write permission and all build checkouts disable persisted credentials.

Progress: done
Result: `bash -n` both scripts and `bash .github/scripts/resolve-release-tag.test.sh` — pass (accepts v1.2.3 / v1.2.3-rc.1; rejects non-v, malformed, `..`, injection, and empty inputs without emitting a tag). Workflow now sets global `contents: read`, scopes `contents: write` to `create-release` and `publish-release-assets`, resolves/validates the tag via the script with `RELEASE_TAG` from env, and sets `persist-credentials: false` on both checkouts.

### Task 6: Bind development database ports to loopback

Files:

- docker-compose.yml::services

Files inspected, no change:

- README.md::Connection Defaults For Docker (keep local container ports and connection defaults)

Interfaces: Preserve service names, container ports, and local connection defaults.

Change: Add a 127.0.0.1 host bind to each published database port, including PostgreSQL, MySQL, MariaDB, Redis, DuckDB, and MongoDB. Keep the current unauthenticated local service setup unchanged.

Verify:

- docker compose config --quiet succeeds.
- Inspect resolved Compose output and confirm every published port has host IP 127.0.0.1 and the existing container port is unchanged.

Progress: done
Result: `docker compose config --quiet` — pass. All six published ports (postgres 5432, mysql 3306, mariadb 3307, redis 6379, duckdb 5433, mongodb 27017) now bind `127.0.0.1`; resolved output confirms host_ip 127.0.0.1 with unchanged container target/published ports.

### Task 7: Reconcile privacy, feature, and architecture documentation

Files:

- README.md::project overview, AI providers, feature status, Docker defaults
- landing/src/components/particle-footer.tsx::ParticleFooter
- landing/src/components/home-view.tsx::HomeView
- landing/src/app/layout.tsx::metadata
- landing/src/app/opengraph-image.tsx::OpenGraphImage
- landing/scripts/render-og-animated.mjs::animated OG source
- landing/public/og-animated.gif::animated OG image (inspect; regenerate if it contains outdated claims)
- landing/public/images/::Compare panel screenshots (inspect all; update only inaccurate imagery)
- landing/public/images/chat-panel.png::AI chat comparison image (inspect; regenerate only if it depicts automatic query execution or result rows)
- docs/llm/integrations/ai-assistant.md::AI-chat-sql-execution, Flow, Side effects, Authorization & constraints, Error paths
- docs/llm/operations/release-packaging.md::Flow, Authorization & constraints, Error paths
- docs/llm/architecture/engine-support.md::Supported engines and paths
- docs/llm/workflows/connections-and-workspace.md::Connection profiles, Connection health and reload
- docs/llm/operations/diagnostics-and-maintenance.md::Application logs, PostgreSQL psql terminal, PostgreSQL backup and restore jobs, SQLite and DuckDB file backup/restore
- docs/llm/INDEX.md::selected page status rows
- CHANGELOG.md::Unreleased

Files inspected, no change:

- packages/shared/src/schemas.ts::ALL_KINDS
- internal/engines/registry.go::RegisterFactory
- internal/api/connections.go::NewServices

Interfaces: Documentation must describe behavior already implemented by Tasks 1–6. The AI requirement changes through the delta in delta.md; update the other selected wiki pages through the document-wiki Task updates procedure.

Change: On the AI assistant wiki page, update verification, flow, side effects, authorization constraints, and error paths along with the requirement delta: chat displays generated SQL without running it or sending result rows, while remote providers still receive conversation and schema context. Update the vault-storage statement after Task 4. Correct local-first privacy language to disclose that remote AI sends conversation and schema context directly to the selected provider, while local Ollama stays local. Reconcile engine count from ALL_KINDS, SQL adapter registrations, and dedicated service construction; add DeepSeek and Gemini where current source confirms support; and mark schema timeline/migration assistant as implemented only after confirming current UI entry points. Refresh Go/Wails architecture and maintenance facts across the selected wiki pages, including current log, terminal, PostgreSQL backup/restore, and file-database behavior. Preserve the active runtime-footprint change's ENG-duckdb-runtime and WSP-preview-lifetime requirement blocks and do not edit that change's files. Keep those two pages at Verification [~] until the owning change merges its verified requirements. Update the LLM index statuses to match verified page content. Review all five public product surfaces listed in the repository instructions and update every claim contradicted by current source. Keep screenshots unchanged unless they show behavior removed in Task 1. Record user-visible AI and TLS changes in [Unreleased].

Verify:

- Run pnpm build after README or landing edits.
- Run npm --prefix landing run build after landing edits.
- Review README, landing metadata/OG source and generated asset, and screenshots for consistent engine counts, privacy wording, and feature status.
- Verify each changed LLM wiki statement against the completed source/tests, merge the verified AI delta with document-wiki, preserve the two active requirement blocks byte-for-byte, and check changed Markdown links resolve.

Progress: done
Result: AI delta merged into `docs/llm/integrations/ai-assistant.md` (SQL displayed, not executed; result rows never sent; vault storage statement). `release-packaging.md`, `engine-support.md`, `connections-and-workspace.md`, `diagnostics-and-maintenance.md` refreshed against Go/Wails source; `engine-support.md` and `connections-and-workspace.md` kept at Verification `[~]` with ENG-duckdb-runtime/WSP-preview-lifetime blocks preserved. `INDEX.md` statuses updated. CHANGELOG [Unreleased] records AI, TLS, credential-vault, atomic file backup/restore, release-tag, and Docker-loopback changes. README and landing surfaces reconciled (10 engines, DeepSeek/Gemini, remote-AI privacy wording, MCP vault storage, schema timeline/migration marked shipped, JSON-LD requirements). Inspected `chat-panel.png`/`sql-panel.png` — no automatic execution or result rows, unchanged. Regenerated `og-animated.gif` from the corrected source. Verification: `pnpm typecheck`, `pnpm build`, `npm --prefix landing run build`, Go build/tests, shell script tests, and `docker compose config` all pass.

## Approval Gate

Status: approved (user directed implementation on 2026-10-16 after review of design.md, tasks.md, and delta.md; no blocking feedback)

## Decision Log

### D1 — User-directed implementation

Question: Whether to proceed with the review-feedback-hardening change after reviewing the design, tasks, and AI requirements delta.
Decision: Proceed and implement Tasks 1–7; the user reviewed the artifacts and reported no additional feedback.
Impact: Enables implementation of the approved design and delta.
Confirmed by user: 2026-10-16
