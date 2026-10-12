# AI Assistant

Verification: [x] Provider settings, schema-aware chat, provider-generated SQL execution, and chat persistence were checked against current Go backend and desktop source.

## Requirements

### AI-chat-history

The system SHALL persist user and assistant chat messages in local metadata SQLite, scoped by connection and MongoDB database where applicable.

#### Scenario: chat messages are saved for a connection

- GIVEN a user sends a chat message for a database connection
- WHEN the AI service finishes the assistant response
- THEN the user and assistant messages are available in that connection's local chat history

Evidence: `internal/api/ai.go`, `internal/store/chat.go`, `apps/desktop/src/components/ai-chat-panel.tsx`

### AI-chat-schema-context

The system SHALL include available schema and engine-specific context for the selected connection in provider-based chat requests.

#### Scenario: SQL chat includes connection schema context

- GIVEN a SQL connection has schema metadata available
- WHEN the user sends a provider-based chat request for that connection
- THEN the provider request includes the generated schema context and the database-specific instructions

Evidence: `internal/api/ai.go`, `internal/ai/schemactx.go`

### AI-chat-sql-execution

The system SHALL execute provider-generated SQL only after the shared query-safety check approves it and include at most 50 result rows in the follow-up provider request.

#### Scenario: safe generated SQL is checked and summarized

- GIVEN provider-based chat for a SQL connection returns a fenced SQL query
- WHEN the shared safety check approves and the query runs
- THEN the provider receives no more than 50 returned rows for its final answer

Evidence: `internal/api/ai.go`, `internal/sqlsafety/sqlsafety.go`

### AI-provider-settings

The system SHALL persist provider configuration and the active provider in metadata SQLite and use that provider for chat and embedding requests.

#### Scenario: valid provider settings are saved

- GIVEN API Settings contains a valid enabled active provider configuration
- WHEN the user saves settings
- THEN the backend persists the settings and subsequent chat and embedding requests resolve that active provider

Evidence: `apps/desktop/src/components/api-settings-page.tsx`, `internal/api/ai.go`, `internal/store/ai.go`, `internal/ai/provider.go`

## Flow

1. API Settings exposes Ollama local, Ollama cloud, OpenAI, 9router, DeepSeek, and Gemini; it loads provider configurations and saves changes through Wails bindings.
2. `AiService.SaveAISettings` validates that the active provider is enabled and that its configuration passes provider validation, then persists settings in metadata SQLite.
3. The chat panel starts a chat through `AiService.StartChat`, which validates the provider synchronously and streams the answer over `chat:<requestId>` events; the desktop renders `content` deltas, surfaces `error`, and finishes on `done`.
4. For provider-based SQL chat, the service first collects the provider's SQL generation silently, runs each fenced query that passes the shared safety check, and sends up to 50 result rows in a follow-up request that streams the final answer.
5. Chat history loads and clears through `GetChatHistory`/`ClearChatHistory`; `CancelChat` aborts an active stream.

MongoDB chat uses Mongo schema context. Redis receives an engine-specific system prompt without schema context. SQL chat checks the schema cache first — table-scoped when a table is selected, connection-scoped otherwise. On a cache miss, a selected table triggers a table-scoped DDL lookup; if that returns no DDL, the service searches stored embeddings, then falls back to the full schema, which caches at connection scope.

## State changes

- Provider configuration and the active provider are persisted in metadata SQLite.
- Chat messages are stored in metadata SQLite by connection and, for MongoDB, database.
- The desktop exposes recent history and clear-history actions scoped to the connection and, for MongoDB, the selected database.
- The frontend's active stream and cancellation state are transient; saved chat history is local backend state.

## Side effects

- The configured provider receives the prompt and schema context for each chat or embedding request. A remote provider endpoint receives these values when configured.
- Provider-based SQL chat may read the selected database and send a bounded result sample to the provider in a follow-up request.
- The backend caches schema context in its TTL cache under the same key the chat reads: table-scoped entries for selected tables and connection-scoped entries for full-schema fallbacks.

## Authorization & constraints

- Provider settings are stored in metadata SQLite; inspected sources do not establish OS Keychain encryption for this data.
- Provider-specific credentials are validated where required; local Ollama can be configured without a hosted-provider key.
- Provider-generated SQL is screened by the shared query-safety heuristic before execution; this is statement screening, not a database privilege boundary.
- The models proxy blocks literal loopback, private, link-local, and unspecified IP addresses, plus `localhost`, `.local`, `.internal`, and `metadata.google.internal`; it does not resolve DNS names before connecting.
- Inference from request construction: user prompts and available schema descriptions are sent to the configured provider. Source does not establish provider-side retention or processing guarantees.

## Error paths

- Invalid settings are rejected by `SaveAISettings` validation; chat start fails synchronously when the provider is missing, disabled, or misconfigured.
- Missing credentials, provider network errors, streaming failures, unsafe generated SQL, and database errors surface as `error` events or in the follow-up answer context.
- `CancelChat` aborts the active chat stream; the desktop keeps partial output and attaches the failure to the assistant message.
- Embedding API failures fall back to the local embedding implementation.

## Tests

- `internal/store/entities_test.go` (`TestChatMessages`, `TestAISettings`) covers chat-message and provider-settings persistence.
- Searches across `internal/api`, `internal/ai`, and `apps/desktop/src` test files found no chat-streaming or schema-context tests.

## Related

- [Query history](../workflows/query-history.md)
- [Read-only MCP server](read-only-mcp.md)
- [SQL workspace](../workflows/sql-workspace.md)

## Sources

- `apps/desktop/src/components/ai-chat-panel.tsx`
- `apps/desktop/src/components/api-settings-page.tsx`
- `apps/desktop/src/hooks/use-chat.ts`
- `apps/desktop/src/hooks/use-ai-chat.ts`
- `apps/desktop/src/lib/api.ts`
- `internal/ai/provider.go`
- `internal/ai/schemactx.go`
- `internal/ai/vecstore.go`
- `internal/api/ai.go`
- `internal/sqlsafety/sqlsafety.go`
- `internal/store/ai.go`
- `internal/store/chat.go`
- `internal/store/entities_test.go`
- `packages/shared/src/types.ts`
