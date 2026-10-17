# Smaller runtime and bounded large-table browsing

Status: jointly approved with tasks.md and delta.md by the user on 2026-10-13 (“do it”), after presentation and briefing. The original seven-task scope was also approved on 2026-10-13; Tasks 1–4 remain historically done and remaining tasks are unfinished. Approval authorizes implementation, not completion. All work remains uncommitted.

## Goal and classification

Architectural follow-up to the completed, uncommitted startup/history/cache-lifetime fixes. Reduce the base executable, constrain retained result data, and browse large tables without loading their complete contents. Keep Go/Wails and all ten supported database kinds. The user requested implementation and an explanation afterward; the repository's joint design/tasks gate still applies to these new subsystem and contract changes.

## Evidence and existing behavior

The following measurements and initial behavior describe the original design baseline, not the current completed Tasks 1–4 or demonstrated savings. The executable still includes the native DuckDB engine. An isolated, DuckDB-disabled experiment reduced it from 106.490 MiB to 56.006 MiB; that experiment did not preserve DuckDB support. Production on-demand support therefore needs a real driver lifecycle, not a build tag that disables the engine.

GUI SQL queries have a 50,000-row ceiling but no byte ceiling. Preview adapters accept a caller-supplied limit and predominantly use LIMIT/OFFSET. Several collectors currently close their cursors without first cancelling the query when they stop early; pgx can drain remaining data during close. Result byte limits must run while collecting rows, not after constructing a large result.

SQLite currently allows a 256 MiB memory mapping, roughly 64 MiB page cache per connection, and in-memory temporary sort/join storage. WorkspaceContent statically imports most panels. The preview hook removes data when a view unmounts, which includes switching to another still-open tab. SQL mutation GC already removes settled, unobserved results.

The PostgreSQL one-million-row experiment returned 50 rows in median database execution times of 0.056 ms at the first page, 272.232 ms at OFFSET 999950, and 0.041 ms with an indexed primary-key seek. This is evidence for keyset navigation, not a billion-row certification.

## Scope

1. Preserve completed SQL collection-time bounds, PostgreSQL/SQLite seek paging, SQLite defaults, warm SQL previews, and lazy workspace panels.
2. Extend performance work to all ten current kinds: PostgreSQL, SQLite, MySQL, MariaDB, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, and Redis. Add collection-time NoSQL browse bounds and bounded command responses without forcing NoSQL into SQLAdapter.
3. Extend the verified-primary-key SQL fast path to MySQL/MariaDB, SQL Server, Oracle, and DuckDB where native metadata, key representation, and comparisons prove eligibility. Keep ClickHouse and unsupported shapes on explicit bounded offset fallback.
4. Make Mongo document/aggregation paging independent of compulsory counts; retain bounded offset pages and truthful count quality. No new persistent Mongo cursor platform or inferred homogeneous `_id` schema.
5. Add Redis key continuation, bounded per-type value pages, pipelined key metadata, exact cursor transport, and bounded in-memory scan overflow. Mark string byte windows explicitly rather than masquerading as complete values.
6. Add request-scoped backend cancellation and one shared inactive browse-result retention budget across SQL/Mongo/Redis, with actual-close cleanup and no persistent result snapshots.
7. Finish native, streamed full CSV export for PostgreSQL and SQLite only. Existing displayed-result formats remain; “all dbs” expands performance, not full export.
8. Preserve DuckDB through the approved managed optional driver and verify base/download/installed bytes and whole-process memory.

No Rust/JVM/native-UI rewrite, automatic index creation, indexing every column, production-database benchmark, automatic EXPLAIN, broad SQL parser, disk result snapshots, or engine removal. No promise that deep Mongo skip, ClickHouse offset, arbitrary global sorting, views, unindexed filters/searches, or user-authored queries become fast over billions of rows. SQL/Mongo cells and Redis collection members remain complete; deferred SQL/Mongo fields are outside this revision.

## Research and current gaps

The [pinned competitor comparison](../../research/2026-10-13-db-browser-large-data-patterns.md) establishes small fetches and engine-specific primitives, not universal seek paging. DBX contributes ownership/Redis patterns; DBeaver contributes truthful server-versus-complete-result sorting; TablePlus documents paging/background loading, not private memory internals. No fresh comparative RAM or billion-row benchmark was run.

