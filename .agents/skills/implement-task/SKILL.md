---
name: implement-task
description: Use when the user has approved a bounded change or feature plan and code changes are ready to begin.
---

# Implement Task

## Before coding

Complete steps 3 (approval and lifecycle) and 4 (decisions) before any source
creation or edit, including a new project's bootstrap. Steps 1-2 only gather
context.

1. Read `AGENTS.md` and, when it exists, `docs/llm/INDEX.md` for conventions and
   affected wiki pages; a missing wiki must not block work. If `AGENTS.md`
   contains `Read CONVENTIONS.md before editing.`, read the root `CONVENTIONS.md`
   too. Apply only rules whose scopes match the changed files (most specific
   wins); route same-scope conflicts through user clarification.
2. If application source exists, call the available Skill entry whose local
   name is `read-codebase-context` to trace the relevant code path; understand
   callers, data flow, and error paths before editing. For a source-less project,
   read the design, tasks, and delta without creating source, and state that
   callers and error paths do not exist yet. When the active plan has an
   `## Impact map`, follow `read-codebase-context`'s `## Refresh an impact map`
   (an unusable baseline means tracing from scratch; planned source that does not
   exist yet uses the source-less map rule). Read current source for every
   existing file to edit; for a planned new file, follow the approved design and
   read the source after creating it. The map is navigation, not evidence.
3. Follow the approved `plan-feature` output when one exists. For a change,
   read the change files that exist (`design.md`, `tasks.md`, `delta.md`), and
   read `tasks.md`'s `## Approval Gate` before editing application code when it
   exists; a Bounded or bug-fix change may have only `delta.md`.
   - A `tasks.md` proceeds only with `Status: approved`, which covers
     `design.md`, `tasks.md`, and any `delta.md` together. If it is missing or
     `pending`, stop; `plan-feature` step 9 asks for and records the approval.
   - A legacy plan or an older `tasks.md` with a `Required` gate follows the
     gate rules in `../using-devkit/references/legacy.md`; read it when you meet
     one.

   Apply `using-devkit`'s `## Change lifecycle`: an archived change and a
   completed legacy plan are historical, so route new work through
   `brainstorm-feature`; an open change or plan supplies its remaining tasks.

   Without a plan, require an approved bounded design from `brainstorm-feature`,
   or call it before editing. That approval counts only from the current
   conversation, a `delta.md` `Approved:` line, or a handoff's `Approval:` line; a
   resumed session with none of these re-presents the design through
   `brainstorm-feature`. A clear-small-change notice from `brainstorm-feature`
   satisfies this gate. If implementation uncovers impact outside the user's named
   scope, stop and return to the approval gate.

4. Read `## Decision sources` below; conversation memory is not one. Persist a
   newer user answer through the clarification flow below before using it.
5. After tracing the real flow, apply `## Implementation ladder` below.
6. Follow `using-devkit`'s baseline rule.

## Implementation ladder

Apply in order and stop at the first option that satisfies the approved
behavior; `plan-feature`, `systematic-debugging`, and `review-and-verify` use
this ladder too:

1. Does this need to exist at all? Skip speculative work (YAGNI).
2. Does it already exist in this codebase? Reuse the module, helper, type, or
   pattern.
3. Does the standard library do it? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Only then, write the minimum clear new code that works.

Do not use minimalism to remove explicit requirements, trust-boundary
validation, security, accessibility, or error handling that prevents data loss.

## Decision sources

Read, when they exist: the change's `decisions.md`; `tasks.md`'s
`## Decision Log`; for a legacy plan or spec, its `## Decision Log` and any
task-linked file under `docs/agent-devkit/decisions/` listed in
`docs/agent-devkit/INDEX.md` (legacy, read-only). Skills that must honor
decisions (`review-and-verify`, `context-handoff`) read this same list.

## During implementation

1. With a plan, work through tasks in order, starting at the first task whose
   `Progress` is not `done` (backfill a task with no `Progress` line first, per
   `../using-devkit/references/legacy.md`). After a task's `Verify` check passes,
   set `Progress: done` and `Result: <check> — <outcome>` before the next task. A
   failing task stays `todo`; fix it within scope and rerun the check, under the
   stop rule in "After implementation" step 3. Continue until every task is
   `done`, unless a stop condition applies. For a source-less project, bootstrap
   the first planned entry point as part of its approved task, then read the
   created source before verifying it.
