# Delta

Status: jointly approved with design.md and tasks.md on 2026-10-13 after the user said “do it”. Original pre-change Baseline blocks remain unchanged; Tasks 1–4 are historical completed work, not approval of new scope. Replacements/additions are prospective until their implementation and source/tests pass. Full CSV scope remains PostgreSQL/SQLite.

## MODIFIED Requirements

### SQL-gui-result-bounds

Page: `docs/llm/workflows/sql-workspace.md`
Previously: GUI SQL results had a row ceiling without a byte ceiling.

Baseline:

````md
### SQL-gui-result-bounds

The system SHALL cap unpaginated GUI SQL results at 50,000 rows.

#### Scenario: row ceiling

- GIVEN a SQLite query producing 60,000 rows
- WHEN it runs through the GUI adapter
- THEN 50,000 rows are returned with truncation indicated

Evidence: `internal/engines/types.go`, `internal/engines/sqlite/sqlite.go`, `internal/engines/sqlite/sqlite_test.go`
````

Replacement:

````md
### SQL-gui-result-bounds

The system SHALL bound GUI SQL results by whole-row admission, an 8 MiB encoded-result ceiling, and a 50,000-row ceiling, with a 2 MiB ceiling for previews.

#### Scenario: wide rows reach the byte ceiling

- GIVEN a query producing many wide rows
- WHEN the next whole row would exceed the result budget
- THEN collection stops, truncation is indicated, and previously admitted values remain unchanged

#### Scenario: oversized first preview row

- GIVEN a row larger than the preview budget
- WHEN its table is browsed
- THEN no clipped value is represented as the original row and the UI explains the limit

Evidence: `dbcore/engines/types.go`, `dbcore/engines/result-budget.go`, `dbcore/providers/sqlite/sqlite.go`, `dbcore/providers/sqlite/sqlite_test.go`
````

### SQL-preview-paging

Page: `docs/llm/workflows/sql-workspace.md`
Previously: previews used offset paging, including deep pages.

Baseline:

````md
### SQL-preview-paging

The system SHALL browse SQL table previews through limit/offset requests.

#### Scenario: sorted preview

- GIVEN a SQLite table with more than two rows
- WHEN a descending name preview requests two rows
- THEN two sorted rows are returned with further rows indicated

Evidence: `dbcore/providers/sqlite/sqlite.go`, `dbcore/providers/sqlite/sqlite_test.go`, `apps/desktop/src/components/table-view.tsx`
````

Replacement:

````md
### SQL-preview-paging

The system SHALL use lossless backend-generated keyset cursors for verified eligible PostgreSQL, SQLite, MySQL, MariaDB, SQL Server, Oracle, and DuckDB single-primary-key previews and identify bounded offset fallback for ClickHouse and unsupported shapes.

#### Scenario: deep primary-key page

- GIVEN an eligible indexed single non-null primary key with exact native binding and ordering
- WHEN Next is selected
- THEN the query seeks after the last admitted key instead of scanning preceding offset rows

#### Scenario: unsupported or arbitrary ordering

- GIVEN an arbitrary sort, unsupported key representation, or ClickHouse primary key without unique-row identity
- WHEN a preview is requested
- THEN offset fallback and server ordering remain available and are identified rather than promised to be fast

#### Scenario: stale or cross-context cursor

- GIVEN a cursor from another engine, connection, table, filter, direction, or page size
- WHEN it is submitted
- THEN paging returns an actionable restart error instead of silently changing the query

Evidence: `dbcore/engines/preview-cursor.go`, `dbcore/providers/postgres/postgres.go`, `dbcore/providers/sqlite/sqlite.go`, `dbcore/providers/mysql/mysql.go`, `dbcore/providers/sqlserver/sqlserver.go`, `dbcore/providers/oracle/oracle.go`, `dbcore/providers/duckdb/embedded/duckdb.go`, `dbcore/providers/clickhouse/clickhouse.go`, `apps/desktop/src/components/table-view.tsx`
````

