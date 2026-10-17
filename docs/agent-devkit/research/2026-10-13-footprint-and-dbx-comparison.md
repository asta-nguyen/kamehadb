# KamehaDB footprint, memory, and large-table browsing investigation

Date: 2026-10-13, Linux x86_64.
Scope: investigation and recommendations only. No production application code, bindings, existing settings, or user data were changed. Existing working-tree changes were preserved. The PostgreSQL fixture was session-local and disappeared when its connection closed. Follow-up runtime tests used copied source, private profiling instrumentation, temporary application profiles, a synthetic SQLite fixture, and Xvfb; the real desktop was not controlled.

## Bottom line

Keep Go/Wails for now. The largest demonstrated binary-size opportunity is DuckDB packaging, not changing backend language. There are reproducible result-retention issues and missing byte budgets to address before considering a rewrite. Indexed keyset pagination is the important change for deep table browsing.

A smaller base executable than DBX is plausible and supported by a throwaway build experiment, but that experiment **disables DuckDB**. Maintaining DuckDB support with a smaller base application requires an optional driver distribution; that production work has not been implemented. Lower RAM than DBX and smooth browsing of an actual billion-row table have **not** been established by this investigation.

## Confirmed follow-up decision

On 2026-10-13 the user accepted app-managed, on-demand DuckDB installation. This approves the packaging requirement, not a production implementation or a specific driver-loading design. Driver lifecycle, verification, version compatibility, and the implementation plan remain to be settled.

## Evidence boundaries

