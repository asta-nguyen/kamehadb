# Changelog

All notable changes to KamehaDB are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Changed

- **MCP credential vault key** — store the AES-256-GCM key in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) instead of a `.mcp.key` file beside the database. An existing key file is moved into the keychain on first use; where no keychain is available the owner-only key file remains as a fallback and a warning is logged.
- **Desktop runtime** — replace the Tauri/Rust shell and Node sidecar with a single Wails/Go binary. All backend routes are now in-process Go services and the frontend communicates through generated Wails bindings, eliminating sidecar IPC.
- **Desktop bundle size** — the local macOS ARM64 Wails app bundle is about 80% smaller than the previously installed app.
- **Query editor** — replace Monaco with CodeMirror 6 across SQL, MongoDB, Redis, and federated query surfaces.
- **Release packaging** — ship `.dmg`, `.deb`, Fedora 40+ `.rpm`, and `.AppImage` packages, plus a Windows NSIS installer and a WiX `.msi` for stable tags. The AppImage uses the GTK bundling plugin and requires the host WebKit2GTK 4.1 runtime; it does not bundle the WebKit subprocess runtime.
- **Compact table workspace** — remove the duplicate table title strip (the tab already names the table), move the match-case toggle inside the search field, and drop the Sort-by dropdown; clicking a column header sorts and a hover glyph marks sortable columns. The footer keeps the row count and query duration together on one line with an icon-led pager.
- **Table and tab affordances** — the row `⋮` menu in the table view and query editor uses the smaller icon size; a tab's connection dot only shows when that connection is not healthy, and the tab close button appears on hover or focus.
- **Denser sidebar** — connection rows, group headers, schema rows and table rows each lose four pixels of height, the connection list keeps a single 6 px gap, and the API settings entry uses the small button size.
- **Navigation labels** — the sidebar entry keeps a single "API Settings" label with an active state (the page's back arrow returns to the workspace) and the page header drops the profile and version badges; the schema tree keeps a single search box that now matches table names as well as schema names and opens the schemas that match, so the per-schema `Filter tables` box is gone and the tree rows sit one level tighter.
- **Micro type tier** — badges, keyboard hints and footnotes move from 10 px to an 11 px tier recorded in `DESIGN-SYSTEM.md`.

### Added

- **Native full CSV export** — stream read-only PostgreSQL/SQLite queries or whole tables directly to disk, preserving intentional query limits and keeping displayed-row exports available. Cancel or close the view without replacing an existing destination; changing connections cannot launch a stale export dialog.
- **Column-specific table search & case-sensitive toggle** — add column filter dropdown (`All fields` or specific column) and `Aa` Match Case toggle to Table View search; uses native fast string operations (`instr` in SQLite, `contains` in DuckDB, `position` in ClickHouse, `INSTR` in Oracle, `BINARY LIKE` in MySQL) to accelerate queries on million-row tables by up to 3x–5x.

### Performance

- **Interim sorting/RAM benchmark** — three private Wails/SQLite runs over one million rows measured median instrumented sort interactions of 79 ms (primary key), 89 ms (indexed column), and 374 ms (unindexed text), displaying 50 rows. Whole-app PSS medians were 321.5 MiB idle and 424.4 MiB with five small tabs: RAM targets remain unmet, and no matched-baseline improvement is claimed. See the [method and remaining evidence](docs/agent-devkit/changes/2026-10-13-footprint-and-large-tables/benchmark.md).

- **Exact SQL paging** — extend eligible primary-key seeks to MySQL/MariaDB, SQL Server, Oracle and DuckDB with exact unsigned/wider anchors and connection-owned bookmarks. Unsupported keys and arbitrary sorts retain server-side offset fallback; ClickHouse stays non-unique offset paging and streams bounded native responses without admitting failed partial queries.
- **Request-scoped cancellation** — SQL, Mongo and Redis GUI calls use bounded per-request ownership. Cancelling, closing or changing one view no longer targets a connection-wide query slot; exports keep independent cancellation. Ambiguous commands are not automatically replayed, and cancellation does not claim rollback.
- **Optional DuckDB driver** — keep DuckDB support in an app-managed helper instead of linking its native library into the desktop. Matching release builds verify the first-use download and cached executable, use private cancellable stdio RPC, and clean up owned children/spill files. Background health does not install/start unused helpers or create databases; development uses an explicit local build.
- **Mongo browse cancellation/no-count pages** — MongoDB find/aggregate no longer issue compulsory count queries; responses report whether more rows may follow, admit complete documents within the 2 MiB browse cap, and oversized first documents fail explicitly.
- **Go/Wails runtime comparison** — local synthetic PostgreSQL timings were similar to the previous Tauri/Node build: median ~8 ms for 1,000 rows in both builds and ~15 ms vs. ~13 ms for 10,000 rows. A one-time macOS ARM64 process-footprint snapshot measured ~179 MB vs. ~206 MB across app processes; the apps had different UI states, so treat the RAM figures as indicative only.
- **Virtual table scrolling** — add `@tanstack/react-virtual` row windowing in `DataTable` for results over 40 rows to prevent massive DOM tree and WebProcess memory expansion.
- **Go runtime memory limits** — cap Go heap target at 128MB with `debug.SetMemoryLimit` and GOGC=50 to eagerly reclaim and release unused pages back to the OS.
- **Query cache trimming & lazy indexing** — reduce frontend query cache retention from 5 minutes to 60 seconds and eliminate eager startup AI schema indexing across all configured profiles.
- **SQL engine query allocation & GUI row cap** — preallocate and reuse scan pointer buffers across SQLite, MySQL, Postgres, SQL Server, Oracle, DuckDB, and ClickHouse to eliminate millions of per-row heap allocations; cap unpaginated GUI results at 50,000 rows with a `Truncated` badge to prevent WebKit IPC freezes.
- **SQLite engine PRAGMAs & LIKE search filtering** — tune SQLite connections with `mmap_size` (256MB), `cache_size` (64MB), and `temp_store = MEMORY` for faster scans, sorts, and joins; restrict `LIKE` search in table views to text columns (skipping blobs and non-numeric columns when searching text).

### Fixed

- **Flickering pane scrollbars** — WebKitGTK draws native overlay scrollbars, reveals them on any pointer motion over the web view, and ignores the app's scrollbar CSS, so hovering the sidebar also painted the table's bar and the two appeared and vanished together. The table grid and the sidebar now stay unscrollable until the pointer is inside that pane, which is the only way to make the engine claim a bar for the pane in use; overlay bars take no layout space, so toggling one never shifts content. The per-pane `scrollbar-color` override, which WebKitGTK never honoured, is removed.
- **Centered table empty state** — render the `DataTable` "No data" placeholder as a block centered on both axes in the table area. The previous empty-state cell was a flex row, so its content-width child sat pinned to the left edge instead of centered.
- **Empty workspace startup** — return an empty connection array instead of `null` so fresh installs and deleting the last profile do not crash the welcome screen.
- **Query history durations** — round fractional execution times only when saving history to match the Go integer-millisecond binding, preserving precise timings in query results.
- **Closed-table result retention** — evict all cached preview pages for an unmounted table and collect unobserved SQL mutation results without discarding active or pending executions.
- **Dialect-aware query limiting** — update `sql-editor.tsx` to apply T-SQL `OFFSET...FETCH` on SQL Server and Oracle `OFFSET...FETCH` instead of invalid `LIMIT` clauses; strip leading single and multi-line comments so commented queries (`/* ... */`, `-- ...`) are correctly limited without syntax errors.
- **T-SQL pagination with window/comment ORDER BY** — detect only the outermost `ORDER BY` when appending `OFFSET...FETCH` in `sql-editor.tsx`, including clauses with arbitrary whitespace and ignoring occurrences inside window expressions, comments (including nested block comments), string literals, and quoted identifiers (including escaped `]]`) that previously produced invalid T-SQL.
- **ClickHouse search escaping & fail-closed probe** — escape backslashes before quotes in Table View search literals (ClickHouse treats backslash as the escape character) and return an error instead of running the query unfiltered when the search-column metadata probe fails.
- **AI schema cache scoping** — read schema context back under the key it was written with: a table-scoped chat reuses its table-keyed cache entry instead of being shadowed by a connection-level entry, and full-schema fallbacks cache at connection scope.
- **Tab bar action button visibility** — pin tab bar action buttons (`New Aggregation`, `New Query`, `Schema Graph`, `Federated Query`) to a fixed right-side container so they remain accessible when opening many tabs.
- **Connection tooltip click blocking** — add `pointer-events-none` to connection tooltips so hover cards never intercept clicks on the `...` action menu.
- **CodeMirror theme switching** — dynamically toggle CodeMirror between native light styling and `oneDark` using a `Compartment` to respect light/dark mode.
- **Legacy engine profile cleanup** — export dropped `tigerbeetle` and `qdrant` profiles to a `removed-profiles-*.json` file beside the metadata database, then purge them during metadata migration and filter them in the sidebar with `ALL_KINDS`.
- **SQL query cancellation** — wire `api.cancelQuery` to Escape key press, toolbar Cancel button, and tab unmount cleanup so long-running queries can be aborted on demand and do not outlive closed tabs.
- **Query tab connection visibility** — display target database name and color badge in the query editor toolbar and tab bar to avoid running queries against the wrong database.
- **Table virtualization offset** — pass `scrollMargin` to `useVirtualizer` in `DataTable` and compute dynamic index column width to prevent offset calculation bugs and cell text clipping on deep offsets.
- **Defensive record field collection** — guard `collectRecordFields` and `useFieldVisibility` against undefined records to prevent runtime navigation crashes.
- **Read-only query screening bypass** — scan SQL once, left to right, under PostgreSQL, MySQL/MariaDB/ClickHouse and SQL Server/SQLite lexing rules instead of stripping comments and strings with a regex chain. A second statement hidden behind a quote or comment marker (for example `SELECT '--'; COMMIT; DELETE ...`) is now rejected for AI auto-run, MCP and full CSV export. PostgreSQL CSV export also uses the extended protocol, so the database itself refuses multi-statement text inside its read-only transaction.
- **Redis stats** — parse `INFO` output by section header; the previous lookahead regex panicked, so Redis statistics could never load.
- **MySQL/MariaDB over MCP** — apply the per-query timeout when each connection opens instead of holding a dedicated connection around the open result, which made every MCP query on MySQL/MariaDB hang until it timed out.
- **PostgreSQL managed MCP accounts** — run account setup and removal statements with `Exec` so each result is closed. Provisioning no longer fails with `conn busy` and leaves an unremovable login role behind.
- **Stable pages when sorting by a repeated value** — append the table's primary key to the sort order for offset paging on PostgreSQL, SQLite, MySQL/MariaDB, DuckDB, SQL Server and Oracle. Rows that share a sort value no longer repeat or disappear between pages (a 3,000-row PostgreSQL check returned a row twice before the fix). Composite keys now order by every key column. ClickHouse is unchanged because its sorting key does not identify a row.
- **Managed MongoDB MCP accounts** — send `createUser` and `connectionStatus` with the command name as the first field. A random key order made account creation fail intermittently, and the cleanup then reported a partial account that needed manual recovery.
- **MCP connection reuse** — concurrent first calls to one connection share a single adapter instead of each opening one, and a connection whose credential or profile changed mid-call is closed instead of leaking an open pool. The call is refused with `BUSY` so a retry uses the new settings.
- **Redis raw commands** — use RESP2 so replies such as `HGETALL`, `CONFIG GET` and `XINFO` can be returned to the UI; go-redis' default RESP3 maps could not be serialized.
- **MongoDB key order in sorts, pipelines and commands** — send aggregation pipelines, Find sorts and raw commands to the backend as JSON text and parse them in order. They were decoded into Go maps, which lost the key order: a compound `$sort` reached the server in a random order (a three-key sort came out as typed only about 75% of the time), a Find sort was silently re-sorted alphabetically, and a command could lose its name-first position or the key order of a compound index. Empty arrays such as `{"$in": []}` stay empty arrays. The previous object fields remain accepted for older callers.
- **PostgreSQL Table Stats** — compute bloat from dead tuples against the heap size instead of counting index and TOAST bytes as bloat, so a freshly vacuumed table no longer reports bloat and suggests `VACUUM FULL`; the index list loads again after adding the missing `pg_am` join that made every table show "0 indexes".
- **Table View export menu** — render whole-table CSV export as a proper dropdown item instead of a nested native button, keeping the menu open so Cancel stays reachable while the export runs.
- **MongoDB page footers** — show the exact document count when the server reported one and "N+ documents" while more may follow; without a known total the page box becomes a plain current-page label and page jumps cannot exceed the known page count.
- **Displayed-row exports** — save CSV/JSON/SQL through the native save dialog and a backend write in the table view, query editor, and MongoDB panels; the previous blob download was silently ignored by WebKitGTK, so the menu actions did nothing.
- **Scrollbar styling on Linux** — style scrollbars with the standard `scrollbar-width`/`scrollbar-color` properties, which WebKitGTK does honour, instead of only `::-webkit-scrollbar`, which it ignores. The thumb uses the muted foreground because the previous border token is white-at-10% in the dark theme and left only the native hairline edge visible. The bars keep WebKitGTK's overlay behaviour and fade out once scrolling stops.
- **Scrollbar over the table header** — move the pinned header row out of the table's scrollport, so its bar hangs on the body rows instead of spanning the header. Horizontal scrolling and column resizing stay in sync with the header.
- **Sidebar scrollbar** — show the connection tree's scrollbar again instead of hiding it outright.
- **Tab bar scrollbar** — show the tab strip's scrollbar again instead of hiding it, so tabs that overflow the strip have a visible affordance.
- **MongoDB document list** — give list mode a scroll container and keep the pagination footer in place; long results and the footer were clipped before, with no way to scroll.
- **Table scroll smoothness** — run the Linux webview with GPU acceleration and zero-copy DMA-BUF frame transport (Wails defaults Linux to software rendering, wails#2977) and drop the sticky table header's backdrop blur; result pages up to 200 rows also render in one pass, so scrolling no longer re-renders the table on every frame.
- **Export menu wording** — "Displayed rows as CSV" is now "Export as CSV", the whole-table export sits below a separator and reads "Export whole table as CSV", and "Copy JSON" reads "Copy as JSON".
- **Welcome screen tiles** — remove the hardcoded emerald and red glow shadows; connected and disconnected tiles now use the success and destructive tokens with flat borders.

### Removed

- **Qdrant and TigerBeetle** — drop the vector and ledger engines and their dedicated explorers; supported engines are PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, ClickHouse, DuckDB, MongoDB, and Redis.

---

## [v1.6.2] — 2026-10-11

### Added

- **MCP call history** — view recent MCP tool inputs and call summaries in the MCP Settings Logs tab, with recording enabled by default and a settings toggle; returned database rows and documents are not stored.

### Fixed

- **Sidecar wake recovery** — recheck the local sidecar when the app returns to the foreground or the network reconnects, restart it if its child exited, and refresh workspace caches when the process changes.

---

## [v1.6.1] — 2026-10-04

### Changed

- **MCP managed credentials** — encrypt generated read-only account credentials in local SQLite-backed storage, so saved MCP accounts restore across macOS, Windows, and Linux without OS Keychain access. Existing Keychain-backed accounts must be revoked and recreated.

---

## [v1.6.0] — 2026-10-01

### Added

- **Read-only MCP server** — expose selected database profiles to Codex, Claude Code, Devin CLI, and OpenCode over a local authenticated endpoint. KamehaDB provisions a dedicated read-only database account and stores its credential in the OS Keychain.

### Changed

- **API Settings tabs** — move MCP setup into its own tab beside AI provider settings.

### Fixed

- **MCP listener lifecycle** — serialize sidecar startup, retries, and port changes, and stop the listener with the desktop app to prevent races and orphaned processes.
- **MCP query safety and compatibility** — enforce engine timeouts and selected database scope, preserve result column order, keep credentials out of profile responses, and refresh the OpenCode config snippet.
- **Managed account recovery** — make credential hydration, database grant revocation, and Keychain cleanup recoverable without removing grants the app does not manage.
- **Packaged app startup** — allow sidecar health checks from the Tauri WebView and bundle Monaco so the editor does not depend on CDN assets blocked by the app's content security policy.

---

## [v1.5.1] — 2026-09-01

### Added

- **Query tab rename** — rename query tabs from their right-click context menu.
- **JSON copy actions** — add JSON copy buttons to SQL results and the MongoDB footer, and remove the redundant MongoDB header dropdown.

### Fixed

- **Clipboard copy feedback** — JSON copy actions now show success only after the clipboard write completes and report failures when clipboard access is unavailable.
- **Workspace query tab colors** — query tabs now use the same connection badge color as the sidebar.

---

## [v1.5.0] — 2026-08-12

### Added

- **Tab context menu** — right-click workspace tabs to close, pin, or duplicate; pinned tabs persist across reloads.
- **Table view editing** — double-click cells to edit inline, toggle between view and edit modes.
- **Landing dashboard milestone** — interactive engine matrix, read-only schema graph demo, and animated hero canvas.
- **AI chat** — active provider shown in the chat panel header; providers with sufficient config auto-enable.

### Changed

- **Desktop UI consistency overhaul** — unified explorer toolbars, structured vector filters, nested JSON rendering, accessible loading/error states, semantic vector-map colors, and notification styling.
- **Vector search UI unification** — shared input heights and states across pgvector/Qdrant/sqlite-vec, migrated Qdrant map to VectorMap3D.
- **Design token foundation** — status colors, shadow tokens, and shared component patterns (EmptyState, LoadingState, ErrorState, ExplorerToolbar, FilterBar).
- **AI chat performance** — optimized re-renders with useMemo/useCallback and cached color conversions in 3D vector map.

### Fixed

- **Sidecar authentication** — packaged sidecar requires a per-session token, CSP enforced, and SQL table-sort identifiers validated against schema metadata.
- **Query safety** — strip SQL comments and string literals before destructive-keyword checks, block SELECT INTO, prevent semicolon-separated batch execution, and stop auto-running AI-generated writes.
- **SAST security fixes** — SQL injection via string concatenation, NoSQL injection, and file inclusion attack.
- **Health check SSE leak** — evict timed-out probes and support immediate abort on SSE cancel.
- **MongoDB autocomplete** — limit concurrent collection sampling to 8 queries to prevent connection overload.
- **Foreign key resolution** — improved resolution logic for schema graph and AI schema context.
- **Chat hook reset** — atomically clear messages and ref on connection switch.
- **Dollar-quoted strings** — ensure delimiters match in SQL safety checks to prevent false positives.

---

## [v1.4.7] — 2026-07-09

### Fixed

- **Windows sidecar startup (EISDIR)** — use `current_dir` + relative `index.js` instead of absolute path with drive letter, avoiding Node.js `realpathSync` bug that caused `EISDIR: illegal operation on a directory, lstat 'C:'`.
- **Linux sidecar startup** — skip `MAX_SUPPORTED_NODE_MAJOR` check when bundled node ABI matches; ensure bundled node binary is executable (`chmod 0o755`).
- **pnpm v10 compatibility** — added `force-legacy-deploy=true` to `.npmrc` so `pnpm deploy` works without `--legacy` flag.
- **Node 24 compatibility** — `rmSync` now uses `recursive: true` for symlink-to-directory removal; `prebuild-install` failure is non-fatal.
- **Max supported Node.js** — raised from 22 to 24 for dev fallback.

### Fixed

- **Sidecar "Connection refused" on launch** — the bundled Node.js runtime was rejected by a hardcoded `MAX_SUPPORTED_NODE_MAJOR = 22` check even when the ABI matched, preventing the sidecar from starting on any build using Node 23+. The major-version gate now only applies when the `node-abi.txt` ABI check is unavailable (sanity floor at 24); the ABI check remains the real compatibility gate. Affects all platforms (Linux, macOS, Windows).
- **`tauri build` failure on pnpm v10** — restored the `--legacy` flag on `pnpm deploy` in the bundle script. pnpm v10 rejects `deploy` from workspaces without `inject-workspace-packages=true` or `--legacy`; removing it (v1.4.3) broke CI and local builds on pnpm 10+.
- **`better-sqlite3` native binding for new Node ABIs** — `prebuild-install` now falls back to `node-gyp rebuild --release` when no prebuilt binary exists for the current Node.js ABI (e.g. Node 25). Uses `shell: true` so Windows resolves `node-gyp.cmd` automatically.
- **Sidecar root resolution for ad-hoc binary installs** — `resolve_sidecar_root` now falls back to searching relative to the running executable when Tauri's `resource_dir()` is unavailable, fixing sidecar startup for binary copies outside a bundle layout (e.g. `~/.local/bin/kamehadb`).

---

## [v1.4.6] — 2026-07-06

### Fixed

- **PostgreSQL SSL connections** — added SSL toggle to connection dialog and fixed `ssl` flag not being passed through connection test and health check endpoints.

---

## [v1.4.5] — 2026-07-03

### Fixed

- **Windows sidecar startup** — bundled Node.js binary now resolves with `.exe` extension on Windows, and sidecar path uses forward slashes to prevent `realpathSync` truncation.

---

## [v1.4.4] — 2026-07-03

### Fixed

- **Linux release bundles** — temporarily disabled AppImage packaging in CI while `linuxdeploy` is unreliable; Linux releases still publish `.deb` and `.rpm`. Issue tracked in [#14796](https://github.com/tauri-apps/tauri/issues/14796).

---

## [v1.4.3] — 2026-07-03

### Fixed

- **pnpm deploy compatibility** — removed unsupported `--legacy` flag from `pnpm deploy` in bundle script, fixing CI builds on pnpm 9+.
- **Windows bundle script** — `pnpm deploy` now runs with `shell: true` on Windows so `pnpm.cmd` resolves correctly.
- **Linux release bundles** — temporarily disabled AppImage packaging in CI while `linuxdeploy` is unreliable; Linux releases still publish `.deb` and `.rpm`.

---

## [v1.4.0] — 2026-07-03

### Added

- **DeepSeek AI provider** — direct DeepSeek API access for DeepSeek-V3 (`deepseek-chat`) and DeepSeek-R1 (`deepseek-reasoner`) models via OpenAI-compatible endpoint.
- **Gemini AI provider** — Google AI Studio API access for Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`, etc.) via OpenAI-compatible endpoint.
- **Bundled sidecar** — sidecar `dist/`, production `node_modules/`, and Node.js runtime are bundled into the Tauri app. The sidecar auto-starts on launch and is cleaned up on exit — no manual `pnpm dev:sidecar` needed.
- **Shared package build** — `@kamehadb/shared` compiles to JS so the sidecar resolves it at runtime.
- **Sidecar loading screen** — spinner while the sidecar starts, with an error screen if Node.js is missing or startup fails.

### Fixed

- **Sidecar port detection** — `start_sidecar` reads the runtime port from stdout instead of hardcoding 3170; Tauri allocates a concrete port before spawning instead of `PORT=0`.
- **Packaged sidecar stability** — stdout/stderr are drained after port detection, pnpm symlinks are materialized before bundling, and stale sidecar handles are discarded before restart.
- **Frontend query gating** — TanStack Query waits for the sidecar to be ready before firing requests, preventing "Load failed" errors on app launch.
- **Landing Engine Matrix** — the landing page now includes an interactive engine matrix section with 12 engine cards. Each card shows a type badge (SQL / document / cache / vector / ledger), a supported-features checklist, and a one-click "Try in Docker" snippet with copy-to-clipboard. A filter row lets visitors filter engines by type. Engine data is vendored from `packages/shared` (landing is not in the pnpm workspace) and documented as a manual-sync copy.
- **Landing Schema Graph Demo** — the landing page now embeds an interactive read-only ER diagram (ReactFlow + dagre) that loads instantly from bundled static sample data (5-table e-commerce schema). Nodes are draggable but edges cannot be created — a read-only demo of the desktop app's schema visualization feature.
- **Screenshot Refresh CI** — a new GitHub Actions workflow (`.github/workflows/screenshot-refresh.yml`) runs a Playwright-based capture script (`landing/scripts/capture-images.mjs`) on every release tag (`v*`), refreshing the AI Compare panel screenshots in `landing/public/images/` and committing them back to the repo.
- **Slow-Query Insights** — the query history panel now has a "Slow queries" tab showing the top-10 query patterns by p95 duration. Queries are grouped by a normalized pattern (literals stripped, `IN`-lists collapsed) so semantically equivalent queries with different bind values share a hotspot. Each slow-query row exposes "Suggest index" and "Explain" buttons that pre-seed the AI chat panel (reusing the Phase 4 `pendingAiPrompt` flow) with the normalized pattern, a raw query sample, the p95, and the call count. Normalization and p95 live in a new testable `apps/desktop/src/lib/query-normalize.ts` module (15 vitest cases).
- **AI Chat Schema-Tree Actions** — right-click a table in the schema tree to trigger AI actions: "Explain this schema", "Generate test data", and "Suggest index". Each action opens the AI chat panel with a pre-seeded prompt scoped to the right-clicked table. The sidecar builds table-scoped DDL (via `buildTableSchemaContext`) instead of full-schema DDL for token-efficient, focused AI responses.
- **MCP server** — v1.4.

## [v1.3.4] — 2026-06-28

### Changed

- **Sidecar SQL routes** — split `sql.ts` (975 lines) into focused sub-routers: `sql-vector-pg.ts` for pgvector routes and `sql-vector-sqlite.ts` for sqlite-vec routes, matching the existing `sql-schema.ts` pattern.
- **Shared filter parser** — extracted duplicated filter parsing logic from `postgres-vector-sql.ts` and `sqlite-vector-sql.ts` into `filter-parser.ts`, leaving only engine-specific SQL generation (`$N` vs `?`, `t.` prefix) in each file.

### Fixed

- **TigerBeetle limit validation** — `safeLimit()` helper rejects non-numeric, NaN, zero, and negative values, falling back to default 100 (capped at 1000). Applied to both `/accounts` and `/transfers/:accountId` routes.
- **Redis password propagation** — `getAdapter` now fetches the saved password from `metadataStore.getProfilePassword()` instead of always passing `undefined` to `createRedisDbAdapter`.
- **pgvector sample validation** — `/vectors/sample` now validates table/column existence and vector type before querying, matching the search endpoint's validation.
- **pgvector composite PK** — primary-key selection uses `ctid` fallback for composite primary keys instead of taking only the first column (which is not unique).
- **sqlite-vec sample validation** — both `/sqlite-vec/sample` and `/sqlite-vec/vectors/sample` now validate vec0 table and column existence via shared `validateVec0Table()` helper before querying.
- **sqlite-vec vec0 detection** — replaced fragile `includes('vec0')` substring match with case-insensitive `USING vec0(` regex, preventing false positives/negatives.
- **sqlite-vec column escaping** — `selectCols` now uses `quoteSqlIdentifier()` instead of raw `"${n}"` interpolation.
- **sqlite-vec rowid in search** — `SELECT *` replaced with `SELECT rowid, *` so `SqliteVecSearchHit.id` is always populated.
- **sqlite-vec ILIKE support** — `ILIKE` operator translated to `LIKE ... COLLATE NOCASE` for SQLite compatibility.
- **ClickHouse escaping** — `getTableColumns()` and `getCompletions()` now use `escapeClickHouseVal()` instead of raw string interpolation, matching other catalog queries.
- **MongoDB table cell editing** — `editCell` stores document `_id` instead of row index, preventing wrong-document saves after sorting or refetching.
- **MongoDB field edit guard** — `docId` check changed from falsy (`!docId`) to explicit `null/undefined` check, allowing valid falsy `_id` values (`0`, `false`).
- **MongoDB update matchedCount** — `saveFieldEdit` now checks `result.matchedCount` before calling `onUpdate()`, returning `false` when no document was matched.
- **TanStack Query error logging** — unhandled `QueryCache` and `MutationCache` errors now log to the frontend Logs page via `appendFrontendLog`.
- **MutationCache.onError signature** — fixed parameter order to match TanStack Query v5 (`error, variables, onMutateResult, mutation`), so `mutation.meta` is correctly accessible.

## [v1.3.3] — 2026-06-25

### Added

- **Logs page controls** — clear frontend, Tauri, and sidecar logs directly from the desktop app.

### Fixed

- **MySQL/MariaDB connection validation** — password is now required for MySQL, MariaDB, SQL Server, and Oracle (previously only PostgreSQL was checked).
- **MongoDB default port** — corrected to 27017 so auto-generated connection defaults are valid.
- **Connection URL parsing** — supports protocol aliases like `postgresql://`, `rediss://`, `mongodb+srv://`, and `mssql://`.
- **Username validation** — no longer blocks connection tests for databases that don't need an explicit username.
- **Frontend crash handling** — runtime failures are captured in the app logs and now fall back to an in-app recovery screen instead of failing silently.
- **UI consistency** — buttons, inputs, and textareas now use Shadcn components throughout the desktop app.

### Changed

- **Logs pipeline** — efficient file tailing, no more self-generated poll errors, and sidecar HTTP access logs included.
- **Log security** — deeper secret redaction, sanitized paths, and resilient error normalization in logged output.
- **Linting setup** — shared ESLint rules and package-local hooks/configs now keep desktop and sidecar checks aligned.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.3.2] — 2026-06-23

### Added

- **sqlite-vec 3D vector map** — PCA projection of up to 500 vectors with Three.js scatter plot, hover tooltips, click-to-search, and camera persistence.
- **sqlite-vec bulk sample endpoint** (`/sqlite-vec/sample-bulk`) — discovers vec0 columns and returns vectors with metadata payloads.
- **sqlite-vec structured filter builder** — column/operator/value dropdowns from vec0 metadata, replacing raw SQL filter input.
- **"Map" button** in sqlite-vec search toolbar to open 3D visualization without running a search.
- **Thin scrollbar styling** across all table scroll containers.

### Fixed

- **SQLite "Failed to load sizes"** — vec0 virtual tables filtered from `getDatabaseSizes()` and `searchSchema()`.
- **Table hover color** on prefix/suffix cells — `bg-inherit` for uniform hover.
- **Table scrollbar overlap** — removed redundant `overflow-x-auto` from DataTable inner container.
- **Table rows stretching** with few records — `max-h-full` to shrink to content.
- **Long values breaking layout** — cells truncate with ellipsis and `title` tooltips.
- **Tab bar scrollbar visibility** — hidden while preserving scroll.

### Changed

- **MongoDB cell editing simplified** — inline Input with Enter/Esc/blur, no Save/Cancel buttons.
- **Removed dead "Vector / Raw SQL" toggle** from pgvector and sqlite-vec search UIs.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.3.1] — 2026-06-23

### Fixed

- **Table view in-cell editing** — disable editing for views and show an informational banner when no primary key is present to prevent ambiguous row updates.
- **SQL editor** — trim trailing semicolons before appending LIMIT clause to SQL queries

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen

## [v1.3.0] — 2026-06-21

### Added

- **Schema timeline + diff + migration assistant** — capture schema snapshots on demand, compare two states with per-table change cards, and generate migration SQL from the selected snapshots.
- **PostgreSQL pgvector workflows** — detect vector columns and indexes, run guided vector search, inspect nearest-neighbor results, and open a PCA-based vector map with camera state persistence.
- **Embedded mongosh terminal** — open an interactive MongoDB shell inside the desktop app with PTY support, ANSI colors, resize handling, and session persistence across tab switches. Auto-installs `mongosh` into the app data dir when missing locally.
- **Embedded PostgreSQL PSQL terminal** — open a local `psql` session for any PostgreSQL connection directly inside the desktop app.
- **PostgreSQL backup & restore** — run local `pg_dump`, `pg_restore`, and `psql` workflows from the app with streamed job output.
- **In-app Logs viewer** — unified view for frontend, Tauri, and sidecar logs with source/level filtering, search, and copy support. Frontend errors are forwarded to the Tauri log store; sidecar logs are persisted to `${KAMEHADB_DATA_DIR}/logs/sidecar.log` via pino multistream.

### Changed

- **App.tsx refactor** — extracted `TabBar`, `Workspace`, `WelcomePage`, and `MainLayout` into dedicated modules; added `LogsPage` view and frontend error forwarding.
- **Sidecar logger** — replaced `pino-pretty` with `pino.multistream` for dual stdout + file output.
- Table action columns in the row browser, Mongo document table, and Qdrant points table now pin to the left edge and stay visible during horizontal scroll.

### Fixed

- **Duplicate `MainLayout` declaration** — Vite pre-transform error caused by both importing and declaring `MainLayout` in `App.tsx`; local copy removed.
- **Mongosh `posix_spawnp` failure** — when `mongosh` is not on PATH, the sidecar now falls back to running the bundled `mongosh.js` via `node` instead of trying to spawn a non-existent binary.
- **PSQL binary resolution** — `psql` now resolved via `resolve_postgres_program` instead of hardcoded `"psql"`, matching the backup/restore tool pattern.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.2.0] — 2026-06-12

### Added

- **Query history performance panel** — history grouped by normalized query pattern with duration, favorites filter, and text search.
- **Copy result table as snapshot** — "Copy table" button copies result grid as tab-separated text to clipboard.
- **Global search palette (`Ctrl+K`)** — fuzzy-search across connections, schema tables/columns, open tabs, and quick actions.
- **Connection health badges** — status dot shows connected/slow/reconnecting/offline with latency tooltip.
- **Time-aware welcome screen** — greetings by time of day with returning-visitor rotation.
- **Pin connections to top** — "Pin to top"/"Unpin" in connection dropdown, stored in localStorage.
- **Workspace tabs memory** — open tabs and active tab saved and restored on reload.
- **Sidebar database icons** — engine-specific icons for all supported databases.
- **New adapters** — DuckDB, TigerBeetle, SQL Server, Oracle, ClickHouse.
- **Qdrant v1.13.6 integration** — vector DB added to docker-compose, persistent volume.
- AI schema context uses Qdrant vector search instead of full schema injection.
- AI chat streaming via `@tanstack/ai` — SSE streaming with stop/cancel support.
- Server-side schema search for PostgreSQL, MySQL, SQLite using LIKE queries.
- UI overhaul with shadcn components and table grid system.
- v1.2 MCP server added.

### Changed

- SQL Server, Oracle, ClickHouse adapters refined and standardized.
- Data tables: horizontal scrolling, field visibility, resizable columns, row actions.
- AI provider settings switched to single active-provider model.
- Project license changed from MIT → Apache-2.0.

### Fixed

- Fixed field visibility so newly discovered SQL and Mongo fields remain visible unless explicitly hidden.
- Fixed JSON record rendering, AI chat code-language highlighting, and concurrent streams.
- Fixed stale Redis key lists and TigerBeetle views after mutations.
- Fixed SQL editor incorrectly blocking writes after read-only mode was disabled.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.1.0] — 2026-06-04

