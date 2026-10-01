---
name: implement-task
description: Use when the user has approved a bounded change or feature plan and code changes are ready to begin.
---

# Implement Task

## Before coding

1. Read `AGENTS.md` and, when it exists, `docs/llm/INDEX.md` for project
   conventions and affected wiki pages. A missing wiki must not block work.
   If `AGENTS.md` contains `Read CONVENTIONS.md before editing.`, read the
   root `CONVENTIONS.md` too. Apply only rules whose scopes match the changed
   files, with the most specific matching scope winning; route same-scope
   conflicts through user clarification.
2. If application source exists, call the available Skill entry whose local
   name is `read-codebase-context` to trace the relevant code path, or use
   direct file reads. Understand callers, data flow, and error paths before editing. For a
   source-less new project, read the
   approved spec and plan, then create the first planned entry point; state that
   callers and existing error paths do not exist yet.
3. Follow the approved `plan-feature` output when one exists. Read its
   `## Approval Gate` before editing application code:
   - `Required: yes` proceeds only with `Status: approved`. Missing or `pending`
     status means stop and request approval of the complete plan.
   - `Required: no` proceeds with `Status: not-required`.
   - For a legacy plan with no gate, inspect its impact. Public API, data schema,
     dependency, CI, or broad file changes require approval before proceeding.

   Approval given before the plan existed does not satisfy a required gate.
   Without a plan, require an approved bounded design from `brainstorm-feature`;
   otherwise tell the user to invoke `brainstorm-feature` before editing.

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

1. Reuse local patterns. Keep the diff focused on one logical change.
2. Make the smallest change that satisfies the task. Do not refactor
   unrelated code.
3. If you hit a bug or unexpected behavior, call the available Skill entry
   whose local name is `systematic-debugging`. Do not guess-and-check.
4. Run the smallest relevant check after each non-trivial change.
5. Do not create commits during implementation. Even when the user requests a
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
   - When a plan or spec exists, append the decision to its `## Decision Log`.
   - For a bounded task with no plan/spec, create a decision file only when
     the first persistent decision occurs. Use
     `docs/agent-devkit/decisions/YYYY-MM-DD-<issue-id>-<slug>.md` when an issue
     ID is present, or the existing `YYYY-MM-DD-<slug>.md` form otherwise. Use
     only an ID stated in the task or present in a linked artifact, including
     its filename; do not rename existing files. Link it under `## Decisions` in
     `docs/agent-devkit/INDEX.md` and link it to the task issue or related
     artifact when one exists.

   Use this shape:

   ```md
   ### D<n> — <short title>

   Question: <what was unresolved>
   Decision: <the user's answer>
   Impact: <requirements, tasks, interfaces, or tests affected>
   Confirmed by user: YYYY-MM-DD
   ```

4. If the answer materially changes an approved design or plan, update the
   affected artifact and re-evaluate the plan's approval gate. When the new
   impact requires approval, set `Required: yes`, update `Reason`, set
   `Status: pending`, and stop for approval. If a bounded task expands beyond
   its approved design, tell the user to invoke `brainstorm-feature` instead of
   silently widening scope.
5. Never store proposed decisions in `docs/llm/`; that wiki describes verified
   implemented behavior only.

## After implementation

1. Call the available Skill entry whose local name is `review-and-verify` to
   review the diff, run fresh
   verification, and confirm no stale documentation.
2. If the review result is `Status: fail`, fix only the listed blockers, run
   the smallest relevant check, and call the available Skill entry whose local
   name is `review-and-verify` once more. If the second review still fails, stop
   and report the remaining blockers; do not claim completion.

## Documentation impact

Before the final response, classify whether the verified wiki needs an update.
When `docs/llm/` exists, inspect the relevant page and its `## Sources` entries.
This applies to bug fixes too: a fix that changes user-visible behavior or a
documented business rule can make the wiki stale.

Use exactly one of these classifications:

- `yes`: a page is stale or incomplete, or new/material behavior needs a page;
  list the affected pages. For missing coverage, tell the user to invoke
  `document-wiki` after verification. If an existing page contradicts the
  changed behavior, treat it as a blocker and do not claim completion until it
  is refreshed and the final review passes. Missing coverage for new behavior
  can remain a documented handoff.
- `no`: relevant pages and source paths were inspected and remain accurate;
  name the evidence in the final response.
- `not-applicable`: the repository does not maintain a `docs/llm/` wiki.
- `unknown`: the impact could not be established; state the limitation.

Always include this block in the final response:

```text
Wiki impact: yes | no | not-applicable | unknown
Wiki pages: <paths, or none>
Wiki action: <invoke document-wiki / no update needed / limitation>
```

## Red flags

| Thought                                                | Reality                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| "I'll fix this bug while I'm here"                     | Scope creep. File a separate task.                                                                                                    |
| "The change is obvious, no need to trace callers"      | Obvious changes break callers you did not read.                                                                                       |
| "I'll skip the check, it's a small change"             | Small changes break things. Run the check.                                                                                            |
| "I'll verify at the end"                               | Verify after each non-trivial change. Catch errors early.                                                                             |
| "Removing this guard makes the diff smaller"           | Smaller is not simpler when it weakens a protected boundary.                                                                          |
| "The spec was approved, so the plan must be approved"  | A required execution-plan gate is separate and must say `Status: approved`.                                                           |
| "The conversation will remember the user's answer"     | Restate it now; persist behavior decisions in the active plan/spec or a task-scoped decision file.                                    |
| "This clarification is small, so approval still holds" | Material behavior, API, schema, security, or scope changes invalidate the old approval.                                               |
| "Git can undo it, so it is reversible"                 | A technical ruling must be reversible wholly inside the current task without migration, external contract, or outside-caller changes. |
| "It is only a bug fix"                                 | A behavior-changing bug fix still requires a wiki-impact classification.                                                              |
