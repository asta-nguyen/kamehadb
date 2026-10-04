# MCP credentials in local SQLite

## Goal

Managed MCP accounts reconnect after an app update or sidecar restart on macOS, Windows, and Linux without an OS credential service.

## Design

- The sidecar creates the opaque account reference and generated read-only credential. The desktop receives only the account state.
- Before database provisioning, the sidecar encrypts the credential with AES-256-GCM and stores the ciphertext in the existing `mcp_managed_accounts` SQLite row. A random 32-byte key lives in a separate user-only file beside the metadata database and survives app updates. The key is never bundled with the app.
- The local key limits accidental disclosure of the SQLite file alone. A person who copies the complete app data directory can decrypt the credential. This is the accepted tradeoff for automatic, cross-platform reconnection without a master-password prompt or OS keychain.
- On startup, the sidecar decrypts only ready accounts and validates each credential against its profile and opaque reference before enabling MCP. Missing or invalid secrets fail closed; saved profile credentials are never used for MCP queries.
- Revoke disables MCP, closes cached adapters, revokes the exact managed database principal, and deletes the SQLite record. Interrupted cleanup remains retryable.
- Existing rows created by the Keychain flow have no SQLite ciphertext. They stay unavailable and can be revoked and created again. The app does not invent a new password for an existing database principal.
- The desktop and Rust layers no longer read or write MCP credentials through `keyring`.

## Verification

- Stored SQLite value contains no generated password; the same credential loads after closing and reopening the metadata database.
- Missing key, altered ciphertext, and legacy rows do not expose an MCP profile; Revoke remains possible.
- Prepare, provision, Revoke, and startup use the local store without returning secret material to the desktop.
- Workspace typecheck, relevant tests, builds, and the packaged macOS app build pass. Windows and Linux native runtime checks remain CI or release checks.

## Related context

- [Read-only MCP server](../../llm/integrations/read-only-mcp.md)

## Execution

- [Implementation plan](../plans/2026-10-01-mcp-sqlite-credentials-plan.md)

## Decision Log

### D1 — Local automatic credential storage

Decision: Use Beekeeper Studio's local SQLite persistence pattern for managed MCP credentials, with encryption by a generated local key and no OS keychain dependency.
Confirmed by user: 2026-10-01
