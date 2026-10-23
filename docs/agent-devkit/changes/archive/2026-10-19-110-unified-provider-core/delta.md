# Delta

Merged into docs/llm/: 2026-10-20

Issue: [#110](https://github.com/asta-nguyen/kamehadb/issues/110)

Architectural proposal; approval is recorded only in tasks.md. These additions do not change the normative text, scenarios or ownership of ENG-duckdb-runtime. Task 6 may retarget its current Evidence paths/Sources only; historical Baseline blocks remain verbatim.

## ADDED Requirements

### ENG-provider-core

Page: `docs/llm/architecture/engine-support.md`
Search: searched docs/ for ENG requirement headings and provider/core identifiers; the existing ENG page and open footprint delta do not cover public provider selection or package reuse.

Requirement:

````md
### ENG-provider-core

The system SHALL provide a public Go database core with explicit registration for the ten supported engine kinds, selective or all-in-one assembly, and no dependencies on application-internal packages or Wails.

#### Scenario: external consumer opens SQLite

- GIVEN a separate Go consumer registers SQLite alone or uses all-in-one assembly
- WHEN it opens a private SQLite fixture through the core
- THEN it can execute and read the fixture without initializing KamehaDB profiles, credential storage or Wails

#### Scenario: selection is invalid

- GIVEN a registry has no provider for a kind or already has a provider registered for it
- WHEN a caller opens the unregistered kind or registers the duplicate
- THEN the core returns a selection error before database work

Evidence: `dbcore/registry.go`, `dbcore/manager_test.go`, `dbcore/providers/all/all.go`, `dbcore/example_test.go`, `dbcore/dependency_boundary_test.go`, `dbcore/engines/kinds_test.go`
````

### ENG-provider-capabilities

Page: `docs/llm/architecture/engine-support.md`
Search: searched every docs/ page containing ENG requirement headings; no requirement defines the shared provider lifecycle with native SQL, document and key-value accessors.

Requirement:

````md
### ENG-provider-capabilities

The system SHALL expose native SQL, MongoDB and Redis capabilities through transport-independent operation interfaces selected by one core without exposing concrete driver adapters or changing existing query languages, serialized results or optional SQL capabilities.

#### Scenario: service requests the wrong family

- GIVEN a MongoDB provider
- WHEN a SQL service calls the typed core SQL capability helper
- THEN the helper returns ErrCapabilityUnsupported before a SQL operation is executed

#### Scenario: app family lookup rejects before construction

- GIVEN a caller requests a SQL, MongoDB or Redis family that does not match the entry config
- WHEN Manager.Get evaluates the app's ConfigCheck on that loaded or cached config
- THEN that request is rejected before factory dispatch and does not poison another accepted caller's entry

#### Scenario: SQL supports an optional operation

- GIVEN a SQL adapter supports native CSV export or metadata-aware preview
- WHEN its provider exposes the SQL capability
- THEN the caller receives the original adapter and retains that optional operation

#### Scenario: alternate MongoDB or Redis implementation

- GIVEN a fake MongoDB or Redis implementation of the public operation interfaces
- WHEN a consumer obtains its capability through the core
- THEN the consumer uses the same typed operations without importing concrete provider adapters

Evidence: `dbcore/provider.go`, `dbcore/capabilities.go`, `dbcore/capabilities_test.go`, `dbcore/manager_test.go`, `dbcore/mongo/contracts.go`, `dbcore/redis/contracts.go`, `dbcore/providers/all/all_test.go`, `internal/database/database.go`
````

### ENG-provider-cache-lifecycle

Page: `docs/llm/architecture/engine-support.md`
Search: searched existing ENG requirements and the open footprint delta; no existing requirement owns unified provider construction and cache retirement. Existing cancellation behavior remains owned by ENG-gui-cancel.

Requirement:

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

### ENG-provider-close-order

Page: `docs/llm/architecture/engine-support.md`
Search: checked ENG-gui-cancel in the open footprint delta; it owns when GUI requests cancel. This addition owns only the ordering of that cancellation relative to provider teardown.

Requirement:

````md
### ENG-provider-close-order

The system SHALL perform the existing cancellation of affected GUI work before closing its managed SQL, MongoDB or Redis provider.

#### Scenario: provider teardown follows cancellation

- GIVEN an existing profile-change or shutdown path cancels affected GUI work
- WHEN that path tears down its managed provider
- THEN all affected request contexts are already cancelled when provider close runs

Evidence: `internal/api/connections.go`, `internal/api/request-lifecycle_test.go`
````

### ENG-provider-session-scope

Page: `docs/llm/architecture/engine-support.md`
Search: searched existing ENG requirements and the open footprint delta; none defines connection/session close scope independently of an underlying runtime.

Requirement:

````md
### ENG-provider-session-scope

The system SHALL scope provider close to its owned connection/session rather than terminating an unrelated shared runtime or sibling session.

#### Scenario: sibling sessions share a runtime

- GIVEN two fake provider sessions backed by one fake runtime
- WHEN the manager invalidates one session
- THEN only that session is released and its sibling remains usable

#### Scenario: DuckDB owns its helper

- GIVEN a DuckDB provider owns one initialized helper process
- WHEN that provider closes
- THEN its owned helper is stopped and cleaned up

Evidence: `dbcore/manager_test.go`, `dbcore/providers/duckdb/duckdb.go`, `dbcore/providers/duckdb/duckdb_test.go`
````
