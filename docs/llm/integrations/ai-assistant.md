# AI Assistant

Verification: [x] Provider settings, schema-aware chat, on-demand schema indexing, provider-generated SQL display, and chat persistence were checked against current Go backend, desktop source, and tests.

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

The system SHALL display provider-generated SQL for user review without executing it from the AI chat flow or sending database query results to the provider.

#### Scenario: generated SQL waits for explicit execution

- GIVEN provider-based chat for a SQL connection returns a fenced SQL query
- WHEN the assistant response is displayed
- THEN the query is visible in chat, no database query runs from the AI chat flow, and no query result rows are sent to the provider

Evidence: `internal/api/ai.go`, `internal/api/ai_test.go`, `apps/desktop/src/components/sql-editor.tsx`

### AI-provider-settings

The system SHALL persist provider configuration and the active provider in metadata SQLite and use that provider for chat and embedding requests.

#### Scenario: valid provider settings are saved

- GIVEN API Settings contains a valid enabled active provider configuration
- WHEN the user saves settings
- THEN the backend persists the settings and subsequent chat and embedding requests resolve that active provider

Evidence: `apps/desktop/src/components/api-settings-page.tsx`, `internal/api/ai.go`, `internal/store/ai.go`, `internal/ai/provider.go`

### AI-schema-index-on-demand

The system SHALL defer SQL schema indexing until a selected connection needs relevance search for a general AI chat, reuse an in-flight index job for concurrent requests to the same connection, and serialize index jobs across connections.

#### Scenario: App starts without an AI schema scan

- GIVEN saved SQL connections exist
- WHEN the app starts
- THEN the AI indexer does not scan those connections' schemas

#### Scenario: First general chat indexes its selected connection

- GIVEN an uncached general AI chat targets a SQL connection
- WHEN the chat needs schema relevance search and that connection has not been indexed in this process lifetime
- THEN the chat waits while only that connection is indexed, then searches the local schema index

#### Scenario: Concurrent chats share and serialize index work

- GIVEN concurrent general AI chats need schema indexes
- WHEN they target the same connection or different connections
- THEN requests for the same connection share one index job and jobs across connections run one at a time

#### Scenario: Indexing fails

- GIVEN indexing the selected connection fails
- WHEN the chat continues to build schema context
- THEN it uses the existing full-schema fallback, and returns the existing schema-unavailable error only if that fallback also fails

Evidence: `internal/ai/indexer.go`, `internal/api/ai.go`, `internal/ai/vecstore.go`

## Flow

1. API Settings exposes Ollama local, Ollama cloud, OpenAI, 9router, DeepSeek, and Gemini; it loads provider configurations and saves changes through Wails bindings.
2. `AiService.SaveAISettings` validates that the active provider is enabled and that its configuration passes provider validation, then persists settings in metadata SQLite.
3. The chat panel starts a chat through `AiService.StartChat`, which validates the provider synchronously and streams the answer over `chat:<requestId>` events; the desktop renders `content` deltas, surfaces `error`, and finishes on `done`.
4. For provider-based SQL chat, the service streams the provider's response verbatim, so any fenced SQL is displayed in chat for the user to review and run in the editor; the AI flow never executes the generated SQL or sends query result rows to the provider.
5. Chat history loads and clears through `GetChatHistory`/`ClearChatHistory`; `CancelChat` aborts an active stream.

MongoDB chat uses Mongo schema context. Redis receives an engine-specific system prompt without schema context. SQL chat checks the schema cache first — table-scoped when a table is selected, connection-scoped otherwise. On a cache miss, a selected table triggers a table-scoped DDL lookup and never indexes the connection. A general chat instead ensures the connection's schema index: `SchemaIndexer` scans that connection's metadata and writes embeddings the first time it is needed, concurrent chats for the same connection share the in-flight job, and connections are indexed one at a time under a global lock. The service then searches the stored embeddings and falls back to the full schema when indexing was skipped or produced no hits; the fallback caches at connection scope.

## State changes

