---
name: setup-codebase
description: Use when a user asks to set up, initialize, or bootstrap a repository for coding agents, especially when one or more of AGENTS.md, CLAUDE.md, docs/llm/, or repository-specific conventions is missing.
---

# Setup Codebase

Create context with repository-reading, not a static file template. Existing
context belongs to the project: never overwrite or shorten it.

Before step 1, determine whether `document-wiki` is calling this procedure
inline. In inline mode, execute only the `docs/llm/` skeleton portion of step 3,
read back the created wiki files, and return. Do not create or update
`AGENTS.md`, `CLAUDE.md`, or `CONVENTIONS.md`, capture conventions, query
OpenEZ, change `.gitignore`, or execute the remaining setup steps. In direct
mode, run step 4's preflight before step 3 writes anything. This guard must run
before any write.

1. Check the exact status of `AGENTS.md`, `CLAUDE.md`, `CONVENTIONS.md`,
   `docs/llm/`, and `.gitignore`. Read every existing context or conventions
   file before writing anything. If the repository has no application source
   and an approved design exists under `docs/agent-devkit/specs/`, read that
   design before writing context.
2. If context is missing, inspect only enough evidence to ground it: `README*`,
   root/workspace manifests, task scripts, environment examples, CI/config,
   top-level source layout, and any approved design from the previous step. Do
   not install dependencies, start services, or infer facts from filenames
   alone.
3. Write only missing files from that evidence:
   - `AGENTS.md`: concise purpose, relevant layout, verified commands,
     explicit conventions/gotchas, and verification. Omit unknown sections.
     For a source-less new project, the approved design establishes intended
     purpose and planned layout only; do not claim unimplemented behavior or
     commands as verified.
     If a `skills/` or `.agents/skills` folder exists in the repository, add a `## Skills`
     section listing each skill by name with its `SKILL.md` path so every
     agent platform can discover them.
     If `docs/llm/` exists or is created, add a `## Documentation` section:

     ```md
     ## Documentation

     The verified codebase wiki is at `docs/llm/INDEX.md`.

     For behavior, workflow, or domain questions:

     1. Read `docs/llm/INDEX.md`.
     2. Open the relevant wiki page.
     3. Verify important claims against current source and tests.

     The wiki describes verified behavior only; source and tests remain authoritative.
     ```

   - `CLAUDE.md`: a short repository-specific pointer to `AGENTS.md`; include
     extra instructions only when local evidence establishes them.
   - `docs/llm/`: create the wiki skeleton with `AGENTS.md` and `INDEX.md`.
     The generated `AGENTS.md` must match `document-wiki`'s current-source
     verification rules, distinguish verification limits from confirmed
     content gaps, and state that any existing log is legacy, not read or
     written and not used for freshness. Do not create `LOG.md`. If a legacy
     `LOG.md` already exists,
     preserve it byte-for-byte without reading or updating it.
     Create wiki category folders (`architecture/`, `domains/`, `workflows/`,
     `integrations/`, `operations/`, or `decisions/`) only when `document-wiki`
     has a real page to place there; do not add placeholder pages just to
     preserve empty directories.

   Every claim must have a repository source. If evidence is insufficient,
   state an open question instead of inventing a rule.

4. In a direct `setup-codebase` invocation, inspect both `AGENTS.md` and the
   root `CONVENTIONS.md` before deriving anything:
   - First compare both files for populated convention sources. A populated
     conventions section in `AGENTS.md` plus a populated `CONVENTIONS.md` is a
     source-of-truth conflict; report both paths, ask the user how to resolve it,
     and write nothing.
   - Recognize `Read CONVENTIONS.md before editing.` as the exact split-storage
     pointer. A missing pointer target, an empty target, a populated
     `CONVENTIONS.md` without that pointer, or any other existing-file collision
     is a conflict; report the exact paths, ask the user how to resolve it, and
     write nothing.
   - A valid pointer plus a populated `CONVENTIONS.md` is already canonical and
     must be skipped without writing.
   - Otherwise, a heading matching, case-insensitively,
     `convention|working rules|standards|style|guidelines|change shape` whose
     content contains at least one repository-specific rule means conventions
     are already present; report the match and skip capture.
   - If no stored convention is found, read
     `references/convention-capture.md` before capturing conventions after
     evidence gathering.

5. Check whether OpenEZ is available (`openez` command or MCP server). If it is
   available, note it in `AGENTS.md` under a `## Code intelligence` section as
   the optional Locate → Expand → Confirm → Read path below. If `AGENTS.md`
   was created in this run, include the section there. If it already existed,
   present the exact proposed lines and wait for approval before adding them.
   If it is not available, continue without it. Mention optional
   `setup-openez` only when direct search cannot establish a needed semantic or
   cross-module relationship. Do not recommend it by repository size, or
   install or run `openez setup` silently.
   Use this section:

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

6. Keep local Obsidian and OpenEZ state out of Git. Create `.gitignore` when it
   is missing, or append only these missing lines without reordering,
   normalizing, or duplicating existing content:

   ```gitignore
   /docs/.obsidian/
   /docs/Untitled*.md
   /docs/Untitled*.canvas
   .openez/
   ```

   Check whether matching files are already tracked. If they are, report their
   paths; never run `git rm --cached` or otherwise untrack them.

7. Preserve existing context files byte-for-byte. The additive `.gitignore`
   update in step 6 is the only automatic edit to an existing file. A
   `Code intelligence` section may be included in a new `AGENTS.md` created
   during this run or added to an existing one only after user approval. The
   conventions section or `AGENTS.md` pointer from step 4 may also be written
   only after user approval.
   Do not restore files from Git. Read back every created or changed file
   before reporting it.
8. Use standard relative Markdown links for internal wiki links, following the
   shared link rule in `using-devkit`. Use `## Sources` for evidence and
   `## Related` when a related page exists.
   Do not document features here; `document-wiki` owns that.
9. Run `git diff --check`. Report distinct `created`, `updated`, and `kept`
   lists, tracked local artifacts, and the evidence paths used.

## Quick reference

| File                                                                           | When to create                                    | Key content                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `AGENTS.md`                                                                    | Missing                                           | Purpose, layout, commands, conventions, gotchas, skills list, wiki entry point |
| Repository conventions                                                         | Missing repository-specific rules                 | Evidence-backed `## Conventions` in `AGENTS.md` or root `CONVENTIONS.md`       |
| `CLAUDE.md`                                                                    | Missing                                           | Pointer to `AGENTS.md` + repo-specific instructions                            |
| `docs/llm/AGENTS.md`                                                           | Missing                                           | Wiki evidence and maintenance rules                                            |
| `docs/llm/INDEX.md`                                                            | Missing                                           | Navigable entry point                                                          |
| `docs/llm/architecture/overview.md`                                            | `document-wiki` baseline-map output               | Source-grounded repository orientation                                         |
| `docs/llm/{architecture,domains,workflows,integrations,operations,decisions}/` | `document-wiki` has a real page for that category | Evidence-backed wiki categories; never create placeholder folders              |
| `.gitignore`                                                                   | Setup                                             | Add only missing local Obsidian and OpenEZ rules                               |
