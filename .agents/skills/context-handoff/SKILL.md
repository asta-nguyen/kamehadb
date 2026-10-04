---
name: context-handoff
description: Use when a coding session is approaching context limits, spans multiple workflow phases, or must pause before the work is complete.
---

# Context Handoff

Create one compact, source-grounded checkpoint so another session can resume
without relying on conversation memory.

## When to use

Use this skill only when the task is unfinished and one of these is true:

- the session is approaching its context limit;
- the work spans multiple phases or will continue in another session; or
- the user asks to pause, hand off, or resume later.

Do not create handoffs for short tasks that are already complete.

## Write the checkpoint

1. Read `AGENTS.md`, then inspect `git status --short`, the relevant diff, the
   active spec/plan `## Decision Log`, any task-linked decision file, and the
   relevant wiki page or test output. Source and fresh command output are
   authoritative; conversation memory is not.
2. Create a handoff at
   `docs/agent-devkit/handoffs/YYYY-MM-DD-<slug>.md`. Follow the shared
   artifact naming rule in `using-devkit` (read it if it is not loaded). Use
   this structure:

   ```md
   # Handoff: <task>

   ## Objective

   <The user-visible outcome still being pursued>

   ## State

   - Phase: <brainstorm | plan | implement | verify | document>
   - Status: <what is complete and what is in progress>

   ## Decisions

   - <D<n> summary and source artifact link, or None>

   ## Evidence

   - `<command>` — <result and exit status>

   ## Changed files

   - `<path>` — <why it changed, or "user change">

   ## Remaining work

   - <smallest next actions, in order>

   ## Risks and blockers

   - <known issue or "None">

   ## Next action

   <The first concrete action for the next session>
   ```

3. Keep the checkpoint factual and short. Do not claim a test, build, link, or
   requirement passes without fresh evidence. Do not copy secrets or full
   logs; record the command and relevant result instead.
4. If `docs/agent-devkit/INDEX.md` exists, add the handoff under a `##
Handoffs` section. Follow the shared process-artifact link and wiki-boundary
   rules in `using-devkit` (read them if they are not loaded). Do not create a
   second index.
5. Run `git diff --check` and read the created checkpoint before stopping.

## Resume

At the start of the next session, `memory_recall` with 1–3 task keywords may
locate a decision or handoff file; pass `maxTokens` when its schema supports
it, and treat memory only as a pointer. Read the newest
relevant handoff and every linked decision source, verify `git status --short`,
re-check claimed source paths and commands, and continue from `## Next action`.
If source or working tree disagrees, trust the current repository and update
the handoff before proceeding.
