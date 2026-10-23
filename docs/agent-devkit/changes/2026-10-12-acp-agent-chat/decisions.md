# Decisions

### D1 — Run ACP agents in AI chat

Question: Should KamehaDB run ACP agents inside its existing AI chat, or expose an ACP endpoint for external agents to connect to?

Decision: KamehaDB acts as the ACP client and launches agents locally inside AI chat.

Impact: Adds a local ACP process and a chat path to the existing Go/Wails flow.

Confirmed by user: 2026-10-12

### D2 — Reuse only enabled read-only MCP access

Question: May an ACP agent use the selected connection's existing MCP profile?

Decision: Attach KamehaDB's HTTP MCP server only when the selected profile was already MCP-enabled and the agent advertises HTTP MCP support. Do not provision a managed account or enable MCP automatically. Otherwise provide schema context only for the selected connection.

Impact: Adds a volatile profile-scoped token; the persisted global MCP token is never passed to an agent.

Confirmed by user: 2026-10-12

### D3 — ACP agent supplies the chat model backend

Question: Can ACP replace KamehaDB's direct Ollama or API-backed chat provider?

Decision: In ACP mode, send the chat turn to the selected local agent, which uses its own provider configuration. Keep the configured KamehaDB provider for provider-based chat and embedding work. OpenCode is the ACP preset for users who want its Ollama or OpenAI-compatible provider setup.

Impact: KamehaDB must not require its model-provider credentials for ACP chat or send the chat prompt to that provider. The user's OpenCode configuration remains available, and its independently configured tools remain under the CLI's trust boundary.

Confirmed by user: 2026-10-19

### D4 — Fixed ACP agent set

Question: Which ACP agents should KamehaDB expose as built-in presets?

Decision: Expose exactly Codex, Claude, OpenCode, and Devin. Users install and authenticate the CLIs themselves.

Impact: The settings selector and Go launch catalog contain exactly these four fixed entries; no arbitrary command editor or dynamic registry is included.

Confirmed by user: 2026-10-12

### D5 — Do not send ACP prompts to the embedding provider

Question: May ACP-mode schema retrieval send a chat prompt to KamehaDB's embedding endpoint on a cache miss?

Decision: No. Skip semantic retrieval that embeds the prompt and use full schema context on an ACP cache miss.

Impact: ACP turns do not send the user's prompt to a KamehaDB provider for either chat or query embedding; schema context may be larger. Existing provider-backed embeddings outside ACP chat remain unchanged.

Confirmed by user: 2026-10-19

### D6 — Use the community Go ACP SDK

Question: Which ACP v1 client implementation fits the in-process Go/Wails backend?

Decision: Use `github.com/coder/acp-go-sdk` v0.13.5. The official ACP community library directory lists it as a community Go library, and the repository documents stdio client support. The dependency is pinned, and the supported v1 messages, HTTP MCP capabilities, permission callbacks, streaming order, cancellation, and shutdown cleanup are verified in Task 3.

Impact: Adds one Go module dependency. The SDK is community-maintained rather than an official ACP library, so compatibility is a plan risk; if it cannot support the approved behavior, return to the approval gate before changing protocol implementation or scope. Source review of v0.13.5 confirmed it is the latest release, declares `go 1.21`, and exposes `NewClientSideConnection`, `Initialize`, `NewSession`, `Prompt`, `Cancel`, `Client.RequestPermission`, `SessionUpdate`, `McpCapabilities.Http`, and `NewSessionRequest.McpServers`.

Confirmed by user: 2026-10-19

### D7 — Review-driven hardening

Question: Which plan-review findings are adopted before implementation?

Decision: Adopt all of them: (1) treat real-preset MCP transport compatibility as a verification point with a schema-only fallback; (2) resolve the session-token profile per request through context, not on the shared `serverState`; (3) state the per-OS launch expansion and Node 22 prerequisite and pin preset package versions; (4) express ACP ids as a shared constant union; (5) key the permission response by a correlation id; (6) name `use-ai-chat.ts` in the impact map and keep `KAMEHADB_*` stripping as defensive only.

Impact: No scope change; the adjustments tighten interfaces, verification, and public-surface accuracy.

Confirmed by user: 2026-10-19
