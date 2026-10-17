# Interim sorting and application RAM benchmark

Measured on 2026-10-14. This is a progress checkpoint, **not a matched-baseline improvement or final Task 7 result**. See [tasks](tasks.md), [verification](verification.md), and the [machine-readable results](benchmark-results.json).

## Build and method

- Three fresh production-mode Wails application launches, each with private HOME/XDG/application-data directories and a synthetic SQLite database. The real App, workspace store, TableView sortable headers, SQL editor, QueryClient, generated bindings and Go adapters were used; no replacement grid or HTTP API.
- Source: `b72923b94e73edc9576cc92ee79003a4a60740ea` plus the then-uncommitted optimization/UI work. Measurements were taken **before** pulling `4f5ea86`; they are not a measurement of the post-pull checkpoint.
- Instrumented binary SHA256: `01ac6c3131d015f94a12a9ec950fe404d68573100b3676b449a27c1db29eb3cc`. Instrumentation existed only in the private source copy, not production bindings. The instrumented executable is not base-download-size evidence.
- Linux amd64, Go 1.27.0, Node 22.22.2, Wails 2.16.0. Private Xvfb 1600×1000 display; configured app window 1440×900; software OpenGL and DMABUF disabled. This is a shared workstation, not an isolated performance host or another platform's native renderer.
- Sample the actual application PID and descendants through `/proc/*/smaps_rollup` every approximately 500 ms. Include WebKit web/network processes; exclude Xvfb/dbus launch infrastructure. No DuckDB helper was active in these SQLite-only runs.
- Report PSS and summed RSS separately: RSS double-counts shared pages. Each RAM result is the median of the three per-run phase medians. Phases have an eight-second sampling window; idle follows a twelve-second startup wait; the long-close phase follows an additional sixty-second wait. No forced GC or OS-cache flushing.
- Synthetic sorting fixture: 1,000,000 rows, `id INTEGER PRIMARY KEY`, `indexed_key = (id * 7919) % 1000000`, and Unicode text `label` beginning with the zero-padded scrambled key. Only the fixture's explicit secondary-key index was created; **the app does not create indexes**. Native plans show primary-key ordering, secondary-index ordering, and a scan plus temporary sort for the unindexed label.
- Each sorted result displays 50 complete rows. Six ascending/descending samples per column per run, eighteen per column overall. Before each interaction, remove only unobserved preview variants to require a native call; verify the first row's global order and returned row count.
- Binding timings cover the native call's promise round-trip. Instrumented interaction timing starts before a phase-marker IPC, dispatches the real header click, waits for query settlement, and finishes after two animation-frame callbacks. It therefore includes benchmark-marker overhead and is **not** isolated database execution time or screenshot-certified paint latency.

## Sorting results

| Server-global order | Samples | Instrumented interaction median | Observed range | Binding round-trip median |
| --- | ---: | ---: | ---: | ---: |
| Primary key `id` | 18 | 79 ms | 56–288 ms | 8 ms |
| Indexed `indexed_key` | 18 | 89 ms | 51–163 ms | 13.5 ms |
| Unindexed Unicode `label` | 18 | 374 ms | 334–427 ms | 315.5 ms |

These are bounded first-page sorts over a million-row fixture, not local sorting of fifty arbitrary rows, whole-table downloads, deep arbitrary-sort acceleration, or billion-row certification. Cache state/host scheduling can affect individual samples.

## Whole-application memory

All values are MiB. Go heap is HeapAlloc at the phase's end, not a forced-GC live-object reading; Go Sys and whole-app RAM are separate metrics in the JSON.

| Phase | PSS | Summed RSS | Go HeapAlloc | Retained preview/query rows |
| --- | ---: | ---: | ---: | ---: |
| Idle, one saved SQLite profile | 321.5 | 787.4 | 1.55 | 0 / 0 |
| Million-row table, first page | 357.4 | 830.9 | 1.56 | 50 / 0 |
| Five small-table tabs | 424.4 | 898.4 | 2.19 | 250 / 0 |
| Wide preview plus five small tabs | 429.4 | 903.7 | 7.36 | 282 / 0 |
| Wide query, intentional LIMIT 100 | 444.0 | 918.4 | 13.73 | 0 / 100 |
| Closed, short settle | 428.7 | 903.1 | 13.74 | 0 / 0 |
| Closed, additional sixty-second wait | 428.7 | 903.1 | 13.76 | 0 / 0 |

- Per-run idle PSS medians: **301.6 / 321.5 / 332.4 MiB**. Five-small-tab medians: **399.1 / 424.4 / 428.7 MiB**. Long-close medians: **418.5 / 428.7 / 446.7 MiB**.
- Sampled overall PSS peaks: **463.3 / 482.8 / 505.1 MiB**; half-second sampling is not a guarantee of the true transient maximum. All reported phase median SwapPSS values were zero.
- Each of the five small tables contains 5,000 rows and 20 columns. The wide table contains 300 rows with complete 64,000-byte text payloads. Its preview admits **32 rows** under the 2 MiB budget; the separately executed query intentionally requests 100 rows and fits within the 8 MiB query budget.
- Closing all tabs removes the observed preview/mutation row references, but process PSS does **not** fall back to idle within this observation window. Cache cleanup alone is not whole-process reclamation; these results do not identify the remaining allocator/native/WebKit cause.

## Targets and missing evidence

**RAM targets missed:** idle ≤200 MiB PSS and five small tabs ≤300 MiB PSS. Do not claim the current work has met those goals or reduced RAM against a matched build.

Remaining: contemporary equivalent baseline/current builds and runs, repeat after the pull, quiet-host sensitivity, other engines and mixed tabs, active-helper and installed/download bytes, native decoding/remainder peaks, cancellation/search/deep-page/export-throughput phases, real desktop/platform checks, RAM-retention diagnosis and final documentation/review. Tasks 10–12 and 7 remain open. Earlier individual base-size/native-plan samples remain historical evidence, not this benchmark's measured improvements.

## Evidence retained privately

`/var/tmp/kamehadb-sort-ram.auEOPe/` contains the private source/instrumentation, fixture, SQLite plans, build/typecheck logs, runner, and three `run-N/{events.jsonl,memory.jsonl,runtime.log}` sets. Each run's finish event reports `pass: true`. The checked-in JSON contains aggregate/per-run measurements without process command lines, profiles, credentials, fixture files or result datasets.