2. Reuse local patterns. Keep the diff focused on one logical change.
3. Make the smallest change that satisfies the task. Do not refactor
   unrelated code.
4. On a bug or unexpected behavior, call the available Skill entry whose local
   name is `systematic-debugging` as a repair handoff; it returns its fix/check
   evidence here, and implementation owns the final review and archive. Do not
   guess-and-check.
5. Run the smallest relevant check after each non-trivial change.
6. Do not commit (`using-devkit`).

## Technical rulings

Resolve a choice without user input only when every viable option preserves the
same observable behavior, fits the approved design, plan, decisions, and
repository contract, and changes no API, schema, dependency, security boundary,
scope, or data-loss risk. It must be non-destructive and reversible within the
task: no migration, data rewrite, external contract change, or caller change
outside it.

Choose with the implementation ladder and report:

```text
Ruling R<n>: <choice and concise repository-grounded reason>.
```

Do not persist a ruling in `## Decision Log`; it changes no approved requirement
and can be re-derived from source. If a condition above fails, an approved
artifact conflicts, or the action is destructive or irreversible, use the
clarification flow below.

## Clarification decisions

When implementation needs a user answer before it can continue:

1. Stop editing and ask one question. After the answer, restate it as
   `Decision D<n>: <one unambiguous sentence>` before taking another action.
2. Keep an implementation-only choice (no change to observable behavior,
   requirement, API, schema, security boundary, or scope) in the session; create
   no artifact for it.
3. Persist every answer that changes observable behavior or an approved
   requirement. For a change, append it to the change's `decisions.md`; when
   the folder does not exist yet (a Bounded or clear-small change with no delta),
   create it and index it per `using-devkit`'s `## Change lifecycle`. For a
   legacy plan or spec, append to its `## Decision Log`; create no new file
   under `docs/agent-devkit/decisions/`.

   Optionally `memory_write` only the decision's title and file path; memory is
   never the only copy. `memory_recall` (1–3 keywords, `maxTokens` when
   supported) may locate decision or handoff files; read them before relying.

   Use this shape:

   ```md
   ### D<n> — <short title>

   Question: <what was unresolved>
   Decision: <the user's answer>
   Impact: <requirements, tasks, interfaces, or tests affected>
   Confirmed by user: YYYY-MM-DD
   ```

4. If the answer materially changes scope, observable behavior, an interface,
   a schema, or risk, stop editing code. For an open `tasks.md` or legacy plan,
   call `plan-feature` as a route handoff to revise it; `plan-feature` records
   the decision log entry, resets the gate to pending, presents the revision,
   and resumes this skill after re-approval. For a change to `design.md` or
   `delta.md`, or when a bounded task expands beyond its approved design, call
   `brainstorm-feature` instead of silently widening scope. A non-material
   answer only needs the decision record from step 3.

## After implementation

1. After code checks pass, assess documentation using approved scope, the diff,
   and traced callers. When `docs/llm/` exists and task behavior is new, changed,
   missing, or stale, call `document-wiki`'s `## Task updates` (it merges any
   delta first and verifies the affected wiki). A missing wiki means skip, not
   setup; unrelated gaps stay optional findings. Resolve in-scope documentation
   blockers before final review, under the stop rules below.
2. Call the available Skill entry whose local name is `review-and-verify` to
   review the diff, run fresh verification, and confirm no stale documentation.
3. If the review result is `Status: fail`, fix the listed blockers that are
   inside the approved scope, run the smallest relevant check, and call the
   available Skill entry whose local name is `review-and-verify` again. Each
   blocker gets at most three fix attempts. Stop and report the remaining
   blockers, without claiming completion, when any of these holds:
   - the same blocker remains after a fix attempt with no new information;
   - three fix attempts for one blocker have failed (the architecture signal in
     `systematic-debugging`); end with `Next: brainstorm-feature` to revisit the
     design;
   - the fix needs a change outside the approved scope; or
   - the fix needs a user decision.
4. When this skill stops before review (a question, pending gate, or scope
   growth), end with the `Next:` block from `using-devkit`, naming the current
   task.

## Red flags

| Thought                           | Reality                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "The user said implement earlier" | An instruction before the approved files existed is not approval; check the gate.                                     |
| "Approval is in the chat history" | Only this conversation, an `Approved:` line, a handoff's `Approval:` line, or `tasks.md`'s `Status: approved` counts. |
| "One more fix attempt"            | Three failed attempts on one blocker end the loop; route to `brainstorm-feature`.                                     |
