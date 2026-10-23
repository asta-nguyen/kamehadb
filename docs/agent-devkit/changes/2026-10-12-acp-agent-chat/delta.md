# Delta

## ADDED Requirements

### AI-acp-agent-chat

Page: `docs/llm/integrations/ai-assistant.md`
Search: checked the AI-prefixed requirements on the AI Assistant page; none covers routing chat through an ACP agent.

Requirement:

````md
### AI-acp-agent-chat

The system SHALL send chat turns to the selected ACP agent, stream its text response in chat, and save the completed response in the existing connection-scoped history.

#### Scenario: selected agent replies in chat

- GIVEN AI Settings selects a supported ACP agent and chat has a selected connection
- WHEN the user sends a message
- THEN the selected agent's text is streamed in chat and the completed assistant response is saved to that connection's history

Evidence: `apps/desktop/src/components/ai-chat-panel.tsx`, `apps/desktop/src/hooks/use-chat.ts`, `internal/api/ai.go`, `internal/acp/runtime.go`, `internal/store/chat.go`, `internal/api/ai_test.go`
````

### AI-acp-agent-permissions

Page: `docs/llm/integrations/ai-assistant.md`
Search: checked the AI-prefixed requirements on the AI Assistant page; none covers ACP permission requests.

Requirement:

````md
### AI-acp-agent-permissions

The system SHALL show ACP permission requests and their available choices in chat, then return the user's selected choice to the matching active turn.

#### Scenario: user answers an ACP permission request

- GIVEN the active ACP turn requests permission and provides available choices
- WHEN the user selects one of those choices in chat
- THEN KamehaDB returns that choice to the matching active request and rejects a stale or invalid choice

Evidence: `internal/acp/runtime.go`, `internal/api/ai.go`, `apps/desktop/src/hooks/use-chat.ts`, `apps/desktop/src/components/ai-chat-panel.tsx`
````

### AI-acp-read-only-data

Page: `docs/llm/integrations/ai-assistant.md`
Search: checked the AI-prefixed requirements on the AI Assistant page; none covers ACP database access and its schema-only fallback.

Requirement:

````md
### AI-acp-read-only-data

The system SHALL provide ACP database tools only through the selected profile's existing read-only MCP access when that profile is enabled and the agent advertises HTTP MCP support, with schema-only context otherwise and no execution of ACP-produced SQL.

#### Scenario: profile or agent lacks MCP eligibility

- GIVEN the selected profile is not MCP-enabled or the agent does not advertise HTTP MCP support
- WHEN the ACP session starts
- THEN no MCP server is attached, available schema context is used, and ACP-produced SQL is not executed

Evidence: `internal/api/ai.go`, `internal/acp/runtime.go`, `internal/mcp/runtime.go`, `internal/mcp/manager.go`, `apps/desktop/src/components/ai-chat-panel.tsx`
````

### AI-acp-schema-fallback

Page: `docs/llm/integrations/ai-assistant.md`
Search: checked the AI-prefixed requirements on the AI Assistant page; none covers ACP schema-cache misses without provider-backed query embeddings.

Requirement:

````md
### AI-acp-schema-fallback

The system SHALL use full schema context on an ACP schema-cache miss without sending the chat prompt to KamehaDB's embedding provider for semantic retrieval.

#### Scenario: ACP chat has a schema-cache miss

- GIVEN an ACP chat turn has no cached schema context for its selected connection
- WHEN the backend prepares context for the agent
- THEN it supplies the full schema context and makes no KamehaDB chat or query-embedding provider request

Evidence: `internal/api/ai.go`, `internal/ai/schemactx.go`, `internal/ai/vecstore.go`, `internal/api/ai_test.go`
````

### MCP-acp-session-token

Page: `docs/llm/integrations/read-only-mcp.md`
Search: checked every MCP-prefixed requirement on the Read-only MCP page; none covers temporary ACP session tokens.

Requirement:

````md
### MCP-acp-session-token

The system SHALL issue each eligible ACP turn a volatile MCP bearer token scoped to the selected, already-enabled profile and reject that token after the turn ends.

#### Scenario: ACP token stays within one profile and one turn

- GIVEN an ACP turn uses a profile already enabled for MCP
- WHEN the agent accesses MCP during the turn and the turn later ends
- THEN MCP tools accept only that profile while the turn is active and reject the token after cleanup

Evidence: `internal/mcp/runtime.go`, `internal/mcp/jsonrpc.go`, `internal/mcp/manager.go`, `internal/api/ai.go`, `internal/mcp/mcp_test.go`
````

## MODIFIED Requirements

### AI-provider-settings

Page: `docs/llm/integrations/ai-assistant.md`
Search: found the existing requirement stating that the active provider serves chat and embedding requests; ACP chat uses the selected agent instead.

Requirement:

````md
### AI-provider-settings

The system SHALL persist provider configuration and use the active provider for provider-based chat and embedding requests, while routing ACP chat through the selected agent without sending its chat prompt to KamehaDB's provider.

#### Scenario: ACP chat bypasses the configured chat provider

- GIVEN AI Settings selects an ACP agent
- WHEN the user sends an ACP chat turn
- THEN the selected agent receives the chat turn and KamehaDB's configured chat provider does not receive that prompt

Evidence: `apps/desktop/src/components/api-settings-page.tsx`, `internal/api/ai.go`, `internal/ai/provider.go`, `internal/ai/vecstore.go`, `internal/store/ai.go`, `packages/shared/src/types.ts`
````
