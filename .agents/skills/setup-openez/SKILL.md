---
name: setup-openez
description: Use when a project needs code intelligence (semantic search, graph traversal, caller analysis) and OpenEZ is not yet set up or the index is stale.
---

# Setup OpenEZ

OpenEZ provides MCP tools for semantic code queries, graph traversal, and
memory recall. This skill bootstraps it for a repository.

## Prerequisites

1. **Bun 1.1+** — OpenEZ requires Bun. Check with `bun --version`. If missing,
   ask the user to authorize installation before continuing. Do not install
   silently.
2. **OpenEZ CLI** — check with `openez --version` or `npx @openez-graph/cli
--version`. If missing, install:

   ```bash
   npm install -g @openez-graph/cli
   ```

## Process

1. **Initialize the workspace index.** Before initialization, ensure
   `.gitignore` contains `.openez/`; append it only when missing and preserve
   existing content. Never untrack an existing `.openez/` path automatically;
   report it to the user instead. `setup-codebase` may already have added the
   rule. Then run:

   ```bash
   openez init .
   ```

   This creates a `.openez/` directory with derived index data.

2. **Index the repository:**

   ```bash
   openez index .
   ```

   For large repositories, this may take a while. Report progress to the user.

3. **Verify the MCP connection:**

   Call `code_query` with a simple query (e.g., "entry point" or "main
   function"). If it returns results, the MCP server is connected and the
   index is working. If it fails or returns nothing:
   - Check that the MCP server is running (restart the agent if needed)
   - Re-run `openez index .`
   - If still failing, fall back to direct file reads and `rg`

4. **Wire the agent client** (optional, ask user first):

   ```bash
   openez setup claude    # or: codex, opencode
   ```

   This configures the agent's MCP client to use OpenEZ. The user must
   restart their agent after this step for MCP tools to load.

   Do not run this without asking — the project's `AGENTS.md` remains the
   instruction source of truth, not agent-specific config.

5. **Record in `AGENTS.md`:**

   If `AGENTS.md` exists and does not mention OpenEZ, add a
   `## Code intelligence` section:

   ```md
   ## Code intelligence

   OpenEZ is indexed for this repository. Prefer MCP tools
   (`code_query`, `code_context`, `graph_neighbors`) for semantic code
   questions. Use `memory_recall` for previously recorded decisions.
   Fall back to direct file reads and `rg` when OpenEZ is unavailable.
   ```

   If `AGENTS.md` does not exist, skip this — `setup-codebase` owns
   `AGENTS.md` creation.

## When to re-index

- After significant code changes (new files, renamed modules, large diffs)
- When `code_query` returns stale or missing results
- Before `document-wiki` or `read-codebase-context` on a fresh checkout

```bash
openez index .
```

Re-indexing is incremental and safe to run repeatedly.

## Red flags

| Thought                                     | Reality                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| "I'll skip the MCP verify step"             | Silent failures mean agent queries nothing and fabricates results.                  |
| "I'll run `openez setup` without asking"    | Overwrites agent config. Always ask first.                                          |
| "The index is probably fine"                | Stale index returns wrong callers. Re-index if unsure.                              |
| "I'll use OpenEZ instead of reading source" | Index accelerates discovery; source establishes facts. Always read the actual code. |
