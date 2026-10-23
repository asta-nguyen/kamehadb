# ACP agents in AI chat tasks

## Design

[ACP agents in AI chat](design.md)

## Global Constraints

- ACP chat runs only through the selected fixed preset; `null` keeps the existing provider path. Do not add arbitrary commands, an agent installer, or an agent registry.
- ACP chat sends no user prompt to KamehaDB's provider, including its embedding endpoint. On ACP schema-cache misses, use full schema context; provider-based chat and embedding work outside ACP chat keep their current behavior.
- Attach KamehaDB MCP only for an already-enabled selected profile when the agent advertises HTTP MCP. Use a volatile token scoped to that profile and turn; never pass the persisted global token, provision an account, or enable MCP for ACP.
- Keep chat, permissions, persistence, and cancellation on the current in-process Wails service/event path. Never execute ACP-generated SQL through the database adapter.
- Preserve the local-agent trust boundary: fixed launch definitions, empty temporary working directory, removal of `KAMEHADB_*` from the child environment, visible notice that the CLI retains its own OS access and configured tools, and process-tree cleanup on completion, error, cancellation, and shutdown.

## Impact map

Entry: `apps/desktop/src/components/ai-chat-panel.tsx::AIChatPanel` → `apps/desktop/src/hooks/use-chat.ts::useChat` (settings from `apps/desktop/src/hooks/use-ai-chat.ts::useAISettings`) → `apps/desktop/src/lib/api.ts::api.startChat` (payload carries `connectionId`/`mongoDatabase`/`tableId` via `forwardedProps`) → `internal/api/ai.go::AiService.StartChat/runChat`.

Flow: `AIChatPanel` → `useChat` → generated Wails `AiService.StartChat` binding → `AiService` builds connection context and selects provider or ACP → provider `ai.ChatStream` or planned `internal/acp.Runtime.RunTurn` → Wails `chat:<requestId>` events → existing chat history. For eligible ACP turns, planned `mcp.Runtime.IssueSessionToken` scopes requests to the selected profile; the identity is resolved per request from the bearer token and passed through request context, before existing MCP tools and adapters.

State changes: `activeChatAgent` is persisted in the existing `ai_settings` key/value store with no database migration; existing provider settings and chat history stay in place. ACP child processes, temporary directories, pending permissions, and session tokens are runtime-only.

External effects: Pending approval: launch the selected local CLI. Codex and Claude presets may download their ACP adapters through `npx` on first use. The agent may use its own configured remote provider and tools. An eligible turn calls the current loopback MCP listener with a temporary token.

Change candidates: `go.mod`, `go.sum`, `internal/acp/runtime.go`, `internal/acp/process_unix.go`, `internal/acp/process_windows.go`, `internal/acp/runtime_test.go`, `internal/store/ai.go`, `internal/store/entities_test.go`, `internal/api/ai.go`, `internal/api/ai_test.go`, `internal/api/connections.go`, `main.go`, `internal/mcp/runtime.go`, `internal/mcp/jsonrpc.go`, `internal/mcp/tools.go`, `internal/mcp/manager.go`, `internal/mcp/mcp_test.go`, `packages/shared/src/types.ts`, `packages/shared/src/index.ts`, `apps/desktop/src/components/api-settings-page.tsx`, `apps/desktop/src/hooks/use-chat.ts`, `apps/desktop/src/hooks/use-ai-chat.ts`, `apps/desktop/src/components/ai-chat-panel.tsx`, `apps/desktop/src/lib/api.ts`, `apps/desktop/wailsjs/go/api/AiService.ts`, `apps/desktop/wailsjs/go/models.ts`, `README.md`, `CHANGELOG.md`, `landing/src/components/home-view.tsx`, `landing/src/app/layout.tsx`, `landing/src/app/opengraph-image.tsx`, `landing/public/og-animated.gif`, `landing/public/images/chat-panel.png`, `docs/llm/integrations/ai-assistant.md`, `docs/llm/integrations/read-only-mcp.md`.

Verification: focused Go tests for store, MCP, ACP runtime, and API; `go build ./...`; regenerate bindings with `wails generate module`; desktop tests and `pnpm typecheck`; `pnpm build`; `npm --prefix landing run build`; wiki validator; `git diff --check`. Review the ACP path for zero provider/embedding requests, cross-profile rejection before adapter access, per-request token scope, and process/token cleanup. Per-OS cleanup is a build-check plus a documented manual matrix because only one runner executes tests.

Verified at: `c35d46222b5837ecf44d9d4f770fcb06cedd9e6c`

## Tasks

### Task 1 — Persist the fixed chat backend selection

Files: `internal/store/ai.go::AISettings/GetAISettings/SaveAISettings/normalizeAISettings`, `internal/api/ai.go::AiService.GetAISettings/SaveAISettings`, `packages/shared/src/types.ts::AISettings`, `packages/shared/src/index.ts`