### SQL-result-export

Page: `docs/llm/workflows/sql-workspace.md`
Previously: exports serialized only the displayed result in the frontend.

Baseline:

````md
### SQL-result-export

The system SHALL export the displayed SQL result through frontend CSV, JSON, or SQL serialization.

#### Scenario: current result export

- GIVEN a displayed query result
- WHEN CSV export is selected
- THEN the frontend serializes those rows into a downloaded file

Evidence: `apps/desktop/src/lib/export.ts`
````

Replacement:

````md
### SQL-result-export

The system SHALL retain current-result CSV/JSON/SQL exports and provide cancellable native full-query CSV streaming for PostgreSQL and SQLite without transferring a full result to the WebView.

#### Scenario: full CSV export

- GIVEN a supported engine and a chosen destination
- WHEN full export is requested
- THEN read-only query rows stream to a temporary CSV and the target is replaced only after successful completion

#### Scenario: failed or cancelled export

- GIVEN an export in progress
- WHEN cancellation or a write/query error occurs
- THEN its partial file is removed and an existing target is preserved

Evidence: `internal/api/export.go`, `dbcore/engines/csv-export.go`, `apps/desktop/src/lib/export.ts`, `apps/desktop/src/lib/api.ts`
````

### SQL-sqlite-memory

Page: `docs/llm/workflows/sql-workspace.md`
Previously: large native caches and in-memory temporary work were enabled.

Baseline:

````md
### SQL-sqlite-memory

The system SHALL configure SQLite with an approximately 64 MiB cache, a 256 MiB mmap allowance, and in-memory temporary storage.

#### Scenario: opening SQLite

- GIVEN a configured SQLite file
- WHEN the normal or MCP adapter opens it
- THEN the adapter applies the current cache, mmap, and temporary-storage PRAGMAs

Evidence: `internal/engines/sqlite/sqlite.go`
````

Replacement:

````md
### SQL-sqlite-memory

The system SHALL configure normal and MCP SQLite connections with an 8 MiB page cache, disabled mmap, and file-backed temporary storage.

#### Scenario: opening SQLite

- GIVEN a configured SQLite file
- WHEN the normal or MCP adapter opens it
- THEN the native-memory defaults are applied without changing journal mode or database contents

Evidence: `dbcore/providers/sqlite/sqlite.go`, `dbcore/providers/sqlite/sqlite_test.go`
````

### ENG-duckdb-runtime

Page: `docs/llm/architecture/engine-support.md`
Previously: DuckDB's native library was embedded in the main executable.

Baseline:

````md
### ENG-duckdb-runtime

The system SHALL execute DuckDB using the native library embedded in the desktop executable.

#### Scenario: opening DuckDB

- GIVEN a DuckDB file path
- WHEN the adapter opens it
- THEN the in-process go-duckdb driver executes its SQL and metadata requests

Evidence: `main.go`, `internal/engines/duckdb/duckdb.go`, `internal/engines/duckdb/duckdb_test.go`
````

Replacement:

````md
### ENG-duckdb-runtime

The system SHALL preserve DuckDB support through an app-managed optional driver verified against its release checksum and protocol before execution.

#### Scenario: explicit first use

- GIVEN a release build without its cached driver
- WHEN DuckDB is explicitly tested or opened
- THEN the matching driver is downloaded, verified, installed atomically, and used over private stdio RPC

#### Scenario: background health

- GIVEN an unused saved DuckDB profile
- WHEN background health runs
- THEN it does not install a driver or create a database file

#### Scenario: offline cached use

- GIVEN a previously verified matching cached driver
- WHEN DuckDB is opened offline
- THEN the cached driver is verified and reused without a download

Evidence: `dbcore/providers/duckdb/duckdb.go`, `dbcore/duckdriver/install.go`, `dbcore/duckdriver/client.go`, `cmd/kamehadb-duckdb-driver/main.go`, `.github/workflows/release.yml`
````