- Provider configuration and the active provider are persisted in metadata SQLite.
- Chat messages are stored in metadata SQLite by connection and, for MongoDB, database.
- The desktop exposes recent history and clear-history actions scoped to the connection and, for MongoDB, the selected database.
- The frontend's active stream and cancellation state are transient; saved chat history is local backend state.

## Side effects

- The configured provider receives the prompt and schema context for each chat or embedding request. A remote provider endpoint receives these values when configured.
- The AI chat flow does not read the selected database or send query results to the provider: provider-generated SQL is displayed for review and runs only when the user executes it in the editor.
- The backend caches schema context in its TTL cache under the same key the chat reads: table-scoped entries for selected tables and connection-scoped entries for full-schema fallbacks.
- Schema metadata reads and provider embedding calls are deferred to the first uncached general AI chat of each SQL connection in a process lifetime — nothing is scanned at application startup; on restart the first chat recomputes table hashes and re-embeds only changed tables.

## Authorization & constraints

- Profile passwords, connection strings, and AI provider API keys are encrypted at rest in metadata SQLite using the AES-256-GCM app secret vault, whose key is kept in the OS keychain with an owner-only key-file fallback; the metadata directory and database are restricted to owner-only on POSIX.
- Provider-specific credentials are validated where required; local Ollama can be configured without a hosted-provider key.
- The AI chat flow surfaces provider-generated SQL for user review and does not execute it, so it is not itself a database privilege boundary.
- The models proxy blocks literal loopback, private, link-local, and unspecified IP addresses, plus `localhost`, `.local`, `.internal`, and `metadata.google.internal`; it does not resolve DNS names before connecting.
- Inference from request construction: user prompts and available schema descriptions are sent to the configured provider. Source does not establish provider-side retention or processing guarantees.

## Error paths

- Invalid settings are rejected by `SaveAISettings` validation; chat start fails synchronously when the provider is missing, disabled, or misconfigured.
- Missing credentials, provider network errors, and streaming failures surface as `error` events.
- `CancelChat` aborts the active chat stream; the desktop keeps partial output and attaches the failure to the assistant message.
- Embedding API failures fall back to the local embedding implementation.
- A skipped or failed schema-index run is logged, leaves the connection uncompleted so a later chat retries, and the chat proceeds to relevance search and the full-schema fallback; the schema-unavailable error is returned only when that fallback also fails.

## Tests

- `internal/store/entities_test.go` (`TestChatMessages`, `TestAISettings`) covers chat-message and provider-settings persistence.
- `internal/api/ai_test.go` (`TestRunChatDoesNotExecuteGeneratedSQL`) asserts a chat makes exactly one provider request and never acquires a database adapter, proving generated SQL is not executed.
- `internal/ai/indexer_test.go` (`TestEnsureConnectionSchemaIndexed_*`) covers first-use indexing, subsequent-use reuse, same-connection in-flight sharing, cross-connection serialization, disabled-provider skip, failure retry, and caller cancellation leaving the job running.
- `internal/api/ai_test.go` (`TestStartChatOnDemandIndexing`) proves a general chat indexes before relevance search, a table-scoped chat skips indexing, and a failed index still falls back to the full schema.

## Related

- [Query history](../workflows/query-history.md)
- [Read-only MCP server](read-only-mcp.md)
- [SQL workspace](../workflows/sql-workspace.md)

## Sources

- `apps/desktop/src/components/ai-chat-panel.tsx`
- `apps/desktop/src/components/api-settings-page.tsx`
- `apps/desktop/src/components/sql-editor.tsx`
- `apps/desktop/src/hooks/use-chat.ts`
- `apps/desktop/src/hooks/use-ai-chat.ts`
- `apps/desktop/src/lib/api.ts`
- `internal/ai/indexer.go`
- `internal/ai/indexer_test.go`
- `internal/ai/provider.go`
- `internal/ai/schemactx.go`
- `internal/ai/vecstore.go`
- `internal/api/ai.go`
- `internal/api/ai_test.go`
- `internal/store/ai.go`
- `internal/store/chat.go`
- `internal/store/entities_test.go`
- `packages/shared/src/types.ts`
