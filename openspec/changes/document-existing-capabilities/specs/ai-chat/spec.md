## ADDED Requirements

### Requirement: Multi-provider AI chat

The system SHALL support AI chat through multiple providers (Ollama local, Ollama cloud, OpenAI, DeepSeek, Gemini, 9Router), with per-provider configuration for enabled state, model, base URL, and API key.

#### Scenario: Send chat message

- **WHEN** user sends a message in the AI chat panel
- **THEN** the system forwards the message to the active provider and streams the response

#### Scenario: Switch provider

- **WHEN** user changes the active AI provider
- **THEN** the system uses the new provider for subsequent messages

#### Scenario: Provider not configured

- **WHEN** user attempts to chat with an unconfigured provider
- **THEN** the system returns an error indicating the provider is not enabled or missing configuration

### Requirement: Schema-aware context injection

The system SHALL build schema context from the connected database and inject it into AI chat messages, enabling schema-aware responses. For SQL databases, context includes schemas, tables, columns, and indexes. For MongoDB, context includes databases, collections, and sampled field types.

#### Scenario: SQL schema context

- **WHEN** user sends a chat message with an active SQL connection
- **THEN** the system injects schema, table, and column information into the system prompt

#### Scenario: MongoDB schema context

- **WHEN** user sends a chat message with an active MongoDB connection
- **THEN** the system injects database, collection, and sampled field type information into the system prompt

#### Scenario: No active connection

- **WHEN** user sends a chat message without an active connection
- **THEN** the system proceeds without schema context

### Requirement: AI chat history persistence

The system SHALL persist chat history in the local SQLite metadata store, keyed by connection ID, with message role, content, and timestamp.

#### Scenario: Save chat message

- **WHEN** a chat message is sent or received
- **THEN** the system stores it in the chat history for the active connection

#### Scenario: Load chat history

- **WHEN** user opens the AI chat panel for a connection
- **THEN** the system loads and displays previous chat messages for that connection

#### Scenario: Clear chat history

- **WHEN** user clears chat history for a connection
- **THEN** the system removes all stored messages for that connection

### Requirement: Vector-based schema search

The system SHALL index schema metadata into a vector store and perform semantic search to find relevant schema context for AI chat queries, improving context relevance for large schemas.

#### Scenario: Index connection schemas

- **WHEN** the sidecar starts or a new connection is saved
- **THEN** the system indexes all SQL connection schemas into the vector store

#### Scenario: Search relevant schema

- **WHEN** a chat message references specific schema elements
- **THEN** the system searches the vector store and includes only the most relevant schema context in the prompt

### Requirement: AI schema actions

The system SHALL provide right-click AI actions on schema tree elements: explain schema, generate test data, and suggest index.

#### Scenario: Explain schema

- **WHEN** user right-clicks a table and selects "Explain Schema"
- **THEN** the system sends a chat request with the table's schema context asking for an explanation

#### Scenario: Generate test data

- **WHEN** user right-clicks a table and selects "Generate Test Data"
- **THEN** the system sends a chat request with the table's schema context asking for sample INSERT statements

#### Scenario: Suggest index

- **WHEN** user right-clicks a table and selects "Suggest Index"
- **THEN** the system sends a chat request with the table's schema and query patterns asking for index recommendations