- Binary-size baseline: `b72923b94e73edc9576cc92ee79003a4a60740ea` plus existing uncommitted changes. Go source and the existing frontend `dist` were copied to a temporary directory before comparative size builds. That frontend was not rebuilt. The separate runtime follow-up below rebuilt a copied working-tree frontend with private test instrumentation; it is not an untouched tagged release.
- Build environment: Go 1.27.0, CGO enabled, Linux amd64, tags `desktop,webkit2_41,wv2runtime.download,production`, linker flags `-w -s`.
- DBX: release [v0.6.42](https://github.com/t8y2/dbx/releases/tag/v0.6.42), source commit `d9c464d7d5c41c7c2993d7ea19a3ffcfb2353292`. Its downloaded Linux `.deb` was extracted, **not installed**. Initial size inspection did not execute it; the later Xvfb follow-up executed the extracted binary with temporary HOME/XDG/data directories. Its SHA-256 matched the release API digest: `2488499b81768a975114fc1e5b81f2a88951984aa68679e118f809c84f438cc9`.
- DBX is [Tauri 2 + Vue 3 + CodeMirror 6](https://github.com/t8y2/dbx/blob/v0.6.42/README.md#tech-stack), not a native widget GUI without a WebView.
- MB headlines and installed sizes are not interchangeable. All numerical sizes below use MiB (1,048,576 bytes).
- Section 2's initial passive RAM observations concern an existing running KamehaDB instance with an unknown workload, **not idle/startup measurements**. Section 2b reports separately labeled automated Xvfb tests, not measurements of the user's real desktop. `ibara` remained offline on the final connectivity check; no real desktop input, `xdotool`, or live visual inspection was used.

## 1. Measured application size

| Artifact | Bytes | MiB | Meaning |
| --- | ---: | ---: | --- |
| KamehaDB full production executable | 111,662,776 | 106.490 | Existing engine support, existing embedded frontend assets |
| KamehaDB experiment without embedded DuckDB | 58,726,624 | 56.006 | DuckDB functionality disabled; not a usable all-engine release |
| DBX Linux executable from v0.6.42 `.deb` | 92,582,400 | 88.293 | Base executable; DuckDB driver is distributed separately |
| DBX Linux `.deb` download | 43,221,324 | 41.219 | Compressed distribution, not executable size |
| KamehaDB full executable, gzip level 9 | 36,742,780 | 35.041 | Compression comparison only; not an installer |
| KamehaDB no-DuckDB experiment, gzip level 9 | 17,940,183 | 17.109 | Compression comparison only; DuckDB disabled |
| DBX executable, gzip level 9 | 41,965,663 | 40.022 | Same compression method as the KamehaDB executable comparison |

The full-to-no-DuckDB difference is **50.484 MiB**, a **47.41% reduction** in raw executable size. The disabled-DuckDB experiment is **36.57% smaller** than DBX's base executable. These are size measurements, **not RAM savings**.

Even the full KamehaDB executable compresses smaller than the DBX executable with the same gzip settings in this experiment. That does not establish smaller installed footprint, feature parity, or a smaller official installer on every platform.

The existing frontend dist occupied approximately **3.04 MiB**. Both Go builds were already stripped. Stripping symbols again or only reducing frontend bundle size cannot explain or remove the measured 50.5 MiB DuckDB contribution.

DBX's [standalone DuckDB driver README](https://github.com/t8y2/dbx/blob/v0.6.42/agents/drivers/duckdb/README.md) explicitly keeps DuckDB and `libduckdb-sys` outside the main application's dependency graph and installs the driver through Driver Manager. Its [default desktop feature](https://github.com/t8y2/dbx/blob/v0.6.42/src-tauri/Cargo.toml) is `duckdb-sidecar`; enabling support does not mean the driver binary is embedded in the base application. The [runtime resolver](https://github.com/t8y2/dbx/blob/v0.6.42/crates/dbx-drivers/src/db/duckdb_worker_process.rs) reports that the driver must be installed if it cannot find it.

### Recommendation

If a smaller base download matters more than one-file, fully offline support for every engine, investigate **one optional, app-managed DuckDB driver package**, not a general plugin platform. Keep an all-in-one distribution available if offline use is required. Account for the driver in total installed size whenever it is installed: moving it outside the main executable does not make its bytes disappear.

A reasonable initial base-executable target is **at most 60 MiB**, and a standalone gzip download target is **at most 20 MiB**. These are proposed budgets for a production implementation, not measured production results. The experiment establishes a 56.0 MiB / 17.1 MiB lower starting point without DuckDB, but a real driver client, lifecycle, update verification, and cross-platform packaging still need design and tests.

## 2. Measured running memory

Three passive `/proc/<pid>/smaps_rollup` samples were collected between **02:39:28 and 02:39:34 +07:00**. The measured tree contained the main app and its WebKit renderer and network children; database-server processes, other browsers, build tools, and unrelated applications were excluded.

| Measure | Observed MiB |
| --- | ---: |
| Total proportional set size (PSS) | **543.07–550.77** |
| Median total PSS | **550.01** |
| Summed resident set size (RSS) | **826.30–834.00** |
| Median main-process PSS | 208.37 |
| Median WebKit renderer PSS | 290.24 |
| Median WebKit network-process PSS | 51.41 |

PSS apportions shared mappings instead of counting each shared library once per process, so it is a more useful Linux whole-app comparison than simply summing RSS. It is not JS heap or Go heap size. The main process includes GTK/native allocations and mapped executable pages, not just Go-managed memory. The WebKit children accounted for approximately **62%** of the observed PSS.

`main.go` already calls `debug.SetMemoryLimit(128 * 1024 * 1024)` and `debug.SetGCPercent(50)`. The limit is a **soft Go-runtime budget**, not a total-process or total-application RAM cap. It does not cover WebKit or native DuckDB allocations. Lowering it further without allocation profiles may increase GC CPU cost without fixing the dominant source.

### Reproduced retention issues

1. **Table preview cleanup does not match actual keys.**
   - `apps/desktop/src/components/table-view.tsx` removes `['previewRows', connectionId, tableId]` on unmount.
   - `apps/desktop/src/hooks/use-schema.ts` uses `QUERY_KEYS.PREVIEW`, which produces `['preview', connectionId, input]` in `apps/desktop/src/lib/query-keys.ts`.
   - A probe using the installed TanStack Query dependency retained the preview result after applying the existing cleanup filter: one matching fixture entry was still in the cache.
   - This does not prove permanent leakage: inactive query entries still have time-based GC. It proves the intended immediate cleanup is ineffective.
2. **Query GC settings do not bound completed query mutations.**
   - `apps/desktop/src/main.tsx` sets query GC to 60 seconds, but no mutation GC policy.
   - `apps/desktop/src/hooks/use-query.ts` executes SQL using `useMutation`.
   - In a browser-mode dependency probe, two successful, subsequently unobserved mutations retained their results with a **300,000 ms (five-minute)** GC lifetime despite the 60-second query setting.
   - `SqlEditor` clears component references on unmount, but this does not remove the mutation cache's separate references.

These are root-cause candidates for avoidable retention, **not measurements of how many MiB they explain in the initial unknown-workload instance**. Section 2b confirms retained references in actual React/Wails views. A fix-versus-baseline experiment and heap/native-allocation profiles are still needed to quantify savings.

### Other source-established opportunities

- Add row **and byte** budgets. `internal/engines/types.go` caps GUI SQL results at 50,000 rows, but a wide row or large JSON/text value can make that cap too large. Preview paths use `SELECT *`; hiding a frontend column does not stop its value from being fetched.
- Fetch bounded large-field previews and retrieve full JSON/BLOB/text only on explicit expansion. Define what happens when one cell exceeds the budget; silently dropping values is not acceptable.
- Bound retained preview pages across tables/tabs by estimated bytes and entry count, rather than GC duration alone.
- Stream exports to a backend file writer. `apps/desktop/src/lib/export.ts` currently builds strings/arrays and then a Blob from the already fetched result. A future full-table export must not aggregate all rows in the WebView.
- Lazy-load heavy workspaces (diagram, chart/statistics, terminals, editor/explorer panels) that are currently statically imported by `workspace-content.tsx`. Only the federated canvas is lazy there. The current workspace already mounts only its active tab; do not claim that every inactive editor is currently mounted.
- Review health checks and pool lifecycle: `CheckAllHealth` probes every saved profile, and SQL profile health checks obtain registry-cached adapters. Those adapters remain until invalidation/shutdown. Avoid introducing idle eviction that health probes immediately undo; settle connection-health behavior first.
- For DuckDB, add explicit native-engine resource limits and bounded work. Go's runtime memory limit does not constrain its native query memory.

### RAM budgets to validate, not promises

For a documented Linux x86_64 production fixture, propose:

| Scenario or bound | Initial target |
| --- | ---: |
| Empty app, settled after startup | ≤200 MiB total PSS |
| Five table tabs, 50-row pages, 20 small scalar columns | ≤300 MiB total PSS |
| Estimated retained row-dataset cache | ≤32 MiB |
| Serialized preview page payload | ≤2 MiB |
| After closing dataset tabs and settling | Return within 20 MiB of the corresponding clean baseline |

These targets need a controlled baseline and heap profiles before being treated as an achievable forecast. Row bytes/cache budgets are logical budgets, not hard caps on total process memory. Compare both apps at the same resolution, WebKit version, time since startup, connection count, dataset, tab count, and cold/warm state. Include every renderer, network, driver, and shell child in both totals. Do not count the database server unless comparing embedded-engine execution.

## 2b. Automated runtime follow-up: private Xvfb, not a live-desktop comparison

The background experiment completed both instrumented KamehaDB variants with six phases each and three whole-process-tree samples per phase. Each variant ran once, sequentially, with production build tags, the same rebuilt frontend, a 1280×800 viewport on a private 1600×1000 Xvfb display, and fresh HOME/XDG/application-data directories. Graphics environment requested `LIBGL_ALWAYS_SOFTWARE=1` and `WEBKIT_DISABLE_DMABUF_RENDERER=1`; these are headless-test conditions, not a hardware-desktop equivalence claim. Xvfb/DBus test infrastructure and unrelated applications were excluded from app totals.

The fixture contained five SQLite tables of 5,000 rows and 20 small scalar columns, plus 500 synthetic wide rows with approximately 64 KiB of ASCII text per cell. Only 50 rows were requested per table/query. SQLite's embedded-engine memory is included. Both healthy baselines had **one saved synthetic connection and no open tabs**; completely empty-profile attempts crashed as described below and were excluded. The probe used real store actions, React views, Wails bindings, table-preview queries, and SQL-editor auto-run, rather than a standalone backend simulation. Preview caches confirmed 50 rows per page; virtualization exposed 20 table-row DOM elements in the sampled viewport.

| Scenario | Full build, median PSS MiB | DuckDB-disabled experiment, median PSS MiB |
| --- | ---: | ---: |
| Settled startup, one saved connection, no tabs | **266.014** | **249.871** |
| One table, 50 small rows | **296.362** | **281.117** |
| Five table tabs, 250 cached small rows total | **332.514** | **311.913** |
| Ten wide SQL queries, 50 rows each; 15 tabs total | **392.294** | **376.515** |
| All tabs closed, short settle | **385.322** | **366.077** |
| Tabs closed, after a further 70-second wait and settle | **371.797** | **352.304** |

These are instrumented, single-session observations, not replicated performance certification or guaranteed production savings. Sampled paired idle difference was **16.143 MiB**, approximately 6.1%, far smaller than the 50.484 MiB executable-size difference. Most of the idle difference was in the main process. Do not attribute every small cross-run difference to DuckDB; library sharing, allocator high-water marks, and renderer timing can affect PSS. This variant still disables DuckDB; an on-demand production driver has not been implemented.

### Allocation and retention evidence

- Go's reported **allocated heap** was only **1.36–1.74 MiB** during startup/small-page phases and **7.68–8.12 MiB** after wide queries. These were `runtime.ReadMemStats` snapshots, without forced GC, not proof of reachable/live heap size. Go's reported runtime `Sys` was roughly 14–18 MiB initially and 38–42 MiB after wide queries; `Sys` is not RSS. The total app footprint is dominated by memory outside the allocated Go heap, including WebKit and native/mapped main-process memory.
- Full-build PSS components at settled startup were approximately **105.83 MiB main**, **144.30 MiB renderer**, and **15.89 MiB network**. After wide queries, they were approximately **143.75**, **232.53**, and **16.01 MiB**. Component snapshots and total medians are separately sampled and can differ slightly when summed.
- Immediately after tab closure, **five preview datasets / 250 rows** and **ten completed SQL-mutation datasets / 500 rows** were still referenced by TanStack caches. After the extra wait, previews were gone but **all ten mutation datasets remained**. This verifies the retention paths in the actual GUI/backend workflow.
- Wide-result scalar strings summed to **62.503 MiB of logical UTF-16 content** across the mutation datasets. This is not a heap-allocation measurement: compact strings and shared storage can change physical bytes. A single 50-row wide result already contains approximately **3.125 MiB of ASCII text**, illustrating why row limits alone are insufficient.
- After tab closure and query GC, total PSS remained approximately **106 MiB above the full-build baseline** and **102 MiB above the disabled-DuckDB baseline**. That delta cannot be assigned entirely to mutation retention without an A/B fix and allocation profiles; warmed editor/rendering resources and native allocator retention also remain candidates.
- Healthy no-tab baselines were 250–266 MiB, and five-tab measurements were 312–333 MiB. The initial RAM targets are therefore not validated by this setup; in particular, the proposed five-small-tab ≤300 MiB target was not met.

### Correctness problems encountered, not fixed

1. A fresh metadata DB returns a nil profile slice from `internal/store/profiles.go:ListProfiles`, serialized as `null`. `WelcomePage` in `workspace-screen.tsx` checks only `connections !== undefined` before accessing `.length`, and throws. Both empty-profile pilot runs displayed the error boundary, not a healthy idle view; their RAM samples were excluded. Seeding one synthetic connection before startup allowed the unchanged views to run. The revised measurement runner rejects error-boundary log entries.
2. All ten wide SQL queries succeeded in each healthy run, but their automatic query-history saves logged JSON-binding errors: fractional `durationMs` values could not be unmarshaled into `SaveQueryHistoryInput.durationMs`'s Go `int64` field. This was not patched or suppressed. Those workflow errors are recorded in the isolated logs and qualify the experiment; completion of the memory protocol does not mean all app behavior passed.

### DBX reference measurement and remaining comparison gap

The extracted DBX v0.6.42 binary was run with fresh temporary directories on a private Xvfb display. After 30 seconds, three process-tree samples gave **316.092 MiB median PSS** and **654.871 MiB summed RSS**. Its WebKit renderer was present, but the first-run UI/dialog state was **not verified** and no equivalent connection/table/query workload was automated. This is a stock startup-process reference, **not a matched idle or browsing comparison**, and must not be used to claim a RAM victory over DBX.

Evidence: `/tmp/kamehadb-runtime-probe.CnjfZ4/results/controlled-seeded/runtime-samples.jsonl`, `runtime-summary.json`, `finished.json` (two cases, no measurement-protocol errors), `artifacts.json`, copied/instrumented source, and per-profile logs. Initial failed pilots and the DBX startup reference remain in `/tmp/kamehadb-runtime-probe.CnjfZ4/results/`. The probe completed and no processes with its private profile HOME remained. Raw temporary artifacts are not durable; the measurements and limitations above are the retained report.

## 3. Measured paging behavior

A dedicated connection to the documented local PostgreSQL development endpoint created a **temporary** table with **1,000,000 rows**, a `bigint` primary key, and a 64-character text payload. Each query returned 50 rows. Five `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` runs per query recorded database execution time, excluding transport, frontend rendering, and SQL planning time.

| Query shape | Median database execution time |
| --- | ---: |
| First page, indexed order, `LIMIT 50 OFFSET 0` | **0.056 ms** |
| Last page, indexed order, `LIMIT 50 OFFSET 999950` | **272.232 ms** |
| Last page, `WHERE id > 999950 ORDER BY id LIMIT 50` | **0.041 ms** |

The deep-offset plan visited **1,000,000 index-scan rows** to return 50; the keyset plan visited **50**. This demonstrates the work difference even with an index. The sequential test order and local/warm fixture affect timings; the ratio is not a universal speedup guarantee. It is **not a billion-row benchmark** and must not be multiplied into a prediction for a billion-row database.

`internal/engines/postgres/postgres.go` currently builds table previews using `LIMIT/OFFSET`. Prefer indexed keyset navigation where a stable unique ordering exists, including composite-key tie breakers and defined null handling. Preserve a bounded fallback for views or tables without suitable keys. Arbitrary numeric page jumps need a separate UX/strategy; do not pretend cursor navigation makes them constant-time.

Filter/sort indexes still matter. Contains search with `ILIKE '%text%'` can scan large tables without a suitable search index. A byte-capped page does not cap database execution work.

The GUI's Go-side collection cap also should not be treated as a server-side limit: PostgreSQL `collect` stops adding rows and calls `pgx.Rows.Close`. In pgx v5.11.0, [`ResultReader.Close`](https://github.com/jackc/pgx/blob/v5.11.0/pgconn/pgconn.go) consumes remaining result data. For unbounded statements, use appropriate server-side bounds/cursors and cancellation, not just a client-side array cap. Validate across each supported driver before generalizing this finding.

## 4. What DBX already does well

Do not compare KamehaDB to old memory-audit suggestions as though DBX never implemented them. The current v0.6.42 code has:

- An inactive-result cache limited to **five results and an estimated 128 MiB**, enforced by `trimResultCache` in [queryStore.ts](https://github.com/t8y2/dbx/blob/v0.6.42/apps/desktop/src/stores/queryStore.ts).
- A **32 MiB** table-result budget, large-value preview controls, and a **16 MiB** visible-preview content cache in [dataGridLargeValues.ts](https://github.com/t8y2/dbx/blob/v0.6.42/apps/desktop/src/lib/dataGrid/dataGridLargeValues.ts).
- Backend [streaming result export](https://github.com/t8y2/dbx/blob/v0.6.42/crates/dbx-core/src/data/query_result_export.rs), including buffered JSON writing, cancellation, and keyset optimization for eligible exports.
- Separate DuckDB driver distribution, as documented above.

DBX's [June 2026 runtime audit](https://github.com/t8y2/dbx/blob/v0.6.42/docs/performance/runtime-memory-audit.md) reports about 194 MiB backend RSS and 480 MiB Chrome renderer RSS for a 50,000-row/12-column grid. It used **development Web mode on macOS**, not the current production Linux desktop build. Its Vite memory must be excluded, and these figures cannot establish a current production RAM advantage for either app.

DBX has a broader advertised feature/driver surface. Smaller base bytes alone do not establish overall product superiority or equal functionality. A real RAM or billion-row browsing claim requires a same-machine workload comparison.

## 5. Recommended order of work

1. **Extend the measurement harness:** repeat fresh starts, match DBX's actual UI/workloads, capture export peaks, and obtain frontend heap snapshots plus Go/native allocation profiles. Resolve the fresh-profile and query-history correctness issues before certifying a clean workflow. Establish the source of retained allocations, not just RSS changes.
2. **Bounded retention fixes:** correct preview-key cleanup; set a completed/inactive SQL-mutation retention policy; add page-cache budgets. Regression tests must reproduce the original retention and preserve current visible-result behavior.
3. **Bounded transfer and large values:** byte-aware backend result limits, explicit truncation metadata, lazy large-field retrieval, and streaming export. Test oversized single cells, multibyte/escaped JSON, cancellation, and concurrent tabs.
4. **Deep browsing:** stable indexed keyset pagination with supported-sort eligibility and a fallback. Test composite keys, nulls, duplicate sort values, concurrent inserts/deletes, next/previous behavior, and actual large-table query plans. Start with one engine and reuse the adapter contract; do not promise identical semantics for every engine without tests.
5. **Startup/on-demand work:** lazy-load heavy frontend modules; establish idle connection/pool rules that respect health checks and active shells/watchers/MCP.
6. **Optional DuckDB packaging:** decide offline requirements, cross-platform driver loading/lifecycle, update verification, failure messages, and total installed-size reporting before implementation. Avoid a speculative general-purpose plugin framework.

No Rust rewrite is recommended on the evidence collected. Reconsider language or GUI architecture only after profiles show a bottleneck that the narrower changes cannot address.

## Verification and reproducibility

Successful checks:

- Two stripped production-tagged Go builds from the same temporary source/asset snapshot: full and footprint-only DuckDB-disabled.
- Exact executable sizes, equal-setting gzip sizes, and SHA-256 verification of the official DBX `.deb`.
- Three whole-process-tree memory samples, with RSS and PSS separated.
- Cache-key mismatch and five-minute completed-mutation retention reproduced using the repository's installed TanStack Query dependency with Node 22.22.2/pnpm.
- Fifteen PostgreSQL `EXPLAIN ANALYZE` results checked: five samples per query shape, each returning 50 rows. The dedicated connection closed and its temporary fixture was removed by PostgreSQL.
- Follow-up production-tagged instrumented builds and 36 Xvfb process-tree samples: two variants × six phases × three samples. Cache counts, rendered-root/table-row markers, Go allocation counters, protocol completion, and private-process cleanup verified.
- DBX stock startup process tree sampled separately; no matched UI/workload claim.

Limits:

- No matched live-desktop idle/browsing RAM comparison: the available `ibara` computer was offline. Automated Xvfb results are separately labeled and use private profiling builds.
- DBX startup process memory was sampled, but UI state was unverified and no equivalent DBX browsing workload was measured.
- No actual billion-row fixture or end-to-end UI latency test.
- No quantified MiB savings from the proposed retention/lazy-load fixes.
- No full repository test/typecheck/lint/Wails-build verification: this was investigation-only, and production files were not changed. Temporary `go build` checks do not certify the existing dirty working tree or a future implementation.

Temporary evidence directory for this session: `/tmp/kamehadb-footprint-audit.b3qrFO/` (not durable documentation). It contains copied primary DBX sources, the verified release archive/extracted executable, both Go build artifacts, size/memory/paging JSON summaries, raw query plans, the isolated paging probe, and cache reproduction output. Raw live memory samples are at `/tmp/kamehadb-live-memory-samples.json`.

Rebuild commands used against the temporary Go snapshot:

```sh
go build -tags 'desktop,webkit2_41,wv2runtime.download,production' -ldflags '-w -s' -o <full-binary> .
go build -overlay <duckdb-disabled-overlay.json> -tags 'desktop,webkit2_41,wv2runtime.download,production' -ldflags '-w -s' -o <experimental-binary> .
gzip -9 -c <binary> | wc -c
```

The overlay replaced only the DuckDB adapter implementation with a footprint-only stub. It is explicitly not a feature-preserving optimization or a release candidate.

Status: pass
Evidence: Investigation measurements and bounded diagnostic reproductions verified as described above; no implementation completion is claimed.
Blockers: None for reporting the findings. Controlled GUI access and actual large-table workload tests are required before comparative RAM or billion-row support claims.
Non-blockers: Production recommendations remain unimplemented and RAM targets are provisional.
Spec gaps: On-demand DuckDB installation is accepted; driver loading, lifecycle, verification, and an implementation plan remain unapproved.
Wiki impact: no
Wiki pages: none
Wiki action: No behavior was changed; no wiki update needed for this investigation.
