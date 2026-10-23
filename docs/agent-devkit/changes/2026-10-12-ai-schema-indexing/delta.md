# Delta

Issue: #107

## ADDED Requirements

### AI-schema-index-on-demand

Page: `docs/llm/integrations/ai-assistant.md`

Search: FFF search for `AI-` under `docs/llm/` found the four existing AI requirements on this page and no indexing-lifecycle requirement; a search for `AI-schema-index-on-demand` returned no matches.

Requirement:

````md
### AI-schema-index-on-demand

The system SHALL defer SQL schema indexing until a selected connection needs relevance search for a general AI chat, reuse an in-flight index job for concurrent requests to the same connection, and serialize index jobs across connections.

#### Scenario: Sidecar starts without an AI schema scan

- GIVEN saved SQL connections exist
- WHEN the sidecar starts
- THEN the AI indexer does not scan those connections' schemas

#### Scenario: First general chat indexes its selected connection

- GIVEN an uncached general AI chat targets a SQL connection
- WHEN the chat needs schema relevance search and that connection has not been indexed in this sidecar lifetime
- THEN the chat waits while only that connection is indexed, then searches the local schema index

#### Scenario: Concurrent chats share and serialize index work

- GIVEN concurrent general AI chats need schema indexes
- WHEN they target the same connection or different connections
- THEN requests for the same connection share one index job and jobs across connections run one at a time

#### Scenario: Indexing fails

- GIVEN indexing the selected connection fails
- WHEN the chat continues to build schema context
- THEN it uses the existing full-schema fallback, and returns the existing schema-unavailable error only if that fallback also fails

Evidence: `apps/sidecar/src/index.ts`, `apps/sidecar/src/ai/indexer.ts`, `apps/sidecar/src/ai/vec-store.ts`, `apps/sidecar/src/routes/ai.ts`
````
