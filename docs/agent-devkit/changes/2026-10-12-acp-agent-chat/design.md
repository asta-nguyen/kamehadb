# ACP agents in AI chat

Classification: Architectural

## Goal

Let users choose the configured KamehaDB provider or a fixed local ACP agent in the existing AI chat, while giving an agent database access only through the selected profile's already-enabled read-only MCP access.

## Scope

- Add a nullable active chat agent selection to existing AI settings. `null` keeps provider-based chat as the default and does not require a database migration.
- Support the four user-selected presets: Codex (`npx -y @agentclientprotocol/codex-acp`), Claude (`npx -y @agentclientprotocol/claude-agent-acp`), OpenCode (`opencode acp`), and Devin (`devin acp`). Users install and authenticate their own CLI; KamehaDB does not accept arbitrary commands or install agents. The two `npx` presets require Node 22+ (`@agentclientprotocol/claude-agent-acp` declares `engines.node >= 22`) and download their adapter on first use; the selector's trust notice states this. Preset package versions are pinned in the fixed launch catalog rather than floating to `latest`, so a turn is reproducible and reviewable; bumping a pin is a code change.
- Launch is per-OS: POSIX runs the catalog executable directly, Windows resolves `npx`/`opencode`/`devin` through the `PATHEXT` candidates (`npx.cmd` etc.) because `exec.Command("npx", ...)` does not find the `.cmd` shim. The launch catalog stores the executable and fixed arguments, and a small per-OS resolver owns only the executable-name expansion.
- Run ACP v1 agents as local child processes from the Go/Wails backend. Use `github.com/coder/acp-go-sdk` v0.13.5, a community Go SDK listed in the [official ACP community library directory](https://agentclientprotocol.com/libraries/community). Its [v0.13.5 documentation](https://github.com/coder/acp-go-sdk/releases/tag/v0.13.5) describes stdio client support for initialize, session creation, and streaming prompts. Source review of v0.13.5 confirmed `NewClientSideConnection`/`Initialize`/`NewSession`/`Prompt`/`Cancel`, the `Client.RequestPermission` callback, `SessionUpdate`, and `NewSessionRequest.McpServers` over HTTP. The SDK is community-maintained, so protocol compatibility and cancellation remain explicit verification points. The repository uses Go 1.26; the SDK declares Go 1.21.
- Keep the Wails binding and event flow in-process. This change adds no HTTP chat route or sidecar.
- Update README, Unreleased changelog, and the landing page's product description and chat screenshot as a major AI chat workflow. The OpenGraph image and metadata stay aligned with the updated landing description.
- Preserve current MCP client behavior, provider-based chat, provider configuration, and provider-backed embedding generation outside ACP chat.

## Behavior

### Backend selection and persistence

`AISettings.activeChatAgent` stores `null` for the configured provider or one of the four fixed ACP IDs. Older settings without the field normalize to `null`. The backend validates the fixed IDs. It validates the active model provider when provider-based chat is selected; ACP chat can run without KamehaDB model-provider credentials.

### ACP chat turn

Each turn starts one selected local CLI and one fresh ACP v1 session in an empty temporary working directory. KamehaDB sends the visible chat transcript and available connection context, streams text and tool activity through the existing Wails `chat:<requestId>` event, and stores the completed assistant text in the existing connection-scoped history. The agent uses its own provider and credentials. KamehaDB does not execute SQL emitted in ACP chat.

ACP mode never sends the user's chat prompt to KamehaDB's model provider, including for query embeddings. On a schema-cache miss, KamehaDB skips semantic retrieval that embeds the prompt and supplies the full schema context through the existing schema builder. This can make the ACP prompt larger. Provider-based chat and existing embedding generation keep their current behavior.

### Database access

KamehaDB attaches its HTTP MCP endpoint only when the selected profile was already MCP-enabled and the ACP agent advertises `agentCapabilities.mcpCapabilities.http`. The backend issues a cryptographically random, volatile bearer token for that turn, scoped to that profile, and revokes it when the turn ends. The agent never receives the regular persisted MCP token. Session-token requests expose only the selected profile and reject any other `connection_id` before adapter access. Existing managed-account and SQLite read-only rules remain authoritative; KamehaDB never provisions an account or enables MCP for ACP.

The token→profile identity is resolved per HTTP request from the bearer token, not stored on the shared dispatch struct: the runtime's single `serverState` is created once per listener bind and is shared by every request, so the scoped profile travels as request context into tool dispatch. `list_mcp_profiles` filters to the scoped profile, and every database tool call rejects a mismatched `connection_id` before the adapter manager is invoked.

The existing MCP endpoint is a hand-written POST-only JSON-RPC transport (no SSE `GET`, no `Mcp-Session-Id`). Because each ACP preset brings its own MCP client, compatibility with that transport is a verification point: if a real preset cannot complete an HTTP MCP handshake, the turn must fall back to schema-only with the visible notice rather than hang.

If the profile is not already eligible, the MCP runtime is unavailable, or the agent lacks HTTP MCP support, KamehaDB omits MCP and sends available schema context only. The chat shows a notice that database tools are unavailable for the turn. The MCP-scoped MongoDB adapter returns only the configured profile database from its database-list tool; the underlying general MongoDB adapter can enumerate databases, but MCP does not expose that list. The generated account also has only the configured database's `read` role, and this feature preserves both boundaries.

### Permissions and process lifecycle

ACP permission requests appear in chat with their action details and available choices. Each request carries its own correlation id so a response targets that exact pending request; the Wails-bound response returns one valid choice, rejects a stale or already-answered id, and cannot be replayed. ACP permission requests are synchronous per session, so a turn has at most one pending request, but the correlation id keeps the contract explicit. Chat cancellation and Wails shutdown terminate the ACP process tree, resolve pending permission waits, revoke the session token, and remove the temporary directory. The same cleanup runs after completion and errors.

The child receives its normal user environment and CLI configuration, except `KAMEHADB_*` variables are removed. The app only reads `KAMEHADB_DATA_DIR` and `KAMEHADB_DUCKDB_DRIVER_PATH` and does not inject them into children, so the removal is defensive rather than the isolation control. Isolation comes from the fixed launch catalog, the empty temporary working directory, and not advertising filesystem or terminal client capabilities. OpenCode keeps its normal config lookup so users can use its Ollama or OpenAI-compatible provider setup; its working directory remains temporary. A local ACP CLI still has the operating-system access and any tools, MCP servers, and credentials in its own configuration. The agent selector must show this trust boundary.

## Edge cases

- An old settings record or explicit `null` selects provider-based chat; an unknown preset ID is rejected.
- A disabled or unconfigured KamehaDB provider does not block ACP chat. Provider-based chat continues to require the current provider validation.
- A cache miss in ACP mode never calls provider-backed embedding search; the service falls back to full schema context. A schema retrieval failure surfaces as a chat error and never silently falls back to the provider.
- A missing CLI, failed launch, incompatible ACP response, or agent error surfaces through the existing chat error event; it does not switch to provider chat.
- A missing MCP capability, disabled/ineligible profile, or unavailable MCP runtime yields schema-only context and a visible notice.
- A scoped token cannot list or access another profile and is rejected after revocation. Existing MCP clients continue using the persisted global token.
- A stale, invalid, or already-answered permission choice is rejected. Cancel and shutdown release any permission wait and process resources.
- ACP-produced SQL remains display text; only the user's existing SQL editor action can execute a query.

## Interfaces

- Go `store.AISettings` and shared `AISettings` gain nullable `activeChatAgent`; the field is saved in existing AI settings storage. The accepted IDs are a shared constant union (`ACP_AGENTS`/`AcpAgentID`) in `packages/shared`, mirrored by a Go catalog, so no raw preset string is compared inline.
- The Go ACP package owns the fixed preset launch definitions and a per-turn runtime with streaming update and permission callbacks. Its `RunTurn` input carries the preset, transcript/context, optional MCP endpoint and scoped token, and cancellation context. `CloseAll` terminates active sessions during shutdown.
- `mcp.Runtime` gains session-token issue/revoke operations and a request-scoped resolver: `IssueSessionToken(profileID) (endpoint, token, eligible)`, `RevokeSessionToken(token)`, and a resolve step that returns the profile id for a presented bearer token. The listener passes that identity through request context into tool dispatch, which filters `list_mcp_profiles` and rejects other profile IDs before tool adapters run. The persisted global token keeps its current behavior.
- `AiService` selects provider or ACP in `StartChat`, publishes ACP text, tool activity, permission, notice, error, and completion events through the current `chat:<requestId>` channel, and adds a bound permission-response method keyed by the permission correlation id. `CancelChat` owns the same cancellation path.
- `apps/desktop/src/lib/api.ts`, generated Wails bindings, the AI settings page, `use-chat.ts`, and `AIChatPanel` consume the new settings and event shapes. No frontend HTTP API is added.

## Verification

- Add Go tests for settings migration/defaults and validation, token scope/revocation, ACP protocol streaming and permissions, process-tree cleanup, cancellation, and Wails chat routing. ACP runtime tests use a local protocol test child; they do not depend on installed commercial CLIs.
- Run `go test ./internal/store ./internal/mcp ./internal/acp ./internal/api`, `go build ./...`, regenerate Wails bindings, and run `pnpm typecheck`, desktop tests, and `pnpm build`.
- Run the Agent Devkit wiki validator and `git diff --check` after source-grounded wiki updates. Run `npm --prefix landing run build` for the landing changes.
- Review that ACP chat makes no KamehaDB provider or embedding request, scoped MCP rejects cross-profile calls before adapter access, and all process/token cleanup paths terminate correctly on macOS, Linux, and Windows. Because only one CI runner executes tests, per-OS cleanup is a build-check plus documented manual matrix, while the runtime tests assert cleanup on the host OS.
- Confirm at least one real preset (for example Codex via `npx`) completes an HTTP MCP handshake against the KamehaDB `/mcp` endpoint before relying on the database-tools path; otherwise the turn falls back to schema-only with the notice.

## Related context

- [AI assistant](../../../llm/integrations/ai-assistant.md)
- [Read-only MCP server](../../../llm/integrations/read-only-mcp.md)
