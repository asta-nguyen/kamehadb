# Review Feedback Hardening

## Goal

Remediate the confirmed security, data-safety, release, development-environment, and product-copy findings from the full-app review while keeping the current Go + Wails desktop architecture.

## Decisions

- AI chat must present generated SQL for explicit review. The AI chat flow must not execute it or send database result rows to a provider. Users can copy reviewed SQL into the normal SQL editor and choose when to run it.
- Keep Go + Wails. The findings are specific behavior and configuration defects; a Rust rewrite would not address their causes.
- Reuse the existing AES-GCM credential vault and OS-keyring-first key management. Keep the owner-only key-file fallback for environments without a usable keyring, and state its protection limit accurately.
- Do not add a custom PostgreSQL CA settings UI. SSL connections use standard certificate-chain and hostname verification; users with private CAs must make those CAs available to the operating system.
- Keep the existing Wails-facing profile and AI-settings shapes so current frontend callers continue to receive usable values.
- Bind development Compose ports to loopback. Adding authentication to the local development Redis or MongoDB services is outside this change.

## Design

1. **AI chat:** Remove the execution-and-summarization branch from AiService.runChat. Stream the provider response, including fenced SQL, as the answer. Do not acquire the database adapter or make a follow-up provider request with result rows. Keep the normal SQL editor as the explicit execution path.
2. **PostgreSQL TLS:** Replace the three InsecureSkipVerify configurations with one small verified TLS configuration path shared by pooled, notification, and connection-test clients. Use Go's standard root certificates and host verification.
3. **File database maintenance:** Stage each main file and any supported sidecars in the destination directory. Do not truncate or delete the existing destination while staging. Promote the complete staged set only after every staged file is written and closed; if promotion reports an error, restore the previous destination set. Clean up temporary files on both outcomes. Multiple sidecar renames cannot be made crash-atomic as one filesystem operation, so the guarantee is operation-error rollback, not recovery from power loss during the swap.
4. **Credential storage:** Extend the current vault helpers for profile passwords, connection strings that may contain credentials, and AI provider API keys. Bind encrypted values to their record and field with authenticated data. Use an internal version marker in the existing ai_settings key/value table to distinguish legacy plaintext from ciphertext; set it in the same transaction that encrypts and verifies every stored secret. After the marker is set, decryption errors fail closed. Keep MCP credential ciphertext compatibility intact. Restrict the metadata directory and SQLite database to the current user on POSIX systems; Windows ACL management is not part of this change.
5. **Release workflow:** Default workflow permissions to read-only. Grant contents write only to release-creation and asset-publishing jobs. Pass the requested tag through an environment variable to a small shell resolver, validate it as a valid v tag/ref before checkout or shell use, and disable persisted checkout credentials in build jobs.
6. **Compose:** Bind every published development database port to 127.0.0.1 while keeping the existing container ports and service setup.
7. **Documentation:** Explain that remote AI providers receive the conversation and schema context when selected; describe local Ollama behavior accurately. Reconcile the engine count and AI-provider list against current source, correct the implemented schema timeline/migration status, and review related README, landing, and LLM wiki claims. Update the changelog for the user-visible AI and TLS behavior changes.

## Scope

- No Go-to-Rust rewrite, dependency addition, custom CA UI, Compose authentication, database engine additions, or redesign of the SQL editor.
- The review/implementation gate applies separately to every task: re-read its feedback and current code before changing anything. If the evidence shows the issue is already fixed or the feedback was inaccurate, record the evidence and make no code change for that finding.
- If a confirmed fix requires a behavior, API, schema, or risk change outside this design, stop and return to the user before implementing that task.
- Do not edit the existing approved change folder for runtime footprint and large-table browsing. Its ENG-duckdb-runtime and WSP-preview-lifetime requirements are being updated there; any shared wiki-page refresh in this change must preserve those requirement blocks until that change merges its delta.

## Risks

- Requiring explicit SQL execution removes automatic result summaries from AI chat; users must review and run generated SQL in the SQL editor.
- Strict PostgreSQL TLS verification will reject self-signed or otherwise untrusted certificates until the user configures system trust.
- Existing installations need safe migration of stored secrets. The file-key fallback protects against casual database-only inspection, but someone who can read the whole app-data directory can also read that key.
- Updating active SQLite values does not guarantee forensic erasure from old SQLite pages, WAL files, filesystem snapshots, or backups. The implementation must not claim that existing copies are scrubbed.
- A reported file operation failure must preserve the old file set; sudden power loss during multi-file sidecar promotion is outside the atomicity guarantee.

## Relevant Context

- [AI assistant requirements](../../../../llm/integrations/ai-assistant.md)
- [Release packaging](../../../../llm/operations/release-packaging.md)
- [Engine support](../../../../llm/architecture/engine-support.md)
- [Connections and workspace](../../../../llm/workflows/connections-and-workspace.md)
- [Diagnostics and maintenance](../../../../llm/operations/diagnostics-and-maintenance.md)
- [Credential storage research](../../../../credential-storage-research.md)
