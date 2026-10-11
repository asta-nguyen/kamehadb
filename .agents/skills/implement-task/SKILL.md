---
name: implement-task
description: Use when the user has approved a bounded change or feature plan and code changes are ready to begin.
---

# Implement Task

## Before coding

Complete the approval/lifecycle check in step 3 and read decisions in step 4
before any source creation or edit, including a new project's bootstrap.
Steps 1-2 gather context only.

1. Read `AGENTS.md` and, when it exists, `docs/llm/INDEX.md` for project
   conventions and affected wiki pages. A missing wiki must not block work.
   If `AGENTS.md` contains `Read CONVENTIONS.md before editing.`, read the
   root `CONVENTIONS.md` too. Apply only rules whose scopes match the changed
   files, with the most specific matching scope winning; route same-scope
   conflicts through user clarification.
2. If application source exists, call the available Skill entry whose local
   name is `read-codebase-context` to trace the relevant code path.
   Understand callers, data flow, and error paths before editing. For a
   source-less new project, read the
   design, tasks, and delta without creating source yet;
   state that callers and existing error paths do not exist yet.
   When the active plan has an `## Impact map`, follow the map-refresh rule in
   `read-codebase-context`: validate `Verified at`, inspect tracked and
   untracked paths since that commit, re-trace changed existing paths, and
   confirm every mapped entry-point and implementation symbol across the
   current repository. If the baseline is missing, unavailable, or no longer
   an ancestor, trace existing source from scratch; if the planned source does
   not exist yet, use the source-less map rule instead. Read current source for
   every existing file to edit. For a planned new file, follow the approved
   design and read the source after creating it; the map is navigation, not
   evidence.
3. Follow the approved `plan-feature` output when one exists. For a change,
   read the change files that exist (`design.md`, `tasks.md`, `delta.md`), and
   read `tasks.md`'s `## Approval Gate` before editing application code when it
   exists; a Bounded or bug-fix change may have only `delta.md`.
   - A `tasks.md` proceeds only with `Status: approved`, which covers
     `design.md`, `tasks.md`, and any `delta.md` together. Missing or `pending`
     status means stop and ask for the joint approval.
   - An older `tasks.md` or a legacy plan that still has `Required`: with
     `Required: yes` it proceeds only with `Status: approved`; with
     `Required: no` it proceeds with `Status: not-required`.
   - For a legacy plan with no gate, inspect its impact. Public API, data schema,
     dependency, CI, or broad file changes require approval before proceeding.

   Apply the change lifecycle in `using-devkit`: an archived change and a
   completed legacy plan are historical, so route new work through
   `brainstorm-feature`. Use an open change or open legacy plan for its
   remaining tasks. For a legacy plan without `Execution`, inspect completion
   evidence before treating it as active.

   Approval given before the approved files existed does not satisfy a gate.
   Without a plan, require an approved bounded design from `brainstorm-feature`;
   otherwise call `brainstorm-feature` before editing. An
   eligible explicit-change notice from `brainstorm-feature` satisfies this
   bounded-design gate. If implementation uncovers impact outside the user's
   named scope, stop and return to that approval gate before continuing.

4. Read the active plan/spec's `## Decision Log` and any task-linked decision
   file listed in `docs/agent-devkit/INDEX.md`. Conversation memory is not a
   durable decision source. If the current conversation contains a newer user
   answer, persist it through the clarification flow below before using it.
5. After tracing the real flow, apply this implementation ladder in order and
   stop at the first option that satisfies the approved behavior:
   1. Does this need to exist at all? Skip speculative work (YAGNI).
   2. Does it already exist in this codebase? Reuse the module, helper, type, or
      pattern.
   3. Does the standard library do it? Use it.
   4. Does a native platform feature cover it? Use it.
   5. Does an already-installed dependency solve it? Use it.
   6. Only then, write the minimum clear new code that works.

   Do not use minimalism to remove explicit requirements, trust-boundary
   validation, security, accessibility, or error handling that prevents data
   loss.

## During implementation

1. With a plan, first backfill every task that has no `Progress` line (a
   legacy plan or a `tasks.md` written before this field existed). Compare its
   `Change` with current source and any recorded result, then run its `Verify`
   check fresh. When the change is present and the check passes, add
   `Progress: done` and `Result: <check> — <outcome> (backfilled)`; otherwise
   add `Progress: todo` and `Result: none`. Do not redo or rewrite work while
   backfilling; when the evidence is partial or unclear, mark `todo` and report
   it. Then work through tasks in order, starting at the first task whose
   `Progress` is not `done`. After a task's `Verify` check passes, set its
   `Progress: done` and `Result: <check> — <outcome>` before starting the next
   task. A task whose check fails stays `todo`; fix it within scope and rerun
   the check, under the stop rule in "After implementation" step 3. Continue
   until every task is `done`, unless a stop condition in this skill applies.
   For a source-less project, bootstrap the first planned entry point as part
   of its approved task here, then read the created source before verifying it.