Current source has eight bounded SQL collectors and only two implemented seek adapters. Mongo find counts before fetching; aggregation issues a second count pipeline. Redis details use full-value collection commands, scan metadata is sequential, and the explorer does not expose scan continuation. The existing cache owner matches SQL previews only. SQL cancellation is connection-scoped, so concurrent statements can overwrite or clear another statement's cancellation slot; previews and dedicated NoSQL services use background contexts. These are traced gaps, not newly fixed behavior.

## Impact map

Entry: apps/desktop/src/components/table-view.tsx::DataGrid; sql-editor.tsx::SqlEditor; mongo-view.tsx::MongoView; mongo-query.tsx::MongoQuery; redis-explorer.tsx::RedisExplorer; internal/api/connections.go::NewServices; main.go::main.
Flow: existing React hooks/actions -> api.ts -> generated Wails bindings -> SQL/Mongo/Redis services -> existing adapters/native database clients. QueryClient/workspace tabs own cached views. Approved planned additions: request IDs -> shared cancellable request ownership; NoSQL pages -> whole-item admission/optional count; Redis continuations -> bounded remainder -> next page; additional SQL metadata -> eligible seek or explicit fallback.
State changes: existing workspace/query/mutation state; approved planned additions: request job IDs/cancellation state, optional count metadata, exact page bookmarks, bounded transient Redis remainders. Approved remaining work: export jobs/temp files and optional DuckDB cache/spill/children. No metadata-store/credential migration or disk result snapshots.
External effects: existing database reads/writes; approved planned additions: explicit count reads, driver cancellation, bounded Redis page commands. Approved remaining work: CSV files and trusted optional-driver downloads/release assets. No optimization creates indexes or changes user data.
Change candidates: existing SQL adapters/cursor metadata; Mongo/Redis adapters/services/hooks/views; result budget/cache owner/query keys; shared shapes and affected generated bindings; request lifecycle in Services/main; tests and scoped docs.
Verification: budget/cancellation/cache/cursor/count/scan-overflow tests with private fixtures; exact IDs/BSON/binary data; no skipping after byte-shortened pages; existing full frontend/Go checks; isolated native app/whole-process measurements. Live Oracle/SQL Server/ClickHouse and real-desktop checks require actual availability, not mocks.
Verified at: b72923b94e73edc9576cc92ee79003a4a60740ea (dirty working-tree source retraced on 2026-10-13; planned additions were jointly approved, not implemented).

## Related context

- [Database adapter boundaries](../../../llm/architecture/engine-support.md).
- [SQL workspace](../../../llm/workflows/sql-workspace.md).
- [Connections and workspace](../../../llm/workflows/connections-and-workspace.md).
- [Engine explorers](../../../llm/workflows/engine-explorers.md), whose sidecar/twelve-engine prose is outdated; source, not that prose, establishes current behavior.

## Global constraints

- Leave all changes uncommitted and preserve all pre-existing staged, unstaged, and untracked work.
- Keep Go/Wails, existing connection profiles and credentials, and all ten supported engine kinds.
- Frontend-to-backend calls continue through generated Wails bindings and api.ts; no new localhost HTTP API.
- Never silently export or write a clipped cell as if it were the original database value.
- Memory measurements include the whole application process tree, including WebKit and any active DuckDB driver; targets are not promises.
- Do not benchmark or modify a user's production database; verification uses private synthetic fixtures.
- All existing headers remain sortable; SQL/Mongo global ordering stays server-side unless a complete bounded result can be sorted locally truthfully. Redis scan windows are not advertised as global ordering. No automatic indexes are created.
- All-engine expansion is performance-only; native full CSV export remains PostgreSQL/SQLite.
- GUI cancellation targets request IDs, never an unrelated tab/export; cancellation is not a promise to roll back database writes and does not trigger automatic replay.
- Preserve docs/llm/LOG.md byte-for-byte; process artifacts are not wiki evidence.

## Result bounds and compatibility

