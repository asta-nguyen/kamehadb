# Delta

Merged into docs/llm/: 2026-10-18

Issue: none provided

## MODIFIED Requirements

### MCP-call-history-capture

Previously: call-history inputs were described as validated before recording.

Baseline:

````md
### MCP-call-history-capture

The system SHALL record validated inputs and call summaries for database-backed MCP tools without storing returned database rows or documents in history or changing the tool response.

#### Scenario: successful query is summarized

- GIVEN an enabled MCP `sql_query` call returns two rows
- WHEN the tool callback completes
- THEN history stores its validated input and item count without the rows, while the original MCP response still contains them

#### Scenario: rejected query stores only its stable error code

- GIVEN `sql_query` rejects an unsafe statement
- WHEN the tool callback completes
- THEN history stores the error code with no item count, and `list_mcp_profiles` does not create a history entry

Evidence: `internal/mcp/tools.go`, `internal/mcp/mcp_test.go`
````

Replacement:

````md
### MCP-call-history-capture

The system SHALL record request arguments and call summaries for database-backed MCP tools without storing returned database rows or documents in history or changing the tool response.

#### Scenario: successful query is summarized

- GIVEN an enabled MCP `sql_query` call returns two rows
- WHEN the tool handler completes
- THEN history stores its request arguments and item count without the rows, while the original MCP response still contains them

#### Scenario: rejected query stores its stable error code

- GIVEN `sql_query` rejects an unsafe statement
- WHEN the tool handler completes
- THEN history stores the request arguments and error code with no item count, and `list_mcp_profiles` does not create a history entry

Evidence: `internal/mcp/jsonrpc.go`, `internal/store/mcp.go`, `internal/mcp/mcp_test.go`
````