### WSP-preview-lifetime

Page: `docs/llm/workflows/connections-and-workspace.md`
Previously: switching away from a table removed its previews just like closing it.

Baseline:

````md
### WSP-preview-lifetime

The system SHALL remove a table's cached preview variants when its view unmounts.

#### Scenario: switching away from a table

- GIVEN cached pages for one mounted table
- WHEN its preview hook unmounts
- THEN its page, filter, and sort variants are removed without removing another table's metadata or previews

Evidence: `apps/desktop/src/hooks/use-schema.ts`, `apps/desktop/src/hooks/use-schema.test.tsx`
````

Replacement:

````md
### WSP-preview-lifetime

The system SHALL preserve bounded SQL/Mongo/Redis browse datasets across open-tab switches, evict inactive datasets by one shared 32 MiB retention estimate, and remove every variant only after its last matching tab closes.

#### Scenario: switching and closing

- GIVEN bounded SQL, Mongo, and Redis pages belonging to open tabs
- WHEN one becomes inactive
- THEN its cached page can remain within the shared budget without evicting an observed or fetching result
- WHEN the last matching tab is closed
- THEN its variants and unowned Redis remainder leases are released while other owners and metadata remain

#### Scenario: duplicate owner and unrelated metadata

- GIVEN two tabs sharing a browse identity and cached schema/count/statistics metadata
- WHEN one tab closes or the inactive browse budget is exceeded
- THEN the surviving owner and unrelated metadata are not removed

Evidence: `apps/desktop/src/lib/preview-cache.ts`, `apps/desktop/src/lib/preview-cache.test.ts`, `apps/desktop/src/hooks/use-schema.ts`, `apps/desktop/src/hooks/use-mongo.ts`, `apps/desktop/src/hooks/use-redis.ts`, `apps/desktop/src/store/workspace-tabs.ts`
````

## ADDED Requirements

### ENG-gui-cancel

Page: `docs/llm/architecture/engine-support.md`
Search: checked every current wiki page using ENG and all open change requirement headings; no existing requirement or retired ID owns GUI request-scoped cancellation.

Requirement:

````md
### ENG-gui-cancel

The system SHALL own managed GUI SQL/Mongo/Redis requests by distinct cancellable IDs and cancel obsolete, invalidated-profile, or shutdown work without cancelling unrelated requests or replaying possibly writing actions.

#### Scenario: concurrent same-connection requests

- GIVEN two active requests on the same connection and an independent CSV export
- WHEN the first completes and the second is cancelled by ID
- THEN only the second receives cancellation and the export remains independent

#### Scenario: early cancellation or overload

- GIVEN a cancellation arriving before request registration or an exhausted bounded request owner
- WHEN work is admitted or rejected
- THEN early cancellation prevents work and a busy rejection executes no database action

#### Scenario: ambiguous writing operation

- GIVEN a command that might already have written data
- WHEN cancellation, disconnect, or an oversized response occurs
- THEN the outcome is described as potentially executed rather than rolled back and is not automatically replayed

Evidence: `internal/api/request-jobs.go`, `internal/api/sql.go`, `internal/api/mongo.go`, `internal/api/redis.go`, `internal/api/connections.go`, `apps/desktop/src/lib/api.ts`, `main.go`
````

### ENG-nosql-result-bounds

Page: `docs/llm/architecture/engine-support.md`
Search: checked every current wiki page using ENG and all open change requirement headings; no existing requirement or retired ID specifies GUI NoSQL whole-item byte admission.

Requirement:

````md
### ENG-nosql-result-bounds

The system SHALL bound GUI Mongo/Redis browse outputs to 2 MiB with complete document/member admission and raw command responses to 8 MiB, without presenting partial SQL/Mongo cells or Redis collection members as originals.

#### Scenario: byte-shortened page