### Added

- **Qdrant v1.13.6** integration with Docker compose, persistent volume, and `QdrantSchemaStore` for semantic schema retrieval.
- **AI chat streaming** via `@tanstack/ai` with SSE events and stop/cancel support.
- **Smart term expansion** — canonical expansions for countries, states, currencies, languages.
- **Configurable row limit** dropdown (10–500 rows).
- **Read-only toggle** and **custom color picker** in connection dialog.

### Fixed

- SQL editor ignored read-only setting — redundant client-side check removed.
- Multiple Qdrant stability fixes (stale filters, collection load errors, named vectors, page jumps, connection refresh).
- MySQL `getActiveConnections` contract violations and Qdrant serialization issues.
- AI streaming and schema search edge cases.

### Changed

- `useSchemaSearch` explicit return type, `Switch` component prop interface cleanup.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [v1.0.0] — 2026-06-01

First stable release of KamehaDB — a local-first database GUI for PostgreSQL, MySQL, SQLite, MongoDB, and Redis.

### Highlights

- **AI Chat** — schema-aware assistant with persistent history, multi-provider support, markdown rendering, token tracking, and a Run button to execute SQL from the editor.
- **Landing page v2** — demo video, dark mode, motion animations, SEO, and a dedicated documentation site.
- **SQLite & MySQL parity** — table search, file picker, Browse button, and full database stats matching Postgres.
- **MongoDB & Redis UX** — collection filtering, debounced queries, copy actions, and improved navigation.