Use named Go constants for an 8 MiB GUI query-result byte ceiling, a 2 MiB preview-result ceiling, the existing 50,000 GUI row ceiling, a 1,000-row preview request ceiling, and an 8 KiB cursor ceiling. Clamp preview requests on the backend even when clients bypass the UI. Invalid negative offsets and non-positive limits produce validation errors rather than unbounded queries.

Add optional response fields to QueryResult: payloadBytes, limitReason (`rows` or `bytes`), hasMore, nextCursor, and paginationMode (`keyset` or `offset`). Add optional cursor and paginationMode (`auto` or `offset`) fields to PreviewRowsInput. Mirror Go shapes in packages/shared and regenerate only affected Wails binding changes in an isolated copy, merging them without replacing the user's existing generated edits.

A shared byte-accounting utility counts encoded JSON incrementally with a bounded writer, including column metadata and the result envelope; it does not allocate another complete JSON copy. GUI collectors admit whole rows only. When the next row exceeds the budget, stop collecting, mark the limit reason, cancel the child query context before closing/draining, and preserve previously collected rows. Metadata collectors and MCP bounded-read contracts do not silently inherit GUI truncation.

Do not clip or change SQL/Mongo cell values or Redis collection members in this release. A single row too large for the preview produces a specific message directing the user to select fewer/smaller columns or use native full export where available. This deliberately preserves safe editing/copy/export semantics. The byte limit bounds retained/transported results, not the transient driver allocation required to decode one unusually large row; document that limitation rather than claiming a hard process-RAM ceiling.

Normal end-of-result hasMore is determined with a one-row lookahead. Byte truncation with at least one admitted row can continue after that last row. An oversized first row must not produce an infinite Next loop. When offset paging returns fewer rows because of the byte cap, advance by the actual admitted row count, not the requested page size, to avoid skipped records.

## Result lifetime and startup

Keep the existing immediate GC for settled, unobserved SQL mutations; do not remove observed or pending mutations.

Install a preview-cache owner alongside QueryClient. It subscribes to query-cache and workspace-store changes, keeps metadata untouched, removes all preview variants when their table/connection no longer has an open tab, and preserves data across a mere active-tab switch. Retain at most a 32 MiB estimated dataset budget. Estimate string storage conservatively from payloadBytes and account for cached rows; describe this as a retention estimate, not physical heap measurement. Evict inactive least-recently-used previews first; never remove the currently observed/fetching result to enforce the inactive-cache budget. An observed preview is independently bounded by the backend 2 MiB limit. Remove the hook's unconditional unmount eviction after the new owner has tests. The completed SQL-only owner is extended in a new task, not reset: match only SQL previews, Mongo document pages, and Redis key/value pages. Apply the same shared 32 MiB estimate across these families, preserve every still-open duplicate owner, and remove all variants only after the last matching tab closes. Database/collection/schema/stats/count metadata is not a browse dataset. Keep command/query mutation results only while observed; settled unobserved Mongo/Redis mutations get the same immediate GC policy as SQL. No saved result payloads enter workspace persistence.

Use SQLite defaults of an 8 MiB page cache, disabled mmap, and file-backed temporary storage for both normal and MCP connections. These trade some scan/sort throughput for predictable per-connection memory; disk-full and temporary-storage errors are surfaced normally. Do not alter journal mode, database contents, or filesystem permissions as an optimization.

Convert workspace panels to React.lazy with one existing-style Suspense loading state. Verify that other eager imports do not pull terminal/graph modules back into the startup entry. Lazy loading defers initial code evaluation; it is not presented as uninstalling modules or reclaiming every loaded module later.

## Large-table paging

First implement PostgreSQL, then reuse the cursor rules for SQLite. Eligibility: a table, a single non-null primary-key column with an integer, UUID (PostgreSQL), or bounded text type; no explicit sort or sort on that primary key. SQLite nullable primary keys, views, composite keys, unsupported types, overlarge text keys, and arbitrary sorts use offset fallback. The response identifies the mode so the UI can warn that deep offset pages and unindexed searches may be slow.

Default keyset order is primary-key ascending. Primary-key descending uses the corresponding inverse seek comparison. Generate quoted identifiers from verified metadata and bind values as SQL parameters. Cursor data is encoded by Go from the last admitted full row; integer keys never round-trip through JavaScript numbers. Include cursor version, table identifier, sort direction, and a digest of the effective search/filter/page-size context. Validate shape, size, eligibility, and context before constructing a query. Malformed, stale, or mismatched cursors return an actionable restart-paging error, not an implicit different query. The cursor is not an authorization token; the saved connection and account remain authoritative.

