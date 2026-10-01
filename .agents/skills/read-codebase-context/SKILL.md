---
name: read-codebase-context
description: Use when preparing to change or plan code in an unfamiliar repository, or when asked to explain code, trace a flow, find callers, dependencies, or tests, identify affected files, or assess change impact.
---

# Read Codebase Context

Choose search by the question, then read the returned source directly. Current
source code and tests establish facts.

1. If `docs/llm/AGENTS.md` and `docs/llm/INDEX.md` exist, read both and open the
   relevant linked wiki page for the requested behavior or flow. If no relevant
   page exists, state that the wiki has no verified coverage and continue.
2. For a known path, symbol, or exact string, use scoped `rg` (`rg --files` for
   paths). For an approximate filename or repeated path/content searches, use
   FFF MCP (`find_files` / `grep`) when already connected; otherwise use `rg`.
3. For semantic questions or cross-module caller tracing, use OpenEZ MCP when
   connected. Check this workspace with `list_workspaces`, then call
   `code_query` or `code_context` only when its index is ready; use
   `graph_neighbors` to traverse relationships. If OpenEZ is unavailable,
   reports an error, stalls, or returns irrelevant results, continue with FFF
   or `rg` and direct reads instead of retrying it repeatedly.
4. Use OpenEZ only when the task needs semantic or cross-module search and the
   workspace index is healthy. If a stale index can be refreshed with the
   available CLI, refresh it only when that search is needed. If OpenEZ is
   unavailable or unhealthy and direct search cannot establish a required
   relationship, offer `setup-openez` as an optional next step. Never recommend
   setup by repository size, or install/configure search tools silently. Use
   `memory_recall` only for recorded decisions or patterns.
5. Read the entry point, returned implementation(s), direct callers, and
   downstream callees until the source establishes persistence and external
   boundaries. Inspect state changes, storage/external adapters, jobs, events,
   email/notifications, authorization, error paths, and relevant tests. Record
   an impact map:

   ```text
   Entry: <file + symbol>
   Flow: <caller → implementation → dependency>
   State changes: <persistence or "none found">
   External effects: <storage/job/event/email/notification or "none found">
   Change candidates: <files likely to modify>
   Verification: <tests/checks to run>
   ```

6. Never fabricate a file impact list from index results or memory alone.

## Quick reference

| Need                                 | Tool                                     |
| ------------------------------------ | ---------------------------------------- |
| Exact path/text/symbol               | scoped `rg` / `rg --files`               |
| Approximate file or repeated search  | FFF `find_files` / `grep` when connected |
| Semantic code search (healthy index) | OpenEZ `code_query`                      |
| Symbol context (callers/callees)     | `code_context`                           |
| Graph traversal across modules       | `graph_neighbors`                        |
| Past decisions or patterns           | `memory_recall`                          |
| Unavailable or failed search tool    | `rg` + direct file reads                 |

## Red flags

| Thought                                             | Reality                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "I'll skip tracing callers, it's a small change"    | Small changes break callers you did not read.                                                                |
| "The controller is enough context"                  | Trace callees through persistence and external side effects before claiming the flow is understood.          |
| "The index is probably current"                     | Check workspace status and read current source. Refresh before a non-trivial plan when OpenEZ is needed.     |
| "I'll fabricate the impact list from memory"        | Memory is not evidence. Read the actual source.                                                              |
| "OpenEZ is installed, so every search starts there" | Exact searches are simpler with `rg`; use OpenEZ for semantic and graph questions when its index is healthy. |

The local `.openez/` directory is derived index data. Keep it out of source
documentation and version control unless the target repository explicitly
chooses otherwise.