### Added

- **Qdrant** — vector DB browsing, three search modes, payload filtering, visual filter builder, 3D vector map with PCA projection.
- **AI Chat** — persistent history, markdown rendering, token tracking, schema caching, Run button for SQL execution.
- **Database Support** — SQLite file selection, MySQL database stats, search filtering.
- **UI & Site** — landing page v2, changelog page, SEO metadata, sidebar quick actions, theme toggle, SQL autocomplete, schema graph visualization.
- Test infrastructure with Vitest and code quality tooling (Husky, Prettier, Commitlint).

### Fixed

- Dark/light mode toggle, landing page responsive layout, SQLite connection test, duplicate auto-run effect, existing table tab switching, chat message timestamp migration.

### Contributors

- [@asta-nguyen](https://github.com/asta-nguyen) — Asta Nguyen
- [@JoeJoeflyn](https://github.com/JoeJoeflyn) — Tai Nguyen

---

## [0.1.4-beta] — 2026-05-28

### Added

- Database stats quick action to sidebar connection items.

---

## [0.1.3-beta] — 2026-05-28

### Changed

- Updated desktop app branding with new logo and title capitalization.

### Fixed

- Release workflow to handle nested artifact directories.

---

## [0.1.0-beta.1] — 2026-05-28

### Added

- Graph and database stats quick actions to sidebar.
- MongoDB improvements, sidebar state persistence, and code cleanup.
- UI component improvements and bug fixes.
- Static documentation site with landing page, getting started guide, features, and FAQ.

### Fixed

- Release workflow refactored to use artifact upload strategy.

---

## [0.1.0-rc.1] — 2026-05-26

### Added

- AI chat assistant with multi-provider support and API settings management.
- SQL autocomplete with context-aware suggestions for tables, columns, functions, and keywords.
- Interactive schema graph visualization with dagre layout and ReactFlow.
- Connection URL parsing, pagination, and row detail viewer with JSON export.
- Connection editing, deletion, and improved error handling.
- Database and table analytics: size explorer, connection monitoring.
- Theme toggle with light / dark / system modes.
- MongoDB: collection filtering, debounced queries, and enhanced UX with copy functionality.
- Custom color badges for connection profiles.
- Test infrastructure with Vitest and comprehensive test coverage.
- Code quality tooling: Husky, Prettier, Commitlint.
- GitHub Actions CI/CD workflows.
- MIT license and comprehensive README.