Frontend Next stores only the current request bookmark (cursor and offset) in a backward-navigation stack, not old datasets. Previous reuses the prior bookmark. Search, sort, page-size, or connection/table changes reset the stack. Disable navigation while the next page is fetching; do not navigate using placeholder-data cursors from the previous request. Show displayed row range and paging mode rather than inventing a full COUNT(*).

There is no snapshot-isolation promise across page requests. Concurrent insert/delete activity can change what a later page contains; keyset avoids the shifting-offset behavior but is not an immutable snapshot. No automatic indexes or exact table counts are added.

## Additional engine paging and counts

| Engine | Proposed fast path or native page operation | Explicit limitation |
| --- | --- | --- |
| PostgreSQL / SQLite | Retain completed eligible single-key seek paths and request-only bookmarks. | Unsupported/composite/nullable keys and arbitrary sorts remain offset. |
| MySQL / MariaDB | Verified single non-null integral or text primary key; preserve unsigned 64-bit keys exactly. | Unknown key metadata/types/collations do not qualify. |
| SQL Server | Verified single non-null integral or text primary key; parameterized seek and native bounded FETCH/TOP strategy. | Uniqueidentifier/other types remain fallback unless exact binding/order is proven by the task's tests. |
| Oracle | Verified single non-null integral NUMBER or text primary key; exact native numeric binding and supported-version row limiting. | Fractional/unknown numeric metadata or lossy driver values remain fallback. |
| DuckDB | Verified single non-null integral or text primary key through the real managed driver. | Exact wider/unsigned keys need typed bindings; floating/composite/unsupported keys remain fallback. |
| ClickHouse | Retain bounded native LIMIT/OFFSET and ORDER BY; inspect HTTP buffering/cancellation under the real driver. | Its primary/sorting key does not prove row uniqueness; no fabricated keyset fast path or scan-cost guarantee. |
| MongoDB | Bounded native find/aggregation cursor collection per request, closed afterward; offset/limit + lookahead. | No persistent session or `_id` seek inferred from JSON/homogeneous sample data; deep skip/global sort may remain expensive. |
| Redis | SCAN/HSCAN/SSCAN continuation, LRANGE/ZRANGE rank windows, GETRANGE byte windows. | SCAN COUNT is a hint; unordered collections and concurrent mutations are not a stable globally sorted snapshot. |

Additional SQL adapters reuse the existing cursor format/context validation, metadata cache capability, and frontend navigation. New key support must preserve signed/unsigned/decimal values at the backend, not infer a key from a rounded GUI number. Cursor context must reject use against another engine/connection/table/filter/order/page shape; internal connection scope is authoritative, not client supplied. Unknown metadata or an exact binding that cannot be established is visible fallback, not a guessed predicate. Do not make extra schema reads on every sort.

Mongo browsing uses a 2 MiB whole-document result ceiling, default 100/max 1,000 documents, actual admitted-row advancement, and one-document lookahead. Aggregation page operators do not remove or change intentional pipeline skip/limit stages; stop reading after the budget even if the submitted pipeline's limit is larger. Writing-stage handling preserves existing permissions and executes at most once, with no count replay or appended operators after a terminal writing stage. Invalid negative/overflowing skips and non-positive explicit limits fail validation. Oversized first documents explain projection/size choices and disable empty-page Next; no silently clipped document can be copied or edited.

`DocumentResult.totalCount` becomes optional (safe number or exact decimal string) and carries `countMode` (`unknown`, `estimated`, or `exact`) plus `payloadBytes`/`limitReason`; hasMore comes from collection rather than a count. Normal find and aggregation return without count work. Ordinary find offers a separate explicit count request using the same effective filter/search: unfiltered estimates are labelled estimated; filtered estimates are rejected rather than silently triggering a full count; exact counts are user-requested and independently cancellable. Aggregations have no automatic count pipeline; a complete bounded result may report its loaded size, not invent a full total. Count failures do not hide fetched documents. The footer displays actual ranges and Next/Previous bookmarks without requiring a total; sort/search/filter/page-size changes reset them, and placeholder/fetching data cannot drive navigation.

