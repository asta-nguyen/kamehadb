# Handoff: Smaller runtime and bounded large-table browsing

## Objective

Reduce RAM/base-download weight while preserving Go/Wails, profiles and ten engines; finish truthful bounded large-dataset browsing and matched RAM/size/performance evidence.

## State

- Phase: implement/verify. Joint [design](design.md), [tasks](tasks.md) and [delta](delta.md) remain approved and open; **8/12 tasks recorded done: 1–6, 8, 9**. Tasks 10–12 and 7 remain todo.
- User explicitly prioritized sorting/application RAM measurements, then requested pulling latest, followed by a **partial checkpoint commit/push and PR comment**. This supersedes the earlier uncommitted-only instruction, not the remaining implementation/verification requirements.
- Branch: `refactor/wails-go-rewrite`; checkpoint based on pulled `4f5ea86`. Incoming changes were fast-forwarded and combined with local work. The staged toast rename and unrelated files were preserved during pull; private `.probe/` remains excluded from the checkpoint.
- [Interim benchmark](benchmark.md): three pre-pull production-app SQLite runs passed fixture/order/lifecycle assertions. RAM targets were missed; this is not a matched-baseline improvement or completion of Task 7.
- No final archive, release publication, automatic index creation or production probe bindings. `docs/llm/LOG.md` remains absent.

## Decisions

- [Decision Log](tasks.md#decision-log): all-engine expansion is performance-only; native full CSV stays PostgreSQL/SQLite. Preserve original values; no automatic indexing/replay; request-owned cancellation; private synthetic fixtures.
- [Task 9 evidence](verification.md#task-9--exact-additional-sql-paging): exact/scoped key bindings and protocol 2; matching freshly built helpers are required.
- Benchmark interaction timings include instrumentation/marker IPC and two animation-frame callbacks; binding round-trip is a separate metric. No savings, billion-row, whole-app-memory ceiling or native all-platform claim.

## Evidence

- Fresh checkpoint: workspace/shared and explicit desktop typechecks, workspace lint and tests — exit 0; **98 desktop tests / 22 files**.
- Full `go test ./...` with a freshly built development-version helper plus private release-install opt-ins; `go build ./...` — exit 0. An initial test setup used a release-version helper where `dev` was required, correctly failed the handshake, and was rerun with a matching helper without weakening production version checks.
- Pull preservation: 3,615 original files outside incoming changes remained byte-identical; staged binary diff remained identical; no unresolved merge entries. Backup: `/var/tmp/kamehadb-pull.rW8KiA/`.
- Benchmark medians: primary-key/indexed/unindexed sort interactions **79 / 89 / 374 ms**; binding round-trips **8 / 13.5 / 315.5 ms**. Whole-app PSS: **321.5 MiB idle, 424.4 MiB five small tabs, 444.0 MiB wide query, 428.7 MiB long-close**. Preview/mutation row references reach zero after close; RAM does not return to idle. Method/data: [benchmark](benchmark.md), [JSON](benchmark-results.json).
- Historical native SQL/helper/cancellation/CSV tests and their exact unavailable checks remain in [verification](verification.md). These are not newly executed native server/platform certifications at this checkpoint.

## Changed files

- SQL adapters/budget/cursors, SQL preview navigation/cache ownership and result-limit UI — bounded complete rows, exact eligible continuation and truthful offset fallback.
- Native CSV service/collectors/actions — PostgreSQL/SQLite streaming, atomic destination preservation and independent cancellation.
- DuckDB proxy/embedded helper/installer/build/release wiring — optional verified child, exact values and lifecycle cleanup; combined with upstream installer packaging.
- Shared request owner, SQL/Mongo/Redis services/hooks/API/bindings and lifecycle tests — request-ID cancellation, stale-response/no-replay guards; **not NoSQL page-budget completion**.
- Existing UI polish, toast rename, table/sidebar/tooltips/editor changes and generated files — pre-existing user/implementation work included in the requested checkpoint.
- Changelog, open change records, research, benchmark summary/JSON and marked-incomplete wiki baseline pages — progress and limitations, not final product documentation.

## Remaining work

1. Task 10: Mongo whole-document browse/raw budgets, no compulsory counts, separate count quality/actions, admitted-count navigation, writing-pipeline semantics, bindings/UI/tests; preserve MCP bounded methods.
2. Task 11: Redis per-type/rank/scan continuation, exact cursors, bounded replayable overflow, lossless labelled byte windows and restrictions on incomplete-original operations.
3. Task 12: extend SQL browse ownership across Mongo/Redis; shared LRU, final-owner Redis lease release and immediate unobserved NoSQL mutation GC.
4. Task 7: equivalent baseline/current builds and ≥3 matched runs per build, post-pull measurements, mixed engines/helper/exports/search/cancellation, payload/remainder/decoding peaks and installed/download bytes. Diagnose missed RAM targets and persistent post-close PSS before claiming improvements.
5. Refresh current public/wiki runtime/install/limits documentation and merge only verified delta blocks. Final review/archive stays deferred; this checkpoint is not release-ready.

## Risks and blockers

- Native Oracle/SQL Server/MySQL 8/Mongo/Atlas and Windows/macOS runtime remain unverified. Real desktop/Docker access was unavailable; private Xvfb works. Synthetic runs do not certify production workloads.
- Helper assets remain unpublished. Cross-compilation/private mirrors do not establish release-tag download availability.
- Legacy wiki narrative and requirement baselines are explicitly marked incomplete; the NoSQL/shared-owner delta is not implemented or merged. Full documentation completion remains Task 7.
- Historical broad CSV race run timed out; narrowed passing checks do not turn it into a pass.
- Use disk-backed `/var/tmp` scratch for large builds/fixtures; preserve historical evidence and private profiles. No forced GC was used in the benchmark.

## Next action

Inspect benchmark per-process/Go metrics to investigate persistent RAM without assuming cached row references are the cause; preserve the interim evidence. Then resume Task 10 → 11 → 12 and finish Task 7's matched evidence/docs/review. Do not request renewed design approval unless scope or risk materially changes.