Interfaces: Adds nullable `activeChatAgent` to the Go and shared settings shape; `null` means the configured provider. The accepted values are the four fixed ACP IDs selected in `design.md`.

Change: Persist the selection in the existing AI settings table without a schema migration. Normalize older records to `null`, reject unknown IDs, and require the configured provider to pass existing validation only when provider-based chat is selected. ACP selection must save and load without KamehaDB model-provider credentials.

Verify: `go test ./internal/store ./internal/api` covers old settings defaulting to provider, each accepted preset, rejected unknown IDs, and ACP settings saving with no enabled model provider.

Progress: todo
Result: none

### Task 2 — Add volatile profile-scoped MCP session tokens

Files: `internal/mcp/runtime.go::Runtime.handler/authorized`, `internal/mcp/jsonrpc.go::serverState/callMethod`, `internal/mcp/tools.go::serverState.tools/dispatch/toolListProfiles`, `internal/mcp/manager.go::AdapterManager.CanServe`, `internal/mcp/mcp_test.go`

Interfaces: Adds `IssueSessionToken(profileID) (endpoint, token, eligible)` and `RevokeSessionToken(token)`, plus a resolve step that maps a presented bearer token to its profile. The resolve step runs per HTTP request; the profile identity travels through request context into tool dispatch, never as a field on the shared `serverState`. Regular MCP clients keep the existing global-token behavior.

Change: Issue a cryptographically random in-memory token only while the MCP runtime is listening and the selected existing profile is already enabled and serviceable. Filter `list_mcp_profiles` to that profile and reject every database tool request with another `connection_id` before adapter lookup. Remove the token at turn end so later requests receive `401`.

Verify: `go test ./internal/mcp` covers eligible/disabled/unready profiles, a token that lists only its profile, cross-profile rejection before adapter creation, global-token compatibility, and token rejection after revocation.

Progress: todo
Result: none

### Task 3 — Implement the Go ACP v1 process runtime

Files: `go.mod`, `go.sum`, `internal/acp/runtime.go::Runtime.RunTurn/CloseAll`, `internal/acp/process_unix.go`, `internal/acp/process_windows.go`, `internal/acp/runtime_test.go`

Interfaces: Adds the pinned `github.com/coder/acp-go-sdk` v0.13.5 dependency, a fixed four-agent launch catalog, `RunTurn` callbacks for text, tool updates, and permissions, and `CloseAll` for Wails shutdown. The runtime accepts an optional scoped MCP endpoint/token and a cancellation context.

Change: Launch only the selected preset with fixed executable arguments resolved per OS (Windows expands `npx`/`opencode`/`devin` through `PATHEXT` shims). Create a fresh child process, ACP v1 session, and empty temporary working directory per turn; preserve the user's normal agent configuration, remove `KAMEHADB_*` variables, and do not advertise KamehaDB filesystem or terminal capabilities. Terminate the complete child process tree and remove temporary state on success, protocol or CLI error, cancellation, and shutdown. Resolve pending permission callbacks with their correlation ids when their turn ends.

Verify: `go test ./internal/acp` uses a local ACP protocol test child to cover initialize/session/prompt streaming, HTTP MCP capability detection, permission round-trip, cancellation, process-tree cleanup, and temporary-directory cleanup without requiring installed agent CLIs.

Progress: todo
Result: none

### Task 4 — Route ACP turns through AiService and Wails lifecycle

Files: `internal/api/ai.go::AiService.StartChat/CancelChat/runChat`, `internal/api/connections.go::NewServices`, `main.go::OnShutdown`, `internal/api/ai_test.go`

Interfaces: `AiService` receives the ACP runtime and MCP runtime, adds a bound permission-response method that validates the active chat, the permission correlation id, and one available option, and emits typed `content`, `tool`, `permission`, `notice`, `error`, and `done` chat events. `Close` cancels active turns and closes ACP processes before the MCP listener shuts down.

Change: Preserve the provider branch unchanged. In ACP mode, build the visible transcript and existing connection context, skip `SearchRelevantSchema` and any provider-backed embedding request on cache miss, use the full schema fallback, optionally issue the selected profile's MCP session token, and call `internal/acp.Runtime.RunTurn`. Save completed text through existing connection-scoped chat history and never call provider chat or execute generated SQL. Return schema-only notice when MCP eligibility or HTTP capability is missing.

Verify: `go test ./internal/api` covers provider-path compatibility, ACP completion/history, ACP turns without provider credentials, a cache miss that performs no chat or embedding provider request and uses full schema, selected-profile token setup, MCP fallback notice, permission validation, cancellation, and shutdown.

Progress: todo
Result: none

### Task 5 — Add ACP settings and chat controls to the desktop

