# Delta

Merged into docs/llm/: 2026-10-20

Issue: #110

## MODIFIED Requirements

### ENG-provider-cache-lifecycle

Previously: the manager shared one provider entry per connection and retired constructions after invalidation or the last waiter leaving.

Baseline:

````md
### ENG-provider-cache-lifecycle

The system SHALL share one managed provider entry per connection ID using entry-owned factory context and prevent retired constructions from repopulating the cache.

#### Scenario: concurrent gets share one provider

- GIVEN multiple callers get the same connection ID concurrently
- WHEN their shared entry finishes construction
- THEN the factory was invoked once and every successful caller receives the same published provider

#### Scenario: invalidation races with construction

- GIVEN provider creation is in progress for a connection
- WHEN the manager invalidates that connection before creation finishes
- THEN the late provider is closed once and cannot repopulate the cache

#### Scenario: one waiter cancels

- GIVEN two callers await one entry's factory
- WHEN the first caller cancels while the second still waits
- THEN the entry context remains active and the second caller can receive the provider

#### Scenario: the last waiter cancels

- GIVEN all waiting callers abandon unfinished provider construction
- WHEN the last caller cancels
- THEN the entry is retired, its context is cancelled, and any late result is closed rather than cached

Evidence: `dbcore/manager.go`, `dbcore/manager_test.go`
````

Replacement:

````md
### ENG-provider-cache-lifecycle

The system SHALL share one managed provider entry per connection ID, avoid profile-store reads on live cache hits, and prevent retired entries or constructions from serving callers or repopulating the cache.

#### Scenario: concurrent gets share one provider

- GIVEN multiple callers get the same connection ID concurrently
- WHEN their shared entry finishes construction
- THEN the factory was invoked once and every successful caller receives the same published provider

#### Scenario: a cache hit reuses its loaded config

- GIVEN a live managed provider entry for a connection
- WHEN another caller gets that connection
- THEN the manager reuses the entry without loading or decrypting the profile again

#### Scenario: invalidation races with construction

- GIVEN provider creation is in progress for a connection
- WHEN the manager invalidates that connection before creation finishes
- THEN the late provider is closed once and cannot repopulate the cache

#### Scenario: one waiter cancels

- GIVEN two callers await one entry's factory
- WHEN the first caller cancels while the second still waits
- THEN the entry context remains active and the second caller can receive the provider

#### Scenario: a new get follows last-waiter cancellation

- GIVEN the last caller leaves an unfinished entry while the manager remains open
- WHEN a new caller gets the same connection during retirement
- THEN it does not join the retired entry or receive the manager-closed error and can use a fresh entry

#### Scenario: invalidation retires a caller waiting for profile load

- GIVEN a caller is waiting for a managed entry's profile load
- WHEN the manager invalidates that entry
- THEN the admitted caller receives the provider-retired error and a later get can create a fresh entry

#### Scenario: the manager is closed

- GIVEN the manager has completed shutdown
- WHEN a new caller gets a connection
- THEN the manager-closed error is returned without loading a profile or invoking a factory

Evidence: `dbcore/manager.go`, `dbcore/manager_test.go`, `internal/database/database.go`, `internal/database/database_test.go`
````

## ADDED Requirements

### ENG-provider-file-maintenance

Page: `docs/llm/architecture/engine-support.md`
Search: checked the only current wiki page using the ENG prefix and all open change requirement headings; no existing requirement covers file-maintenance serialization across profiles.

Requirement:

````md
### ENG-provider-file-maintenance

The system SHALL serialize file-database maintenance with managed provider opens for the same canonical file and close every provider that can hold that file before modifying it.

#### Scenario: profiles share a file during maintenance

- GIVEN two profiles point to the same canonical SQLite or DuckDB file
- WHEN maintenance begins for either profile
- THEN both managed providers are closed before the file operation, queued opens wait until cache cleanup completes, and providers for unrelated files remain available

#### Scenario: provider close fails before maintenance

- GIVEN a provider for the target file fails to close
- WHEN backup or restore begins
- THEN the file operation is skipped and the close failure is returned

Evidence: `internal/database/database.go`, `internal/database/database_test.go`, `internal/api/connections.go`, `internal/maintenance/filedb.go`
````

### ENG-legacy-sql-kind-compatibility

Page: `docs/llm/architecture/engine-support.md`
Search: checked the only current wiki page using the ENG prefix and all open change requirement headings; no existing requirement covers the app fallback for retained legacy Qdrant profiles.

Requirement:

````md
### ENG-legacy-sql-kind-compatibility

The system SHALL preserve the app's unsupported-adapter behavior for retained legacy SQL-route profiles without registering those kinds in the public provider core.

#### Scenario: a saved legacy Qdrant profile uses the SQL route

- GIVEN a saved Qdrant profile retained by the app's profile schema
- WHEN the SQL route requests metadata, preview, or a query
- THEN metadata lists are empty and preview/query operations return the unsupported-adapter error

Evidence: `internal/engines/kinds.go`, `dbcore/engines/adapter.go`, `internal/database/database.go`, `internal/database/database_test.go`
````
