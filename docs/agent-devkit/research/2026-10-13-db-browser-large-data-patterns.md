# Large-data performance: DBX, DBeaver, and TablePlus

Date: 2026-10-13.
Scope: source/documentation research for KamehaDB's all-engine performance work, not export expansion or an implementation approval. No application code, database data, or approved task results were changed. Nothing was committed.

## Bottom line

These applications do not solve large datasets with one universally fast paging algorithm. Their useful common pattern is **small initial fetches, database-specific fetching, asynchronous work, avoiding unnecessary counts, and special handling for large values**. SQL server execution and grid rendering are separate performance problems.

DBX is the strongest source reference for result residency, deferred large values, and Redis collection paging. DBeaver is the clearest reference for preserving correct sorting semantics. TablePlus documents the desired user experience—small pages, estimated counts, and background progressive loading—but does not expose enough implementation detail to justify claims about its internal RAM limits or cursor strategy.

## Provenance and limits

- DBX: checked-out release `v0.6.42`, commit `d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292`. The annotated tag object is different from this commit. [Release](https://github.com/t8y2/dbx/releases/tag/v0.6.42).
- DBeaver Community: checked-out release `26.2.2`, commit `5171a0a5864591ee78225a216586fd7535b15085`. Its public source establishes the inspected common JDBC behavior; it does not establish proprietary MongoDB/Redis implementation behavior. The release README places those engines in PRO editions. [Release](https://github.com/dbeaver/dbeaver/releases/tag/26.2.2), [README](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/README.md).
- TablePlus: live first-party documentation fetched on the research date. Its documentation uses predominantly macOS examples; documented defaults are not independently verified for every platform or current binary.
- Source was read, not executed. Existing competitor tests were inspected where noted, not run. No new matched RAM, download-size, UI-latency, or billion-row benchmarks were performed. Streaming, a row limit, and virtualization are not proof of a whole-process memory ceiling.
- Local evidence is in `/tmp/kamehadb-db-browser-research.8zuWeo/`: pinned source checkouts and saved documentation under `web/`. Temporary files may not survive; the permanent citations below are the provenance.

## 1. DBX

### Small pages and dialect-specific pagination—not universal table keyset paging

The default result page size is **100**, and table opening uses that same default. The configurable maximum is much higher: **1,000,000**. These are configuration bounds, not a promise that selecting a million wide rows is cheap. [Page-size source](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/dataGrid/paginationPageSize.ts), [table-opening source](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/table/tableOpenPageLimit.ts).

Its table-select builder chooses engine-specific strategies: LIMIT/OFFSET for the generic family, Oracle ROWNUM wrappers, SQL Server-specific pagination, and driver-managed limits for appropriate engines. The frontend passes limit/offset to that builder. **The ordinary table-browse path inspected here is not an all-engine primary-key seek path.** [Strategy selection](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-sql-dialect/src/sql_dialect/capabilities.rs#L102-L140), [table SQL construction](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-sql-dialect/src/sql_dialect/table_select.rs#L360-L445), [frontend builder](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/table/tableSelectSql.ts).

Query results can instead use **live agent result sessions**. Their planner chooses a cursor or a safe SQL pagination rewrite according to engine and query shape. A jump to a distant offset without an existing session can consume and discard preceding cursor pages: keeping memory low does not make that random jump constant-time. [Execution planner](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-sql-data/src/query_result_sql.rs#L126-L270), [dispatch and offset skipping](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/stores/queryStore.ts#L8053-L8218), [cursor capability selection](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/database/databaseDriverManifest.ts#L156-L164).

DBX also implements primary-key keyset SQL, including multi-column predicates and dialect-specific limits, for eligible **export/transfer** paths. That is a separate capability; it must not be confused with the ordinary table grid. [Keyset helper](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-core/src/data/transfer.rs#L6488-L6575), [table-export selection](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-core/src/data/table_export.rs#L431-L470).

### Keep inactive datasets out of live RAM

The query store trims inactive tabs using **five cached results and 128 MiB of estimated result bytes**. It evicts least-recently-used entries by count or estimated size. Before clearing live payload references, it closes the result session and attempts to save a snapshot to persistent storage. The cache has a columnar MessagePack representation and a separate **512 MiB default persistent-cache budget**. These are different budgets; neither is total app RAM. [Limits and trim](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/stores/queryStore.ts#L1559-L1560), [trim implementation](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/stores/queryStore.ts#L9362-L9381), [size estimator](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/tabs/queryResultSize.ts), [eviction](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/stores/queryStore.ts#L2527-L2534), [persistent cache](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/tabs/tabResultCache.ts#L1-L115).

For KamehaDB, bounded ownership is worth copying. Disk-persisting database results should not be copied automatically: it adds sensitive-data retention, I/O, and transient serialization allocations. The existing bounded warm-cache approach is simpler unless restoring evicted results without a query becomes an explicit requirement.

### Do not fetch full large fields just to draw a grid

DBX defines a **32 MiB table-result target**, an **8 KiB initial cell-preview maximum**, and a **512-character visible preview**. Initial preview size is adjusted for rows and columns. Its inspected SQL preview support is explicitly PostgreSQL/MySQL/DB2-specific, with primary keys preserved and separate large-value markers. Full-value and visible-preview reads have their own lifecycle/cancellation and cache budgets. This is **not evidence of identical preview support or a hard 32 MiB collector cap in every driver**. [Preview constants and eligibility](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/dataGrid/dataGridLargeValues.ts#L1-L215), [server-side preview projections](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-sql-dialect/src/sql_dialect/table_select.rs#L47-L188), [full-value lifecycle](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/composables/useDataGridLargeValues.ts#L108-L169).

The important distinction is **an explicitly partial value with a way to obtain the full value**, not silently changing a database cell. KamehaDB's current whole-row admission avoids that ambiguity; introducing deferred cells would need a separately approved copy/edit/export contract.

### Render only the visible window

DBX has a canvas grid mode. Its renderer computes visible row/column ranges and paints those, rather than building a DOM element for every result cell. That reduces rendering work; it does not release the underlying dataset by itself. A canvas rewrite is not justified for KamehaDB until profiling shows its current virtualized grid is the bottleneck. [Canvas renderer](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/apps/desktop/src/lib/dataGrid/canvasDataGridRenderer.ts#L438-L470).

### Redis uses actual collection paging

DBX scans keys with SCAN and pipelines TYPE and TTL requests instead of making sequential metadata round trips for every key. Its collection browser uses bounded LRANGE/ZRANGE windows and HSCAN/SSCAN continuations; strings use GETRANGE previews rather than unconditional GET. Constants include **200 collection items**, a **4 MiB collection-page budget**, and **64 KiB string previews**. SCAN overflow has a resumable session so remaining fields/members are not simply dropped. [Key scanning/pipelines](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-driver-redis/src/lib.rs#L2968-L3110), [constants](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-driver-redis/src/lib.rs#L19-L45), [initial collection read](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-driver-redis/src/lib.rs#L3276-L3310), [continuation reads](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-driver-redis/src/lib.rs#L4609-L4683).

An important limitation is explicit in its tests: **one member larger than the page budget is still admitted** to avoid stalling. Therefore the 4 MiB number is not a hard single-response ceiling. Tests also exercise a compact hash returning 512 fields in one HSCAN, split into 200/200/112 without another scan for buffered fields. These tests were read, not executed. [Budget and overflow regressions](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-driver-redis/src/lib.rs#L7050-L7175).

### MongoDB has separate count semantics, but ordinary browsing still skips

Its native find path uses `skip` and `limit`, reports whether a total is exact, estimates the unfiltered collection count, and uses a real filtered count when requested. A separate find-without-total path exists for callers that do not need a total. The inspected ordinary native result returns no continuation cursor. **It would be incorrect to report that all DBX Mongo browsing is keyset-based or never counts.** [Find/count behavior](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-driver-mongodb/src/mongo_driver.rs#L1182-L1358).

### Weight and cancellation

DuckDB is a standalone optional executable outside the main native dependency graph, installed through Driver Manager. Moving those bytes out of the base does not erase optional installed bytes or child-process RAM. [Driver packaging](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/agents/drivers/duckdb/README.md).

Query cancellation tracks execution IDs and driver-specific interrupts, with distinct query/count/explain/export metadata. The source addresses cancellation-before-interrupt-registration races. Cancelling a frontend promise alone is not the same as stopping database work. [Cancellation registry](https://github.com/t8y2/dbx/blob/d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292/crates/dbx-core/src/query/query_cancel.rs#L24-L172).

## 2. DBeaver

### Fetch segments through the database abstraction

DBeaver documents **200 rows initially**, automatic/manual next-segment fetching, and an explicit fetch-all action. It warns that fetch-all can hang the application or cause out-of-memory errors. Its common table reader takes an offset, row maximum, and fetch size, and stops its row loop on cancellation or the row maximum. The generic limit transformer uses LIMIT/OFFSET where suitable; JDBC fallback sets a maximum and scrolls/skips to the offset. **This is not a generic keyset-pagination implementation.** [Navigation](https://dbeaver.com/docs/dbeaver/Navigation/), [table reader](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model.jdbc/src/org/jkiss/dbeaver/model/impl/jdbc/struct/JDBCTable.java#L125-L244), [SQL transformer](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model/src/org/jkiss/dbeaver/model/impl/sql/QueryTransformerLimit.java#L65-L105), [JDBC fallback](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model.jdbc/src/org/jkiss/dbeaver/model/impl/jdbc/exec/JDBCStatementImpl.java#L225-L261).

The inspected release's model defaults set max rows to 200, SQL-based limits to false, and the explicit JDBC fetch-size override to false. Connection/driver preferences can change behavior. Do not equate the visible segment size with guaranteed driver buffering or total RAM. [Defaults](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model/src/org/jkiss/dbeaver/ModelPreferences.java#L351-L370), [fetch preferences](https://dbeaver.com/docs/dbeaver/Data-Editor-preferences/).

In the common viewer, Next uses the current loaded-row count as the new offset; its model appends fetched rows unless told to reset old rows. Fetching incrementally can therefore still grow retained data. This is why KamehaDB should keep a byte-budgeted working set rather than copy an unlimited accumulating scroll buffer. [Next-segment implementation](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.ui.editors.data/src/org/jkiss/dbeaver/ui/controls/resultset/ResultSetViewer.java#L4356-L4395), [model append](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.ui.editors.data/src/org/jkiss/dbeaver/ui/controls/resultset/ResultSetModel.java#L793-L813).

### Adaptive sorting preserves the distinction between a page and the full result

The viewer supports client/server/adaptive modes. Adaptive uses server sorting when more data remains; it sorts locally when the result is complete. Server sorting refreshes the query. If the driver cannot support result ordering, it warns before using local sorting. This is a valuable correctness rule: **a locally sorted partial page is not a globally sorted table**. [Sorting implementation](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.ui.editors.data/src/org/jkiss/dbeaver/ui/controls/resultset/ResultSetViewer.java#L2660-L2731), [ordering preferences](https://dbeaver.com/docs/dbeaver/Data-Editor-preferences/).

The JDBC statement wrapper delegates execution cancellation to the data source, and its generic `cancel()` calls the underlying driver's statement cancellation. This is a real backend cancellation interface, but its existence alone does not prove prompt interruption for every driver/server. [Cancellation delegation](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model.jdbc/src/org/jkiss/dbeaver/model/impl/jdbc/exec/JDBCStatementImpl.java#L108-L113), [JDBC cancel](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model.jdbc/src/org/jkiss/dbeaver/model/impl/jdbc/exec/JDBCStatementImpl.java#L543-L545).

### Counts and LOBs are separate work

The user can explicitly calculate total rows. Automatic count is a configurable option, documented as occurring once on opening rather than on each next page. This supports keeping count work out of the critical page-fetch path. [Navigation](https://dbeaver.com/docs/dbeaver/Navigation/), [count preferences](https://dbeaver.com/docs/dbeaver/Data-Editor-preferences/).

JDBC BLOB/CLOB values can be represented by content objects. Depending on type and preferences, contents are cached or read on demand. The inspected BLOB handler streams larger contents into a temporary file instead of keeping everything in an in-memory byte array. This does not cover every driver representation: already materialized strings/byte arrays and unusual streams have different paths. [Value handler](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model.jdbc/src/org/jkiss/dbeaver/model/impl/jdbc/data/handlers/JDBCContentValueHandler.java#L171-L219), [BLOB storage](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/plugins/org.jkiss.dbeaver.model.jdbc/src/org/jkiss/dbeaver/model/impl/jdbc/data/JDBCContentBLOB.java#L89-L145), [cell/LOB documentation](https://dbeaver.com/docs/dbeaver/Data-Viewing-and-Editing/).

### Many engines do not mean a tiny runtime

Driver libraries are managed separately and can be downloaded/updated. The inspected release is mostly Java/Eclipse RCP and includes OpenJDK in distributions. DBeaver is a useful interoperability/design reference, not evidence that KamehaDB must adopt a JVM or that its base footprint is smaller. [Driver manager](https://dbeaver.com/docs/dbeaver/Driver-Manager/), [release architecture/runtime](https://github.com/dbeaver/dbeaver/blob/5171a0a5864591ee78225a216586fd7535b15085/README.md#architecture).

## 3. TablePlus

Its first-party docs establish these behaviors:

- **300 rows per table page by default**, with configurable limit and offset. This documents bounded table requests, not universal keyset paging. [Table basics](https://docs.tableplus.com/gui-tools/working-with-table/table).
- **Progressive result display and asynchronous background loading**, so a long fetch need not block unrelated UI work. This does not establish that all streamed rows are evicted or that total memory remains bounded. [Streaming and async loading](https://docs.tableplus.com/query-editor/streaming-results-and-async-loading).
- **Estimated counts**, recommended for better performance; disabling them can delay results. [Table-data preferences](https://docs.tableplus.com/preferences/general/table-data).
- **Cancellation controls**: the editor documents Cancel and a process-list Kill action. These establish the user-facing controls, not identical driver-specific cancellation behavior or latency. [Editor basics](https://docs.tableplus.com/query-editor/untitled).
- **Server-side filter queries**: the documentation explicitly says filters generate SELECT/WHERE SQL. Generated/executed queries can be inspected in the console log. [Filters](https://docs.tableplus.com/gui-tools/filter), [console](https://docs.tableplus.com/gui-tools/the-interface/console-log).
- **Native application UI** is advertised by TablePlus. That is an architectural difference from KamehaDB's WebView, not a measured explanation of a particular RAM gap. [Official product site](https://tableplus.com/).

The inspected public material does **not** establish an all-platform byte cap, inactive-result eviction policy, exact large-field storage strategy, universal seek pagination, or instantaneous global sorting. No TablePlus binary was run or profiled. Do not invent those internals from its reputation or screenshots.

## 4. What this means for all KamehaDB engines

These are recommendations for revising the open plan, **not implemented features or approved scope additions**:

1. **Apply one bounded-result/lifetime contract across all supported engines**, implemented through their existing dedicated paths. Small row counts alone do not protect against huge JSON, BLOBs, or Redis members. Existing SQL whole-row caps and cache ownership remain useful; MongoDB/Redis need corresponding coverage. Relevant current source: `internal/engines/result-budget.go`, `internal/mongo/mongo.go`, `internal/redis/redis.go`, `apps/desktop/src/lib/preview-cache.ts`.
2. **Remove compulsory full counts from the first-page/next-page path.** KamehaDB's Mongo find currently calls CountDocuments before Find, and aggregation issues a separate count pipeline. Show actual admitted ranges/hasMore; fetch an estimate or an exact count only when its semantics and cost are explicit. Preserve intentional query/pipeline limits and do not repeat writing pipelines for counts. Relevant source: `internal/mongo/mongo.go::FindDocuments / Aggregate`, `apps/desktop/src/components/mongo-data-footer.tsx::DataFooter`.
3. **Use engine-specific paging, with honest fallback.** Extend eligible seek paging beyond PostgreSQL/SQLite where exact stable keys and driver bindings can be verified. Other queries can use bounded dialect-native pages or explicitly managed cursors. A ClickHouse sorting/primary key must not be assumed to be a relational uniqueness constraint: its official documentation explicitly permits multiple rows with the same primary key. [MergeTree semantics](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree). Cursor sessions add connection, cancellation, expiry, and previous-page lifecycle costs; do not introduce them indiscriminately merely because DBX has them.
4. **Keep all headers sortable, without faking global ordering.** Sort a complete small result locally only when completeness is established. Otherwise ask the database to ORDER BY and retain cancellation/loading feedback. Index-aware paging improves compatible navigation; it does not remove the cost of arbitrary global sorts. PostgreSQL explicitly documents that ORDER BY/LIMIT without a matching index can require processing all rows to find the first page. [Database explanation](https://www.postgresql.org/docs/18/indexes-ordering.html).
5. **Prioritize Redis collection paging and pipelined metadata.** Current KamehaDB key details use full LRANGE/SMEMBERS/ZRANGE/HGETALL; key scanning makes sequential TYPE/TTL calls; the explorer does not expose the returned scan continuation. Adopt bounded per-type pages and usable continuation controls, while preserving SCAN overflow, duplicate/empty-batch semantics, exact cursors, and complete values. Relevant source: `internal/redis/redis.go::ScanKeys / getKeyDetails`, `apps/desktop/src/components/redis-explorer.tsx::RedisExplorer`, `apps/desktop/src/hooks/use-redis.ts`.
6. **Treat deferred large cells as a separate contract, not silent clipping.** DBX/DBeaver show why they matter, but the approved KamehaDB behavior currently admits complete rows or explains the limit. A later preview/full-value design must preserve correct copying, editing, and exports, including concurrent row changes.
7. **Keep optional DuckDB packaging and real backend cancellation.** These are more directly transferable than a Rust/JVM/native-UI rewrite. Include installed helper bytes and active helper RAM in the final measurements. Do not automatically persist query results to disk or replace the virtualized grid with canvas without a demonstrated need.

No competitor evidence supports a blanket promise of smooth arbitrary sorting over billions of rows in every database. The defensible promise is responsive, bounded working-set browsing with engine-specific fetching, truthful ordering semantics, and measured performance on eligible workloads.

## Research verification

- Both source tags resolved to the pinned commits above; relevant implementation bodies were read, not inferred from filenames or marketing.
- First-party TablePlus/DBeaver pages were fetched and saved; failed guessed documentation paths were not used as evidence.
- DBX Redis tests explicitly establish intended overflow/oversized-member behavior in source; they were not run in this research pass.
- KamehaDB remains at HEAD `b72923b94e73edc9576cc92ee79003a4a60740ea`; the staged diff still matches the pre-research snapshot. Original Tasks 1–4 remain historically done; Tasks 5–7 are not marked complete. No expanded implementation plan was written or approved during this research.