Files: `apps/desktop/src/components/api-settings-page.tsx::ApiSettingsPage`, `apps/desktop/src/hooks/use-chat.ts::useChat`, `apps/desktop/src/hooks/use-ai-chat.ts::useAISettings/useSaveAISettings`, `apps/desktop/src/components/ai-chat-panel.tsx::AIChatPanel`, `apps/desktop/src/lib/api.ts`, `apps/desktop/wailsjs/go/api/AiService.ts`, `apps/desktop/wailsjs/go/models.ts`

Interfaces: API Settings selects the provider or one fixed ACP preset. `useChat` consumes the typed Wails event payload and calls the generated permission-response binding. The chat panel renders agent text, tool activity, MCP/schema-only notice, permission choices, errors, and cancellation state.

Change: Add the backend selector and concise local-agent trust notice in API Settings, render ACP events in the existing chat, and return permission choices through the bound Go service. Use existing shadcn controls. Regenerate Wails bindings after the bound settings or permission API changes.

Verify: `wails generate module`, `pnpm typecheck`, and `pnpm --filter @kamehadb/desktop test` pass; UI coverage verifies backend selection, streamed tool/permission events, one-time permission choice, schema-only notice, and cancellation state.

Progress: todo
Result: none

### Task 6 — Update product, wiki, and release documentation

Files: `README.md`, `CHANGELOG.md`, `landing/src/components/home-view.tsx`, `landing/src/app/layout.tsx`, `landing/src/app/opengraph-image.tsx`, `landing/public/og-animated.gif`, `landing/public/images/chat-panel.png`, `docs/llm/integrations/ai-assistant.md`, `docs/llm/integrations/read-only-mcp.md`, `docs/llm/INDEX.md`

Interfaces: Documentation explains ACP chat, the fixed local presets, OpenCode provider setup, existing-profile-only MCP access, and the local CLI trust boundary. The approved delta adds ACP chat/permission/data/schema-fallback requirements, modifies provider settings, and adds the volatile MCP token requirement.

Change: Update the README feature list and Unreleased changelog; align the landing description, metadata, OpenGraph image, and chat screenshot with the new major workflow. Merge the approved wiki delta through `document-wiki` after code checks and preserve all existing MCP requirements. Document that the MCP-scoped MongoDB adapter returns only the configured profile database, while the general MongoDB adapter can enumerate databases; the generated MCP account also has only the configured database's `read` role.

Verify: Run `node .agents/skills/document-wiki/scripts/validate-llm-wiki.mjs .`, `git diff --check`, `node landing/scripts/render-og-animated.mjs`, `npm --prefix landing run build`, and `pnpm build`. Review all five public product surfaces listed in `AGENTS.md` for consistent feature copy.

Progress: todo
Result: none

## Files inspected, no change

- `internal/ai/provider.go` and `internal/ai/vecstore.go` — the current provider and embedding path that ACP mode must bypass for chat prompts.
- `internal/ai/schemactx.go` — existing schema context builder reused by provider and ACP paths.
- `internal/mcp/provisioner.go` — current managed-account scopes and MongoDB access-control probe.
- `apps/desktop/src/hooks/use-ai-settings.ts` — existing AI settings query used by API Settings and chat.
- `apps/desktop/src/lib/api.ts` — Wails bindings wrapper used by the desktop; there is no HTTP chat client.
- `docs/llm/integrations/ai-assistant.md` and `docs/llm/integrations/read-only-mcp.md` — existing requirement targets for the delta.

## Approval Gate

Status: approved (2026-10-19)

## Decision Log

- Revision 2026-10-19: replaced obsolete Tauri/TypeScript sidecar paths with the current Go/Wails services, Wails events, generated bindings, and embedded app lifecycle.
- Revision 2026-10-19 (review): folded in the plan review. MCP transport compatibility with a real preset is now an explicit verification point; the session-token profile identity is resolved per request through context rather than on the shared `serverState`; per-OS launch expansion and Node 22 are stated; preset versions are pinned; ACP ids are a shared constant union; the permission response is keyed by a correlation id; and the impact map names `use-ai-chat.ts`.
- D3 and D5 are confirmed by the user: ACP supplies chat, and ACP cache misses use full schema without provider-backed query embedding.
- D6 confirmed: `github.com/coder/acp-go-sdk` v0.13.5 is the chosen community Go SDK. Source review verified it is the latest release, declares Go 1.21, and exposes client stdio, initialize, session, prompt, cancel, permission callbacks, and HTTP `McpServers`. Its compatibility checks remain part of Task 3.
- The user authorized updating the MCP wiki page to match source before writing the delta. Source review confirmed that the MCP-scoped MongoDB adapter filters the database list to the profile database, even though the general MongoDB adapter can enumerate databases; design and task wording now preserve that distinction.
