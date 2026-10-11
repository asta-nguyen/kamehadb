---
name: using-devkit
description: Use when starting work in a repository with agent-devkit installed, including features, bug fixes, reviews, documentation, estimates, or unfamiliar requests.
---

# Using Devkit

Choose the owning workflow skill and follow its full instructions.

## Priority

Read context before changing files: run `read-codebase-context`, or
`setup-codebase` on a first visit.

## Shared rules

- New process artifacts under `docs/agent-devkit/` use
  `YYYY-MM-DD-<issue-id>-<slug>` before any type suffix when the task or a
  related artifact (including its filename) provides an issue ID. Otherwise
  keep the existing form. Never infer an ID or rename an artifact.
- A change with process files keeps them in one folder,
  `docs/agent-devkit/changes/YYYY-MM-DD-<issue-id>-<slug>/`, under the same
  naming rule. Keep the folder together; see the change lifecycle.
- For internal document links, use standard relative Markdown links
  (`[label](relative/path.md)`), resolved from the file containing the link.
  No Obsidian vault or app is required.
- When editing any document that contains legacy `[[...]]` links, convert
  every resolvable link in that document to relative Markdown and verify it.
  Resolve legacy targets using the owning workflow's existing target-root rule;
  read the exact target before converting and do not guess among duplicates. If
  `docs/llm/` contains legacy wikilinks during wiki work, migrate every
  resolvable internal link across the wiki in the `document-wiki` pass. If the
  task cannot include that full migration, route wiki work through
  `document-wiki`; do not report it complete while links remain mixed. Report
  missing or ambiguous targets instead of inventing them.
- Process artifacts stay under `docs/agent-devkit/`: never put them in
  `docs/llm/` or link to them from `docs/llm/`.

## Handoff and next step

- When a skill hands off to another skill, call it directly; the user never has
  to retype a skill name. Stop only for an approval gate, a user question, an
  action only the user can perform (such as a client restart), or a stalled
  fix loop (see `implement-task`).
- Each route has one approval: the chat design for Bounded work, or
  `design.md` + `tasks.md` (+ `delta.md`) together for Architectural work. That
  approval authorizes implementation through final review. Ask again only when
  scope, observable behavior, an interface, a schema, or risk changes
  materially; an instruction given before the approved files existed never
  counts as approval.
- Distinguish two kinds of handoff. A **route handoff** advances the work
  (design → plan → implement → review). A **repair handoff** fixes an artifact
  another skill needs (for example, `estimate-feature` calling `plan-feature`
  for missing task detail); the repairing skill returns to its caller and
  never starts a route handoff.
- Respect the user's stopping point. When the request is limited ("estimate
  only", "plan only", "do not implement yet"), stop at that point and end with
  the `Next:` block; never call `implement-task` without a request to
  implement.
- The user-facing flow is **understand the task → implement → review and
  finish**. Implementation includes checks and affected documentation;
  delta merge, validation, archive, and relinking are internal work, not extra
  approvals. Call `document-wiki`'s Task updates procedure automatically when
  an existing wiki needs an in-scope update. Missing required task coverage or
  stale content blocks completion. Without `docs/llm/`, skip wiki updates;
  wiki setup remains a separate request.
- Every turn that ends a skill, stops for the user, or hands off ends with:

  ```text
  Next: <skill or action, or none>
  Waiting on: agent | user — <exact approval, answer, or action needed>
  Done when: <observable result that completes the next step>
  ```

  `review-and-verify` keeps its own result format, whose first three lines
  carry the same information.

## Change lifecycle

`Approval Gate` records approval, not completion, for a change's `tasks.md`.
Each task's `Progress: todo | done` records progress; `implement-task` sets
`done` with its `Result:` only after the task's `Verify` check passes.
A change whose folder sits directly under `changes/` is open: revise its files
in place, and apply material changes through `tasks.md`'s decision log and
approval gate. `review-and-verify` moves the folder to
`changes/archive/<same name>/` only after final review passes. `document-wiki`
merges any verified `delta.md` during implementation, before final review;
archive only moves and relinks the folder. That verified move marks the change
complete. Change folders have no `Execution`
field and are never renamed.