Redis browse responses use the 2 MiB encoded ceiling and retain complete keys and collection members. Key scan count defaults to 100 and is capped at 1,000 on the backend, without assuming the returned native batch obeys it. Pipeline TYPE/TTL for admitted keys. Native scan cursors cross Wails as exact decimal strings or a versioned opaque continuation, never a JavaScript number; continuation is bound to connection/logical DB/pattern/key/type/page context. The explorer exposes Next/First and actual exhaustion, including empty non-terminal scans; it does not accumulate an unlimited key list or call KEYS.

Value pages default to 100/max 1,000 complete list/hash/set/ZSET members. List/ZSET continuation advances by admitted items, not requested count. HSCAN/SSCAN overflow must preserve every unreturned item: bounded in-memory remainder sessions have an 8 MiB per-session and shared 32 MiB total estimate, at most 16 sessions, five-minute expiry, and close/profile-change/shutdown cleanup. Replaying a valid bookmark within its lifetime must not silently consume another view's remainder; serialize same-session operations and either retain replayable boundaries within the budget or return an explicit expired/restart error. When an entire native reply/remainder or one complete member cannot fit, return an explicit limit error without advancing the last valid continuation. COUNT is a hint and one decoded native batch can transiently exceed these retention limits. SCAN can duplicate items or return empty non-terminal batches during concurrent changes; do not silently treat those as exhaustion or promise snapshot completeness.

Redis strings use labelled 64 KiB GETRANGE byte windows plus STRLEN, not full GET. Transport arbitrary bytes losslessly; a partial/encoded window is not the complete original value. Disable original-value copy/edit/export when incomplete and label any segment-only copy. Type/deletion changes between pages invalidate continuation with a restart message. Legacy GetRedisKey succeeds only with a complete bounded value, otherwise returns an actionable use-paged-inspector error; it never presents a partial value as the original. New frontend detail calls use GetRedisKeyPage. No full Redis export is added.

GUI raw Mongo/Redis command responses are bounded to 8 MiB at the response boundary; commands themselves are not rewritten, split, or replayed to fit. If a command may have executed but its response is too large or cancelled, explain that state instead of reporting a rolled-back operation. Driver-materialized replies can still cause transient allocation; ordinary browsing avoids those full-value commands.

## Request-scoped cancellation

Add an optional requestId to managed GUI SQL query/preview and Mongo/Redis browse inputs; api.ts generates and owns IDs and forwards AbortSignal cancellation to a bound SqlService.CancelRequest method sharing the API owner. Existing scalar-argument calls remain compatible: RunMongoCommandWithRequest, RunRedisCommandWithRequest, and GetRedisKeyWithRequest are controlled companion methods with structured inputs containing the existing arguments plus requestId. GetRedisKeyPage uses its own structured input when introduced. Legacy CancelQuery compatibility remains, but new frontend actions cancel their own ID. A shared API request owner is justified by the three service callers, not a general plugin/session framework. Register before adapter lookup/work begins; keep cancellation-before-registration bounded using the existing export-race pattern. Validate non-empty managed IDs at at most 128 bytes; callers omitting optional IDs receive an internally generated owned ID with compatible legacy cancellation semantics. Limit ownership to 16 simultaneous GUI requests and 64 early-cancel IDs retained for one minute, with named constants and an explicit busy/invalid-ID error before SQL/commands start. Exports retain separate IDs, lifecycle, limits, and file-commit semantics.

Services/main start and stop this owner alongside the Wails lifecycle; shutdown/profile invalidation cancel affected requests before closing adapters. Root/child contexts reach the existing native driver calls and cleanup. Normal completion removes only that request, not a newer request on the same connection. Switching effective browse inputs or closing a view cancels its obsolete request, while mere tab switching preserves already completed bounded warm data. Slow server work remains cancellable/loading, not guaranteed instantaneous. Do not automatically replay possibly writing SQL/commands after timeout, cancellation, disconnect, helper crash, or response-limit errors; inspect raw-command driver retry behavior as part of this guarantee. Cancellation does not undo work already committed, and live-driver interruption needs real fixture verification.

