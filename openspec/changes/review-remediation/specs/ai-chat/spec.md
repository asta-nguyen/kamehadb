## MODIFIED Requirements

### Requirement: Schema context error visibility

The `buildSchemaContext` function SHALL log errors via `log.error` before returning `null` on failure. The caller SHALL receive a clear indication that schema context is unavailable due to an error, not merely an absence of schema.

#### Scenario: Schema context build fails

- **WHEN** `buildSchemaContext` throws an error while listing collections or sampling documents
- **THEN** the error is logged via `log.error({ err }, 'buildSchemaContext')` before returning `null`, and the AI chat response indicates schema context is unavailable

### Requirement: Parallel collection stats retrieval

The AI schema context builder SHALL retrieve collection stats and sample documents in parallel using `Promise.all` instead of sequential `for` loops. This applies to the MongoDB schema context path in `ai.ts`.

#### Scenario: Building schema context for 10 collections

- **WHEN** the AI schema context builder processes 10 MongoDB collections
- **THEN** all `getCollectionStats` and `findDocuments` calls are issued in parallel via `Promise.all`, reducing wall time from 20×RTT to ~2×RTT
