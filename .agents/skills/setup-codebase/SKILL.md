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
OpenEZ, change `.gitignore`, or execute the remaining setup steps. This guard
must run before any write.

In direct mode, preflight any existing `AGENTS.md` and root `CONVENTIONS.md`
before step 3 can write missing context. If `CONVENTIONS.md` exists without the
exact pointer, the pointer target is missing or empty, both files contain
populated convention sources, or the existing file is otherwise a collision,
report the paths, ask the user how to resolve it, and return without writing.

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
     preserve it byte-for-byte without reading or updating it. Create
     `architecture/`,
     `workflows/`, or `decisions/` only when `document-wiki` has a real page to
     place there; do not add placeholder pages just to preserve empty directories.

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
   - If no stored convention is found, continue with evidence gathering in this
     fixed order: declared repository configuration, consistently observed code,
     then web or general practice only when neither yields a signal.

   Classify each candidate as declared, observed, or adopted and apply the
   complete admission filter:
   - Keep a declared rule only with an authoritative repository-owned source
     that explicitly requires it, is not a language/framework default, and
     makes deviation violate a repository behavior, tooling contract,
     compatibility requirement, or documented workflow.
   - Keep an observed rule only with at least two consistent in-repository
     evidence paths in scope, no counterexample there, not a language/framework
     default, and a repository behavior, tooling contract, compatibility
     requirement, or documented workflow that deviation would violate.
   - Keep an adopted rule only when the repository has no signal, it is not a
     language/framework default, and the user confirms it as policy with a named
     source and approval date.

   Drop generic advice and any candidate that fails its filter. If an external
   rule conflicts with declared or observed repository behavior, report it as
   rejected with the conflict reason and do not persist or apply it. If no
   candidate passes, report that there is no convention to record.

   For every candidate that passes, present its type, repository-relative scope,
   evidence paths, contradictory examples checked, why it is not a
   language/framework default, and approval status. Present the exact lines
   before writing and wait for explicit user approval. By default append one
   `## Conventions` section to `AGENTS.md`; each declared or observed rule
   includes its scope and evidence path or paths. Write
   `## Adopted conventions (not yet evidenced in code)` only when an adopted
   rule exists, and include its source link and `user-approved YYYY-MM-DD` date.
   Use root `CONVENTIONS.md` only when the proposed rules exceed 40 non-empty
   rule lines (excluding headings and blank lines) or apply per area. In split
   storage, keep exactly one pointer in `AGENTS.md`, put all rules in
   `CONVENTIONS.md`, use repository-relative scopes, and never duplicate a rule.
   When multiple area rules match, the most specific scope wins; a conflict at
   the same scope is reported to the user instead of resolved silently. Create
   or update either file only after approval; preserve all other existing
   content byte-for-byte.

5. Check whether OpenEZ is available (`openez` command or MCP server). If it is
   available, note it in `AGENTS.md` under a `## Code intelligence` section as
   an optional path for semantic or cross-module questions when the workspace
   index is healthy; direct source reads remain authoritative. If it is not
   available, continue without it. Mention optional `setup-openez` only when
   direct search cannot establish a needed semantic or cross-module relationship.
   Do not recommend it by repository size, or install or run `openez setup`
   silently.
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
   update in step 6 is the only automatic edit to an existing file. The
   user-approved conventions section or `AGENTS.md` pointer from step 4 is a
   sanctioned edit; do not make either edit without approval. Do not restore
   files from Git. Read back every created or changed file before reporting it.
8. Use Obsidian wikilinks (`[[path/to/page|Label]]`) for internal wiki links.
   When an ancestor of `docs/llm/` contains `.obsidian/`, targets must be
   relative to that vault root (for example, `[[llm/architecture/overview]]`
   for a `docs/` vault). Use `## Sources` for evidence and `## Related` when a
   related page exists.
   Do not document features here; `document-wiki` owns that.
9. Run `git diff --check`. Report distinct `created`, `updated`, and `kept`
   lists, tracked local artifacts, and the evidence paths used.

## Quick reference

| File                                                                           | When to create                    | Key content                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| `AGENTS.md`                                                                    | Missing                           | Purpose, layout, commands, conventions, gotchas, skills list, wiki entry point |
| Repository conventions                                                         | Missing repository-specific rules | Evidence-backed `## Conventions` in `AGENTS.md` or root `CONVENTIONS.md`       |
| `CLAUDE.md`                                                                    | Missing                           | Pointer to `AGENTS.md` + repo-specific instructions                            |
| `docs/llm/AGENTS.md`                                                           | Missing                           | Wiki evidence and maintenance rules                                            |
| `docs/llm/INDEX.md`                                                            | Missing                           | Navigable entry point                                                          |
| `docs/llm/architecture/overview.md`                                            | Baseline map                      | Source-grounded repository orientation                                         |
| `docs/llm/{architecture,domains,workflows,integrations,operations,decisions}/` | A real page needs the folder      | Evidence-backed wiki categories; create only when needed                       |
| `.gitignore`                                                                   | Setup                             | Add only missing local Obsidian and OpenEZ rules                               |

## Red flags

| Thought                                          | Reality                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| "I'll use a generic template to save time"       | Generic templates miss project-specific conventions. Read the repo.                                                          |
| "I'll overwrite this section, it looks outdated" | Existing context belongs to the project. Never overwrite without asking.                                                     |
| "I can infer this convention from the filename"  | Filenames are not evidence. Read the source.                                                                                 |
| "I'll record a generic best practice"            | Keep only declared or observed rules; otherwise require a named source and explicit user approval under the adopted section. |
| "I'll edit AGENTS.md during capture"             | Present the exact lines first and wait for approval; preserve all other content byte-for-byte.                               |
| "I'll skip reading back the file I just created" | Read back every created file before reporting.                                                                               |
| "I'll add features to AGENTS.md"                 | `document-wiki` owns features. `AGENTS.md` is conventions only.                                                              |
| "I'll untrack existing local artifacts"          | Ignore rules are additive only. Report tracked files and leave Git ownership to the user.                                    |

Prompt contract:

```text
Inspect repository evidence. Before any write, detect whether `document-wiki`
called this procedure inline. In inline mode create only the missing `docs/llm/`
wiki skeleton, read it back, and return. In direct mode, inspect `AGENTS.md` and
root `CONVENTIONS.md`, detect the exact split pointer and existing populated
sources, skip valid canonical storage, and report broken or conflicting storage
without writing. For missing conventions, gather declared configuration, then
repeated code, then web only when neither yields a signal. Classify candidates,
apply the admission filter, show evidence and exact proposed lines, and wait for
user approval. Use one source of truth, `AGENTS.md` by default, and root
`CONVENTIONS.md` only for more than 40 non-empty rule lines or area scopes. If a
skills/ folder exists, list all skills in AGENTS.md. If docs/llm/ exists or is
created, add its INDEX.md as the wiki entry point and require wiki-first
behavior questions. When a source-less project has an approved design, use it
only for intended purpose and planned layout. If OpenEZ is available, note it in
AGENTS.md. Add missing local Obsidian and OpenEZ rules to .gitignore without
untracking files. Report created, updated, kept, tracked artifacts, evidence,
and git diff --check.
```
