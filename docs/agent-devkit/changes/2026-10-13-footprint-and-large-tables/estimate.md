# Feature Estimate

Refreshed remaining-effort snapshot: 2026-10-14. Tasks 5, 6, 8 and 9 have since passed their recorded checks. The unfinished-task ranges retain the original low-confidence assumptions; this is not a promised wall-clock delivery time. The original 2026-10-13 total was 21–39 active hours before those tasks completed.

## Plan

- [Approved tasks](tasks.md), [design](design.md), and [delta](delta.md).
- Remaining-effort estimate refreshed on 2026-10-14. Joint approval is recorded; it does not mean completion.
- Baseline `b72923b94e73edc9576cc92ee79003a4a60740ea` exists and remains HEAD. The working tree contains the previously traced implementation plus pre-existing changes; nothing was committed or pushed.

## AI support profile

Active engineering effort for a developer using a coding agent that can read/edit source, write/run tests, build private native fixtures, and update documentation. Includes context gathering, implementation, expected debugging, bindings, review, and the plan's documentation/measurement work. This estimates remaining effort, not effort already spent or guaranteed elapsed time. Tasks 1–6, 8 and 9 are recorded done; remaining work is Tasks 10–12, followed by Task 7's evidence/documentation phase. Source/available native evidence for completed tasks is recorded in [verification](verification.md) and the task results.

Excludes waiting for missing computers/database environments, CI runners, release publication, and user responses. Native fixture preparation/execution is included when an environment is available. Unavailable-platform/engine verification must remain explicitly incomplete; these estimates do not certify it. No generic AI-speed discount is applied.

## Task estimates

| Plan task | Hours | Confidence | Basis and risks |
| --- | ---: | --- | --- |
| Task 1: Bound SQL results during collection | 0h | High | Recorded done; shared budget/collector and affected Go/model checks already exist. Regression verification is included in Task 7, not charged twice. |
| Task 2: Bound cache retention and native/startup memory | 0h | High | Recorded done; actual SQLite PRAGMA tests, QueryClient ownership tests and lazy frontend build exist. Whole-process measurements remain Task 7. |
| Task 3: PostgreSQL seek paging and safe frontend navigation | 0h | High | Recorded done; exact cursors, frontend bookmarks and private native million-row fixture were verified. |
| Task 4: SQLite seek paging | 0h | High | Recorded done; native wide/exact-key/deletion/fallback tests and seek plans exist. |
| Task 5: Stream full CSV exports natively | 0h | High | Recorded done with Linux native/component regression evidence. Native Windows/macOS replacement remains an explicit verification limit, not certified completion. |
| Task 6: Preserve DuckDB through a managed optional driver | 0h | High | Recorded done with real Linux helper/private-Wails checks, installer/reuse/cleanup evidence and release wiring. Native Windows/macOS execution remains unverified; release assets remain unpublished. |
| Task 7: Persist verified behavior and repeat footprint evidence | 3–6h | Low | Equivalent baseline/new builds, repeated whole-process phases, mixed engines/helper/export, full checks, wiki delta, install/public docs and final review. No prior RAM sample proves a contemporary improvement; environment and build failures can widen effort. |
| Task 8: Own cancellable GUI requests by ID | 0h | High | Recorded done: shared service ownership, actual PostgreSQL/Redis cancellation/reuse, private production-Wails/React/WebKit hook cleanup and negative control, exact generated blocks, full Go checks and 94 frontend tests. Unavailable native drivers are explicitly not certified. |
| Task 9: Extend exact SQL seek eligibility without faking ClickHouse uniqueness | 0h | High | Recorded done with private native MariaDB/DuckDB/helper/ClickHouse checks, PostgreSQL/SQLite regressions, exact cursor scopes and model generation. Oracle/SQL Server native plans/collation, MySQL 8 and other platforms remain explicitly unverified, not mock-certified. |
| Task 10: Bound Mongo pages and remove compulsory counts | 2–4h | Medium | Existing native find/aggregate and BSON serialization can be retained. Whole-document admission, optional independent counts, writing-pipeline semantics, new footer/bookmarks and bindings/tests must change together without altering MCP contracts. |
| Task 11: Page Redis keys and values without losing scan overflow | 4–7h | Low | Most novel remaining browse work: context-bound exact continuations, replayable bounded scan overflow, leases/concurrency/expiry, per-type ranks, lossless binary windows, UI safety and native fixtures. COUNT is not a reply bound; hidden loss/replay is a correctness risk. |
| Task 12: Share browse-result ownership across SQL, Mongo, and Redis | 1.5–3h | Medium | Extend the existing tested SQL owner rather than build a new cache. Mixed identities, last duplicate owner, Redis lease release, obsolete request cancellation and mutation GC need new real QueryClient/store regressions. |

## Total

- Active engineering effort: **10.5–20 hours remaining**, roughly 2–3 eight-hour working days; not a guaranteed wall-clock ETA.
- Blocked tasks: **0 (all tasks have estimable implementation effort)**. External verification/publication availability is excluded, not declared complete.
- Confidence: **Low**, chiefly Mongo/Redis paging correctness, shared ownership and final matched measurements.
- Current sequence reaches the final matched RAM/download-size report after the remaining implementation tasks and Task 7. Task 7 itself is **3–6 active hours** including builds, repeated samples, documentation and review. A deliberately interim benchmark of the current build could be prioritized next for approximately **3–6 active hours**; that would not certify unfinished all-engine behavior or complete Task 7.

## Open unknowns

- Availability of real Windows/macOS and live Oracle/SQL Server/MySQL 8 and other engine fixtures; waiting for them has no defensible calendar duration here.
- Native exact-key/cancellation behavior where no fixture has been run; unsupported or unverified paths must remain fallback or an explicit verification limit.
- Actual matched whole-process RAM and base/download/installed sizes. Targets are not achievements and failed targets must be reported.
- Matching helper release assets require a future authorized release; the no-commit/no-push instruction remains in force.

The refreshed table contains all 12 tasks exactly once; arithmetic (10.5–20) and relative links were tool-verified. Repository-wide `git diff --check` still flags dirty toast/generated Wails model whitespace; this refresh does not alter those files or claim the complete dirty tree is clean.

This estimate becomes stale when the tasks, scope, assumptions, or verification requirements change.
