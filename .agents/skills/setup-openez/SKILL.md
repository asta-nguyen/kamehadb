---
name: setup-openez
description: Use when a project needs code intelligence (semantic search, graph traversal, caller analysis) and OpenEZ is not yet set up or the index is stale.
---

# Setup OpenEZ

OpenEZ provides MCP tools for semantic code queries, graph traversal, and
memory recall. This skill bootstraps it for a repository.

## Prerequisites

1. **Bun 1.1+** — check with `bun --version`. If missing, ask the user to
   authorize installation before continuing. Do not install silently.
2. **OpenEZ CLI** — check with `openez --version`. If missing, explain that a
   global CLI install is needed and ask the user to authorize it before running:

   ```bash
   npm install -g @openez-graph/cli
   ```

## Process

**Resume after client wiring:** If a previous session completed client wiring, skip
steps 1–4 and go to step 5. Re-index only if the index is missing or stale.

1. **Initialize the workspace index.** Before initialization, ensure
   `.gitignore` contains `.openez/`; append it only when missing and preserve
   existing content. Never untrack an existing `.openez/` path automatically;
   report it to the user instead. If `.openez/` does not exist, run:

   ```bash
   openez init .
   ```

   This creates a `.openez/` directory with derived index data.

2. **Index the repository when needed:**

   ```bash
   openez index .
   ```

   Run this for initial setup or when the index is missing or stale. For large
   repositories, this may take a while. Report progress to the user and check
   the command result: a nonzero exit means indexing failed; do not report the
   index as created. A successful CLI run confirms that command completed, not
   that the MCP query works.

3. **Record in `AGENTS.md`:**

   If `AGENTS.md` exists and does not mention OpenEZ, present the exact section
   below and wait for the user's approval before adding it:

   ```md
   ## Code intelligence

   Locate concepts with OpenEZ `code_query`, approximate filenames with FFF
   fuzzy file find, identifiers or literals with FFF grep (fallback: `rg`),
   and regex with `rg`. Expand callers and callees with OpenEZ `code_context`
   (1–2 hops); confirm string, route, config-key, and case variants with FFF
   multi-pattern grep (fallback: `rg`). Use OpenEZ `code_outline` before
   reading a large file. Search results are navigation; read current source as
   evidence. Query OpenEZ directly with the repository path; if unavailable,
   unindexed, or irrelevant, continue with FFF or `rg` and direct reads.
   ```

   If the user declines, leave `AGENTS.md` unchanged and report that the
   guidance was not added. If `AGENTS.md` does not exist, skip this step;
   `setup-codebase` owns its creation.

4. **Wire the agent client** (optional; ask the user first):

   Read `openez setup --help` to find supported clients. For a supported client,
   get approval before running:

   ```bash
   openez setup <supported-client>
   ```

   If the user's client is not listed, consult that client's official MCP
   configuration documentation (for example, Cursor). Do not invent
   a configuration snippet. Present any documented configuration change for
   approval, then apply the same restart-and-verify procedure below. If no
   supported configuration can be established, report that limitation and
   continue to step 5 without wiring.

   Wiring configures the agent's MCP client to use OpenEZ. The user must restart
   their agent after this step for MCP tools to load. Do not run this without
   approval; it changes agent-specific configuration.

   If the user approves and wiring is applied, stop and tell the user to restart
   the agent. Do not continue to step 5 in this session. Tell the user to invoke
   `setup-openez` again after restarting so the new session can verify the
   connection; an agent cannot restart its own session and continue here. If
   wiring is declined or skipped, continue to step 5 in this session.

5. **Verify the MCP connection:**

   If client wiring was approved and run, verify in a session after restart.
   When OpenEZ MCP tools are available in this session, call `code_query` with a
   simple query (e.g., "entry point" or "main function"). If the query returns
   results, the MCP server is connected and the index is working. If it fails
   or returns nothing:
   - Check that the MCP server is running.
   - Re-index only if the index is missing or stale.
   - If still failing, fall back to direct file reads and `rg`.

   If OpenEZ MCP tools are unavailable in this session, do not call
   `code_query`. If wiring was declined or skipped, report
   that the client connection remains unconfigured. If wiring was approved and
   run, report that the MCP tools did not load after restart. In either case,
   report the MCP index query as `index unverified`. If the CLI indexing command
   succeeded, report that separately as CLI indexing completed; if it failed or
   was not run, report the index as failed or unverified. Continue with direct
   file reads and `rg`.

## When to re-index

- After significant code changes (new files, renamed modules, large diffs)
- When `code_query` returns stale or missing results
- Before `document-wiki` or `read-codebase-context` on a fresh checkout when
  OpenEZ is in use and its index is missing or stale

```bash
openez index .
```

Re-indexing is incremental and safe to run repeatedly, but only re-index when
one of these conditions applies.
