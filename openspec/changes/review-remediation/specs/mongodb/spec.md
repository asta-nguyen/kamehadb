## MODIFIED Requirements

### Requirement: Parallel collection sampling

The MongoDB autocomplete and schema browse endpoints SHALL sample collections in parallel using `Promise.all` instead of sequential `for` loops. Individual collection sampling failures SHALL be handled gracefully via `Promise.allSettled` or per-collection try/catch, preserving the existing "skip failed collections" behavior.

#### Scenario: Autocomplete for database with 50 collections

- **WHEN** the autocomplete endpoint lists collections and samples each for field hints
- **THEN** all `findDocuments` calls are issued in parallel, reducing wall time from 50×RTT to ~1×RTT

#### Scenario: One collection sampling fails during parallel fetch

- **WHEN** one collection's `findDocuments` call fails during parallel sampling
- **THEN** that collection is skipped with a `log.warn` entry, and all other collections return their fields normally
