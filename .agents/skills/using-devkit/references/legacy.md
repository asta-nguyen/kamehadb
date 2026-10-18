# Legacy artifacts

Earlier versions wrote plans, specs, and decision files outside change folders,
and gave them `Required` and `Execution` gate fields. Creating new ones stops;
existing ones stay readable, and an open legacy plan can still be revised in
place and finished (below). Removal is scheduled for v0.10. Read this file only
when you meet one.

## Locations

- `docs/agent-devkit/specs/` — legacy designs.
- `docs/agent-devkit/plans/` — legacy plans. A design's `## Execution` section
  links its plan, and `docs/agent-devkit/INDEX.md` lists them under `## Designs`
  and `## Plans`.
- `docs/agent-devkit/decisions/` — legacy decision files. Read them as decision
  sources; never add one. New decisions go to a change's `decisions.md`.
- `docs/agent-devkit/estimates/` — legacy estimates for a legacy plan.

## Lifecycle

- A legacy plan keeps its `Execution: open | complete` field. After all tasks
  pass final `review-and-verify`, that skill marks `Execution: complete` in the
  plan's `## Approval Gate`, or adds `## Completion` when the plan has no such
  section. Do not infer completion from `Status: approved` or from every task
  being `done`.
- An open legacy plan is revised in place (same file, decision log, and gate);
  start a new change only when the old plan is complete. A completed plan or an
  explicit spec completion statement is historical scope, not approval for new
  scope: inspect remaining tasks and final verification evidence before reusing
  it.
- Archived changes, completed plans, and legacy specs are history. Correct
  factual errors when needed, but add no requirements, tasks, or results.

## Gate fields

- A legacy plan's `## Approval Gate` has `Required: yes | no`, `Reason`,
  `Status: pending | approved | not-required`, and `Execution: open | complete`.
  `Required: yes` proceeds only with `Status: approved`; `Required: no`
  proceeds with `Status: not-required`. A legacy plan with no gate needs
  approval before work when it changes a public API, data schema, dependency, CI,
  or many files.
- An open `tasks.md` written before change folders keeps its gate with
  `Required` and `Reason` and follows the same rule: `Required: yes` proceeds
  only with `Status: approved`, `Required: no` with `Status: not-required`. A
  current `tasks.md` has `Status: pending | approved` only.
- A material revision of a legacy plan sets `Status: pending`, `Required: yes`,
  and an updated `Reason`, and appends the change to its `## Decision Log`.
  A non-material revision keeps the gate.
- Legacy decisions go in the plan or spec's `## Decision Log`.

## Progress backfill

A plan or `tasks.md` written before `Progress` existed has tasks with no
`Progress` line. Before working, compare each such task's `Change` with current
source and any recorded result, then run its `Verify` check fresh. When the
change is present and the check passes, add `Progress: done` and
`Result: <check> — <outcome> (backfilled)`; otherwise add `Progress: todo` and
`Result: none`. Do not redo or rewrite work while backfilling. When the evidence
is partial or unclear, mark `todo` and report it.