2. Reuse local patterns. Keep the diff focused on one logical change.
3. Make the smallest change that satisfies the task. Do not refactor
   unrelated code.
4. If you hit a bug or unexpected behavior, call the available Skill entry
   whose local name is `systematic-debugging` as a repair handoff. It returns
   its fix/check evidence to this task; implementation owns the final review
   and archive. Do not guess-and-check.
5. Run the smallest relevant check after each non-trivial change.
6. Do not create commits during implementation. Even when the user requests a
   commit, wait until final `review-and-verify` passes.

## Technical rulings

Resolve a choice without user input only when every viable option preserves
the same observable behavior, fits the approved design, plan, decisions, and
repository contract, and changes no API, schema, dependency, security
boundary, scope, or data-loss risk. The choice must be non-destructive and
reversible wholly within the current task, without migration, data rewrite,
external contract changes, or caller changes outside the task.

Choose with the implementation ladder and report:

```text
Ruling R<n>: <choice and concise repository-grounded reason>.
```

Do not persist a technical ruling in `## Decision Log`; it changes no approved
requirement and can be re-derived from source. If any condition above fails,
an approved artifact conflicts, or the action is destructive or irreversible,
use the user clarification and approval flow below.

## Clarification decisions

When implementation needs a user answer before it can continue:

1. Stop editing and ask one question. After the answer, restate it as
   `Decision D<n>: <one unambiguous sentence>` before taking another action.
2. Keep an implementation-only choice in the current session when it changes
   no observable behavior, requirement, API, schema, security boundary, or
   scope. Do not create an artifact for it.
3. Persist every answer that changes observable behavior or an approved
   requirement:
   - When a change folder exists, append the decision to its `decisions.md`
     (create it on the first persistent decision) and, for a material change
     when `tasks.md` exists, also update `tasks.md`'s `## Decision Log` and
     approval gate.
   - When a legacy plan or spec exists, append the decision to its
     `## Decision Log`.
   - For a bounded task with no plan/spec, create a decision file only when
     the first persistent decision occurs, at
     `docs/agent-devkit/decisions/YYYY-MM-DD-<slug>.md`. Follow the shared
     artifact naming rule in `using-devkit` (read it if it is not loaded). Link
     it under `## Decisions` in `docs/agent-devkit/INDEX.md` and to the task
     issue or related artifact when one exists, following the shared
     process-artifact link rule in `using-devkit`.

   After persisting the decision, optionally use `memory_write` to store only
   its title and file path; never make memory the only copy. At session start,
   `memory_recall` with 1–3 task keywords may locate decision or handoff files;
   pass `maxTokens` when its schema supports it, and read those files before
   relying on them.

   Use this shape:

   ```md
   ### D<n> — <short title>

   Question: <what was unresolved>
   Decision: <the user's answer>
   Impact: <requirements, tasks, interfaces, or tests affected>
   Confirmed by user: YYYY-MM-DD
   ```

4. If the answer materially changes an active approved design, an open change,
   or an open legacy plan, update the affected artifact and re-evaluate the
   approval gate. When the change is material (scope, observable behavior,
   interface, schema, or risk), set `Status: pending` (and, for a legacy plan,
   reset `Required` and `Reason`), then stop for approval. If a bounded
   task expands beyond its approved design, call `brainstorm-feature` instead
   of silently widening scope.
5. Follow the shared process-artifact/wiki boundary in `using-devkit` (read it
   if it is not loaded). Keep `docs/llm/` for verified implemented behavior.

## After implementation

1. After code checks pass, assess documentation using approved scope, the diff,
   and traced callers. When `docs/llm/` exists and task behavior is new, changed,
   missing, or stale, call `document-wiki`'s Task updates procedure. It merges
   any delta before other content updates and verifies the affected wiki.
   Missing wiki means skip, not setup. Unrelated gaps stay optional findings.
   Resolve in-scope documentation blockers before final review; use the same
   fix-loop and scope/decision stop rules below.
2. Call the available Skill entry whose local name is `review-and-verify` to
   review the diff, run fresh
   verification, and confirm no stale documentation.
3. If the review result is `Status: fail`, fix the listed blockers that are
   inside the approved scope, run the smallest relevant check, and call the
   available Skill entry whose local name is `review-and-verify` again. Keep
   going while each round removes a blocker or yields new evidence. Stop and
   report the remaining blockers, without claiming completion, when any of
   these holds:
   - the same blocker remains after a fix attempt with no new information;
   - three fix attempts for one blocker have failed (treat this as the
     architecture signal in `systematic-debugging`);
   - the fix needs a change outside the approved scope; or
   - the fix needs a user decision.
4. Whenever this skill stops before review (a question, a pending gate, or
   scope growth), end with the `Next:` block from `using-devkit`, naming the
   current task.
