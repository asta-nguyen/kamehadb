# MCP SQLite credential implementation

## Approved design

[MCP credentials in local SQLite](../specs/2026-10-01-mcp-sqlite-credentials-design.md)

## Global Constraints

- MCP query adapters use only the managed read-only credential and fail closed when it is unavailable.
- Revoke must remove the database principal before deleting its stored credential.
- Existing Keychain-only rows cannot be silently recovered.

## Tasks

1. **Local encrypted store.** Files: `apps/sidecar/src/db/metadata-store.ts` and a small credential-vault module, plus `metadata-store.test.ts`. Interfaces: encrypted credential save/load and an optional ciphertext column on existing rows. Change: create a random persistent local key, encrypt before SQLite insert, decrypt and validate on read. Verify: reopen, ciphertext, missing-key and tamper checks.
2. **Sidecar lifecycle.** Files: `apps/sidecar/src/mcp/runtime.ts`, `apps/sidecar/src/routes/mcp-settings.ts`, `apps/sidecar/src/routes/connections.ts`, affected sidecar tests and shared MCP schemas. Interfaces: prepare/provision/revoke responses contain no secret; startup restores ready credentials. Change: create, serve, and revoke from the local store; preserve safe legacy recovery. Verify: route and runtime tests, MCP profile availability after reopen.
3. **Desktop/native cleanup.** Files: MCP desktop API/hooks/UI and tests, `apps/desktop/src-tauri/src/lib.rs`, `Cargo.toml`, lockfile. Interfaces: desktop calls prepare/provision/revoke only. Change: remove Keychain commands and hydration, show accurate missing-credential state. Verify: desktop tests, TypeScript checks, Rust test/build.
4. **Public and internal docs.** Files: `README.md`, `CHANGELOG.md`, `docs/llm/integrations/read-only-mcp.md`. Change: describe local encrypted storage and recovery. Verify: source links, `pnpm build`, landing build required by repository policy.
5. **Review and verify.** Review the diff against this design; run the repository's release-relevant checks and report platform limits.

## Approval Gate

Required: yes
Reason: data schema, credential security boundary, internal API, and broad file impact.
Status: approved — user explicitly directed implementation of the discussed SQLite approach on 2026-10-01.

## Decision Log

- D1 in the approved design selects local encrypted SQLite storage without an OS keychain dependency.