## Streamed export

Add an optional native QueryExporter capability implemented for PostgreSQL and SQLite and an ExportQueryCSV Wails method. It accepts the user-authored query and parameters, not a silently rewritten unlimited version of a query with an intentional LIMIT. The UI offers a distinct full-query CSV action for these engines; existing bounded current-result exports retain their behavior.

Reuse App.PickSaveFile through api.ts before starting an export; do not introduce another native-dialog implementation. Pass a client-generated unique export ID to the bound call so CancelExport can target an in-flight call before its completion response. Wire the export context/cleanup through the unbound Services lifecycle and main startup/shutdown; SqlService itself is not a second application lifecycle.

Use a PostgreSQL read-only transaction and a separate SQLite read-only connection. This prevents export from rerunning a write statement or a data-modifying CTE. Cancellation before choosing a path executes no SQL. Write through a buffered CSV writer row by row to a same-directory temporary file, preserving column order, escaping correctly, and protecting formula-leading string values consistently with current exports. Do not build full arrays, a complete string, or a WebView Blob for full export.

Return only row count, bytes written, output path, and cancellation status to the frontend. Register an export-specific job ID/cancel method rather than overriding the connection's current SQL cancellation slot. On cancellation, database failure, write failure, or disk-full, cancel the query and delete the partial temporary file; do not replace an existing target. Replace the chosen target only after a successful close/flush. App shutdown cancels jobs. Simultaneous exports have independent IDs and files. Do not automatically retry a query after a failed export.

## DuckDB packaging and lifecycle

Move the current native DuckDB adapter implementation and its native integration tests into an embedded-driver-only package. The desktop-facing duckdb package becomes a small SQLAdapter proxy preserving its current factory and TestDuckDBConnection entry points. Only cmd/kamehadb-duckdb-driver imports go-duckdb; verify the desktop dependency graph and linked executable no longer contain the native library.

The driver exposes the existing DuckDB metadata, preview, query, and optional table-stat methods over private standard-library JSON RPC on inherited stdin/stdout. No listening port or shell command construction. Pass file paths/configuration through the protocol, not through a shell. Stdout belongs exclusively to RPC; stderr carries bounded diagnostics. The parent owns child lifetime and routes cancellation by request ID. Driver startup verifies protocol compatibility before opening a database. EOF, crash, incompatible protocol, or failed startup produces a clear error; never automatically replay a query that may have written data. Close/reconnect/app shutdown reaps the process and releases file locks. Adapter construction itself stays lightweight so installation never happens while holding Registry's global mutex.

Set named DuckDB defaults for a 64 MiB engine memory limit, two execution threads, and an app-owned temporary spill directory. This is a DuckDB engine setting, not a limit on the helper's total RSS. Clean session spill directories after normal shutdown; failed cleanup does not delete database files.

Release builds produce a separate driver asset for Linux amd64, Windows amd64, and macOS universal, with a pinned protocol/release version and SHA-256 baked into the corresponding desktop executable. Build the helper before the Wails app so the app's checksum matches the exact driver asset. Do not bundle that helper into the base app download.

Explicit DuckDB connection testing/opening installs the matching driver into an owner-only app-data directory on first use. Background health checks must never download it, reinstall it, create a missing DuckDB file, or keep starting a separate helper for an unused profile. If unavailable, report that opening the connection will install the driver. Installed-driver health uses the existing active adapter where possible and does not disturb an open database file lock.

Installer rules: fixed trusted release origin and platform asset names, HTTPS, supported-platform check, named download timeout and maximum size, request cancellation, per-process singleflight and an atomic exclusive install lock for multiple app instances, temporary download, checksum verification before permission changes/execution, atomic rename, and protocol/version verification on use. Never accept a helper fetched without the baked-in checksum. An existing cached executable is verified before execution. A partial/corrupt download is removed; offline or unavailable release assets yield a specific retryable connection error. No fallback to removing DuckDB support or running an arbitrary system executable.

Development builds use an explicitly configured locally built driver path; that override is visible in diagnostics and is not a production checksum bypass. Release CI omits the override. Driver artifacts must actually be published with the new release; an older released tag without these assets cannot provide automatic installation. Local verification uses a generated helper and a test download server, not a false claim that new GitHub release assets already exist.

