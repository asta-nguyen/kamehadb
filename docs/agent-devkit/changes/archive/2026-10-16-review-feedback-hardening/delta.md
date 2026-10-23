# Delta

Merged into docs/llm/: 2026-10-17

## MODIFIED Requirements

### AI-chat-sql-execution

Page: `docs/llm/integrations/ai-assistant.md`
Previously: provider-generated SQL ran after the shared query-safety check and up to 50 result rows were sent to the provider for a final answer.

Baseline:

```md
### AI-chat-sql-execution

The system SHALL execute provider-generated SQL only after the shared query-safety check approves it and include at most 50 result rows in the follow-up provider request.

#### Scenario: safe generated SQL is checked and summarized

- GIVEN provider-based chat for a SQL connection returns a fenced SQL query
- WHEN the shared safety check approves and the query runs
- THEN the provider receives no more than 50 returned rows for its final answer

Evidence: `internal/api/ai.go`, `internal/sqlsafety/sqlsafety.go`
```

Replacement:

```md
### AI-chat-sql-execution

The system SHALL display provider-generated SQL for user review without executing it from the AI chat flow or sending database query results to the provider.

#### Scenario: generated SQL waits for explicit execution

- GIVEN provider-based chat for a SQL connection returns a fenced SQL query
- WHEN the assistant response is displayed
- THEN the query is visible in chat, no database query runs from the AI chat flow, and no query result rows are sent to the provider

Evidence: `internal/api/ai.go`, `internal/api/ai_test.go`, `apps/desktop/src/components/sql-editor.tsx`
```
