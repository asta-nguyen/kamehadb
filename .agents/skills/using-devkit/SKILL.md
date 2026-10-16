---
name: using-devkit
description: Use when starting work in a repository with agent-devkit installed, or when a request does not clearly map to a workflow skill.
---

# Using Devkit

Choose the owning workflow skill and follow its instructions. Read context
first: `read-codebase-context`, or `setup-codebase` on a first visit.

## Shared rules

- Name a new process artifact `YYYY-MM-DD-<issue-id>-<slug>` (before any type
  suffix) only when the task or a related artifact, including its filename,
  gives an issue ID; never infer one or rename an artifact.
- Link internally with relative Markdown links; convert legacy `[[...]]` links
  in any document you edit and report unresolvable targets.
- Never put process artifacts in or link them from `docs/llm/`.
- Commit/push only on explicit request, after a final `review-and-verify`
  pass. One branch/PR per task; no locks or coordination tools. For conflicts in `docs/agent-devkit/INDEX.md` or `docs/llm/INDEX.md`,
  preserve every task link and verify targets.
- Working-tree changes are user-owned: "clean up" never authorizes `git reset
--hard`, `git clean`, `git stash`, or deletes, even after a backup. Ask first.

## Handoffs and stops

- Call the next skill directly. Stop only for approval, user question/action,
  or a stalled fix loop. Route handoffs advance; repair handoffs return to caller.
- Each route has one approval: Bounded chat design or Architectural
  `design.md` + `tasks.md` (+ `delta.md`). It authorizes implementation through
  review; ask again only for a material change to scope, behavior, interface,
  schema, or risk. An instruction before the approved files existed is not
  approval.
- Stop where the user limited the request ("plan only"); never call
  `implement-task` without a request to implement.
- **Baseline:** before the first source edit, run existing relevant checks and
  record failures. If none, note it; no baseline-only test/runner.
  Implementation includes documentation: call
  `document-wiki`'s `## Task updates` when an existing wiki needs an in-scope
  update; stale or missing coverage blocks completion. Merge, archive, and
  relinking need no extra approval.
- Every turn that ends a skill, stops for the user, or hands off ends with:

  ```text
  Next: <skill or action, or none>
  Waiting on: agent | user — <exact approval, answer, or action needed>
  Done when: <observable result that completes the next step>
  ```

  `review-and-verify` keeps its own result block; its first three lines match.

## Change lifecycle

`docs/agent-devkit/changes/<name>/` exists only with a process file
(`design.md`, `tasks.md`, `delta.md`, `estimate.md`, `decisions.md`, or
`handoff.md`); Architectural changes need `design.md` and `tasks.md`. On
creation (Architectural: on joint approval), link it under `## Changes` in
`docs/agent-devkit/INDEX.md`, adding the heading if missing.

- **Open:** edit in place; `tasks.md`'s `## Approval Gate` records approval,
  not completion. Material changes reopen it.
- **Complete:** after final review passes, `review-and-verify` moves the folder to
  `changes/archive/<same name>/` and relinks under `## Archived changes`.
- **Cancelled:** needs the user's reason (ask if missing). Move the folder to
  `changes/cancelled/<same name>/` via `review-and-verify`'s move-and-relink
  step (links only), listing it under `## Cancelled changes` with the reason.
  Not completion: never archive, mark tasks done, or discard code/Git changes.
  No folder: create none; say so.
- Archived and cancelled folders are history: add no requirements, tasks, or
  results; follow-up starts a new change.
- **Delta:** create only for an existing wiki requirement needing
  `ADDED`/`MODIFIED`/`REMOVED`; not for a domain with no page, missing wiki,
  or restored behavior. Target `## Requirements` pages; convert a legacy
  `## Business rules` page with `document-wiki` first.
- Older plans, specs, decision files, and `Required`/`Execution` gates are
  legacy: see `references/legacy.md`.

## Task flows

Classify the task, state the class (the user may override), then follow its
row. When in doubt take the heavier row; hidden complexity moves up, never down.

| Task                                                   | Flow and owning skills                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spike or bug question ("can we…?", "is this a bug?")   | Investigate → report evidence; no production code: `brainstorm-feature` (Spike), `systematic-debugging` (bug question)                                      |
| Clear, small change (conditions below)                 | Impact check → code → review: `brainstorm-feature` → `implement-task` → `review-and-verify`                                                                 |
| Bounded feature (any other change to an existing flow) | Settle decisions → chat design → approve → code → review: `brainstorm-feature` → `implement-task` → `review-and-verify`                                     |
| Bounded bug                                            | Reproduce → root cause → failing check → fix → passing check → review: `systematic-debugging` → `review-and-verify`                                         |
| Architectural feature or bug                           | Clarify → `design.md` + `tasks.md` → **one joint approval** → code → review: `brainstorm-feature` → `plan-feature` → `implement-task` → `review-and-verify` |

- A clear, small change meets all four: the user named the exact change and file
  or symbol with an unambiguous result; the impact check keeps every caller,
  test, config, and wiki page in scope; it touches no public API, schema,
  dependency, CI, security boundary, or data-loss risk; it is not a bug.
  `brainstorm-feature` confirms; if any fails, use the Bounded feature row.
- A bounded bug changes no shared interface, contract, or component boundary;
  when its class is unclear, start with `systematic-debugging`, which moves
  architectural bugs up.

Other routes: `plan-feature` revises an open `tasks.md` or legacy plan (also for
a material decision mid-implementation); `brainstorm-feature` revises
an open Bounded `delta.md`; `implement-task` resumes an approved change.