## Documentation and verification

CHANGELOG records all user-facing changes under Unreleased. README describes base versus optional installed bytes and offline first-use behavior. Review the five public surfaces required by AGENTS.md; change descriptor/install claims affected by optional DuckDB without claiming broader billion-row support or replacing screenshots with unverified mock data. Build landing if its files or README change.

Affected wiki coverage: architecture/overview.md, architecture/engine-support.md, workflows/sql-workspace.md, workflows/connections-and-workspace.md, workflows/engine-explorers.md, and operations/diagnostics-and-maintenance.md. The revision's new requirements target already-formatted engine-support/SQL/workspace requirement pages; engine-explorer legacy narrative is refreshed after implementation, not used as proof. Some pages still describe removed sidecar routes. After joint approval but before production edits, run document-wiki Task updates for the affected legacy sections, establish their current-source requirement baseline, and write the applicable scoped delta. Do not rewrite unrelated domains. Preserve docs/llm/LOG.md untouched.

Verify byte limits with many small rows, wide/escaped Unicode values, one oversized first row, metadata overhead, exactly-at-limit and one-over-limit results, and intentional cancellation versus genuine errors. Test every SQL collector's cap path and cancellation-before-close behavior, while acknowledging missing live Oracle/SQL Server/ClickHouse integration environments.

Test cursor pagination against duplicate sort values, integer keys beyond JavaScript's safe range, ascending/descending, empty/last pages, byte-shortened pages, changed search/sort/size, malformed cursors, absent/nullable/composite PK fallback, and placeholder/loading UI behavior. PostgreSQL plans use a session-local one-million-row fixture; SQLite uses a temporary indexed fixture. Capture EXPLAIN evidence that deep keyset pages seek an index and read roughly one page rather than walking preceding rows.

Test streaming export with a large generated result, Unicode/CSV quoting/formula protection, cancellation, write failure, successful atomic replacement, read-only rejection of writes, and no frontend result-array transfer. Native save-dialog selection is tested through an injected selector; do not manipulate the user's real desktop.

Test the all-engine expansion beside each behavior: independent/same-connection cancellation and early-cancel/completion races; exact unsigned/decimal/text keys and malformed/cross-context cursors; Mongo no-count first/next page, optional-count failure, byte-shortened ranges, writing pipeline executed once, and unchanged MCP paths; Redis compact oversized scans, bounded overflow/no dropped members, exact >2^53 cursor, empty/duplicate scan batches, TTL/type deletion races, binary string windows, list/ZSET rank continuation, oversized complete-member error, session expiry/close/shutdown, and raw-command ambiguity without replay. Real QueryClient tests verify the shared 32 MiB owner across SQL/Mongo/Redis, all close variants, duplicate tabs, metadata protection, fetching/observed protection, and immediate mutation GC. Private live fixtures and actual driver interruption tests are required where available; unverified types/engines stay explicit fallback or an incomplete verification item.

Test installation for hash mismatch, unsupported platform, missing assets, offline/error response, cancellation, concurrent installers, stale locks, corrupt cache, incompatible protocol, and child cleanup. Real local-driver integration must create/read/write/preview/test/close/reopen a synthetic DuckDB file successfully without leaked processes.

Run frontend/shared tests, shared typecheck plus explicit desktop tsc, lint, go test ./..., go build ./..., generated-binding compatibility, and an isolated production Wails build. Compare new stripped executable and gzip bytes with an equivalently rebuilt baseline; record total installed bytes separately with the optional driver. Target <=60 MiB base executable and <=20 MiB gzip on Linux amd64, not universal-platform promises.

Repeat contemporaneous baseline/fixed native runs with matched fixtures, viewport, timing, and private process trees. Include idle, five small-table tabs, mixed SQL/Mongo/Redis tabs, wide results, closing tabs, cancelled requests, and export; include active driver memory when DuckDB is used. Record native Redis remainder ownership and NoSQL decoded-reply peaks separately from frontend retention estimates. Report PSS distributions and heap evidence, not summed RSS as unique RAM or historical subtraction as savings. Provisional idle <=200 MiB and five-tab <=300 MiB PSS remain targets; missing them does not justify a false success claim.