Legacy plans in `docs/agent-devkit/plans/` keep their `Execution` lifecycle:
after all tasks pass final `review-and-verify`, that skill marks
`Execution: complete` in the plan's `## Approval Gate`, or adds `## Completion`
when the plan has no such section. Treat completed task results or an explicit
spec completion statement as historical scope; inspect remaining tasks and
final verification evidence before reusing the plan. Do not infer completion
from `Status: approved` or from every task being `done`.

For new work, classify with `brainstorm-feature`: a change gets a folder when it
produces a change file. An Architectural change always has `design.md` and
`tasks.md`; write `delta.md` only when a `docs/llm/` requirement needs `ADDED`,
`MODIFIED`, or `REMOVED`. A domain with no wiki page gets no delta and is
documented automatically within the task through `document-wiki` when the wiki
exists. After a change is archived, start a new change.
Keep archived changes, completed legacy plans, and legacy specs as history:
correct factual errors when needed, but do not add requirements, tasks, or
results to them. A delta only targets a page already in the `## Requirements`
format; convert a legacy `## Business rules` page through `document-wiki`
before the delta names its IDs. The task's explicitly identified affected
page is its selection; standalone wiki work keeps its own selection gate.

## Team Git workflow

Use one branch/PR per task; worktrees are optional. Keep repository and user
commit/push approval rules. When resolving conflicts in
`docs/agent-devkit/INDEX.md` or `docs/llm/INDEX.md`, preserve every task link
and verify all targets. Do not add locks or coordination tools.

## Task flows

Classify the task, state the class so the user can override it, then follow
its row. When in doubt, take the heavier row; hidden complexity found later
moves the task up a row, never down.

| Task                                                   | Flow                                                                                                | Owning skills                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Spike or bug question ("can we…?", "is this a bug?")   | Investigate → report a recommendation or evidence; no production code                               | `brainstorm-feature` (Spike), `systematic-debugging` (bug question)            |
| Clear, small change (all four conditions below)        | Context + impact check → code → check → review                                                      | `brainstorm-feature` → `implement-task` → `review-and-verify`                  |
| Bounded feature (any other change to an existing flow) | Settle open behavior decisions → agree a short solution in chat → approve → code → check → review   | `brainstorm-feature` → `implement-task` → `review-and-verify`                  |
| Bounded bug                                            | Reproduce → trace root cause → check fails → fix → check passes → review                            | `systematic-debugging` → `review-and-verify`                                   |
| Architectural feature or bug                           | Clarify → write `design.md` + `tasks.md` → **one joint approval** → code → check each task → review | `brainstorm-feature` → `plan-feature` → `implement-task` → `review-and-verify` |

- A clear, small change must meet all four: the user stated the exact change
  and an unambiguous result; the impact check keeps every caller, test,
  config, and wiki page inside that scope; it touches no public API, schema,
  dependency, CI, security boundary, or data-loss risk; and it is not a bug.
  `brainstorm-feature` confirms them; if any fails, use the Bounded feature
  row.
- `design.md` explains the solution and behavior; `tasks.md` is the plan, with
  the steps, verification, and progress. There is no separate plan file.
- A bounded bug changes no shared interface, contract, or component boundary.
  When a bug's class is unclear, start with `systematic-debugging`; it moves
  architectural bugs to the Architectural row.
- Implementation updates affected wiki behavior automatically when the wiki
  exists. A passing review checks code and documentation, then archives the
  change and verifies rewritten links. The user commits.

Other routes:

| Need                                                      | Skill                                  |
| --------------------------------------------------------- | -------------------------------------- |
| First visit or missing repository conventions             | `setup-codebase`                       |
| Set up or refresh OpenEZ when needed and approved         | `setup-openez`                         |
| Understand affected code and callers                      | `read-codebase-context`                |
| Revise an open change's `tasks.md` or an open legacy plan | `plan-feature`                         |
| Revise an open Bounded change's `delta.md`                | `brainstorm-feature`                   |
| Resume an approved design, tasks, or legacy plan          | `implement-task` → `review-and-verify` |
| Per-task AI estimate, when requested                      | `estimate-feature`                     |
| Pause or resume unfinished work                           | `context-handoff`                      |
| Create or refresh the LLM wiki                            | `document-wiki`                        |
| Whole-repository simplicity audit                         | `lean-audit`                           |

This skill routes only and requires the full devkit skill set. In namespaced
hosts use entries such as `agent-devkit:review-and-verify`; direct installs use
the bare skill name.