- GIVEN wide documents or Redis collection members
- WHEN the next complete item would exceed the browse budget
- THEN admitted items remain intact and continuation resumes without skipping an unreturned item

#### Scenario: oversized first item or command response

- GIVEN a first complete item or already-executed command response exceeding its budget
- WHEN it is returned to the GUI
- THEN an explicit size/possibly-executed indication is shown instead of a clipped original or automatic retry

Evidence: `dbcore/engines/result-budget.go`, `dbcore/providers/mongo/mongo.go`, `dbcore/providers/redis/redis.go`, `internal/api/mongo.go`, `internal/api/redis.go`, `apps/desktop/src/components/mongo-data-footer.tsx`, `apps/desktop/src/components/redis-explorer.tsx`
````

### ENG-mongo-counts

Page: `docs/llm/architecture/engine-support.md`
Search: checked every current wiki page using ENG and all open change requirement headings; no existing requirement or retired ID specifies optional GUI Mongo count work/quality.

Requirement:

````md
### ENG-mongo-counts

The system SHALL fetch normal Mongo document/aggregation pages without compulsory counts, identify unknown/estimated/exact total quality, and offer independently cancellable ordinary-find counts without replaying writing pipelines.

#### Scenario: first or next page without count

- GIVEN an ordinary find or aggregation view
- WHEN a page is requested
- THEN whole documents and hasMore drive actual displayed ranges without a CountDocuments or separate count pipeline

#### Scenario: optional count failure

- GIVEN fetched documents and an explicit count request
- WHEN the count fails or is cancelled
- THEN fetched documents remain usable and the count is not presented as exact

#### Scenario: estimate or intentional writing/limit semantics

- GIVEN an unfiltered estimated count or a pipeline containing an intentional limit or writing stage
- WHEN it is requested
- THEN estimates are labelled, limits remain intentional, and writing pipelines are not replayed for totals

Evidence: `dbcore/providers/mongo/mongo.go`, `internal/api/mongo.go`, `packages/shared/src/types.ts`, `apps/desktop/src/hooks/use-mongo.ts`, `apps/desktop/src/components/mongo-view.tsx`, `apps/desktop/src/components/mongo-query.tsx`, `apps/desktop/src/components/mongo-data-footer.tsx`
````

### ENG-redis-pages

Page: `docs/llm/architecture/engine-support.md`
Search: checked every current wiki page using ENG and all open change requirement headings; no existing requirement or retired ID specifies exact GUI Redis continuation, preserved overflow, and marked byte-window semantics.

Requirement:

````md
### ENG-redis-pages

The system SHALL browse Redis through exact context-bound scan/rank continuations with bounded preserved remainders, pipelined metadata, and explicitly partial lossless string byte windows rather than unbounded full-value commands.

#### Scenario: SCAN returns more than COUNT

- GIVEN a compact hash/set returning more items than its requested COUNT
- WHEN a page ends at its row/byte budget
- THEN unreturned members remain resumable within the bounded lease or an explicit limit/restart error leaves the last valid continuation unchanged

#### Scenario: exact cursor or empty non-terminal page

- GIVEN a cursor above JavaScript's safe-integer range or an empty scan with a nonzero native cursor
- WHEN the GUI continues
- THEN the cursor remains exact and the empty batch is not falsely labelled exhausted

#### Scenario: partial string, changed type, or expired remainder

- GIVEN a byte-window preview, changed/deleted key, or expired continuation
- WHEN the user copies the original or continues
- THEN incomplete originals cannot be copied/edited/exported and stale continuation returns an actionable restart instead of silently skipping data

Evidence: `dbcore/providers/redis/redis.go`, `internal/api/redis.go`, `packages/shared/src/types.ts`, `apps/desktop/src/hooks/use-redis.ts`, `apps/desktop/src/components/redis-explorer.tsx`, `apps/desktop/src/lib/preview-cache.ts`
````
