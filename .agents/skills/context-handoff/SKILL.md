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
   `docs/agent-devkit/handoffs/YYYY-MM-DD-<issue-id>-<slug>.md` when the task
   has an issue ID, or use the existing `YYYY-MM-DD-<slug>.md` form otherwise.
   Use only an ID stated in the task or present in a linked artifact, including
   its filename; do not rename existing files. Use this structure:

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
Handoffs` section using a relative Markdown link. Do not create a second
   index or add a handoff link to `docs/llm/`.
5. Run `git diff --check` and read the created checkpoint before stopping.

## Resume

At the start of the next session, read the newest relevant handoff first. Then
read every linked decision source, verify `git status --short`, re-check its
claimed source paths and commands, and continue from `## Next action`. If the
source or working tree disagrees, trust the current repository and update the
handoff before proceeding.

## Red flags

| Thought                                 | Reality                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| "The next session will remember this"   | Memory is not a durable project artifact.                               |
| "I'll dump the whole transcript"        | A compact evidence map is easier to resume and less likely to go stale. |
| "The handoff says tests passed"         | Re-run the command; handoffs are navigation, not verification.          |
| "I'll make a checkpoint for every task" | Short completed tasks need no extra artifact.                           |
