---
name: plan-feature
description: Use when a written design.md needs its tasks.md before the joint design-and-tasks approval, or when an open change or legacy plan needs revision for a behavior, API, or cross-file change.
---

# Plan Feature

Turn a design into a short execution plan before editing code. For a new change,
`brainstorm-feature` writes `design.md` and calls this skill before any approval;
the user then approves `design.md` and `tasks.md` together, once. "The design"
means that written `design.md`. Save `tasks.md` beside it in the change folder
(`using-devkit`'s `## Change lifecycle`). A legacy design with no change folder is
covered by `../using-devkit/references/legacy.md`; read it when you meet one.
Create the folder only when writing the plan.

## Entry points

- **Route handoff from `brainstorm-feature`:** write the plan and present it for
  the joint approval (step 9).
- **Route handoff from `estimate-feature`:** when the user asked for an estimate
  and only a written `design.md` exists, write the plan, call `estimate-feature`
  before the approval gate, and present the plan and estimate together.
- **Route handoff from `implement-task`:** a material decision found during
  implementation. Revise the open `tasks.md`, record the decision in its
  `## Decision Log`, reset the gate to `pending`, present the revision for
  approval, and resume `implement-task` after re-approval.
- **Repair handoff** (e.g. `estimate-feature` asking for missing task detail in
  an existing plan): fix the plan, run the self-review, and return to the caller
  with the gate preserved or reset and the reason. Do not call `estimate-feature`
  or ask for approval, and never start implementation.

## Process

1. Read the design, `AGENTS.md`, and related wiki pages. If application source
   exists, call the available Skill entry whose local name is
   `read-codebase-context` to inspect affected source, callers, and tests;
   otherwise map planned files and interfaces from the design and state that
   callers and tests do not exist yet. Revise an open change's `tasks.md` in
   place; new architectural work after a change is archived gets a new design and
   folder. Keep completed tasks and results historical; add new work as a new
   task only while the change is open. Extract only exact constraints from the
   design that bind more than one task; infer none from convention.
2. Map which files will be created or modified and what each is responsible for.
   Follow existing patterns; do not unilaterally restructure. Before accepting a
   proposed unit, apply `implement-task`'s `## Implementation ladder`, planning
   new code only at its last step. Every new file, abstraction, dependency, or
   configuration value must map to an approved requirement, and minimal design
   must not remove explicit behavior, trust-boundary validation, security,
   accessibility, or error handling that prevents data loss.
3. Split the work into small, ordered tasks with the fields in
   `references/tasks-template.md` (read it now). Put contract and data changes
   before their callers and tests beside the behavior they verify. Map every
   approved edge case to a task and a specific check. If planning exposes an
   unresolved case that would change observable behavior, scope, an interface, a
   schema, or a protected boundary, stop and call `brainstorm-feature`; leave only
   behavior-equivalent details for `implement-task` rulings. Add no tasks for
   speculative abstractions, and do not add `review-and-verify` or commit steps;
   `implement-task` owns the final review. Plans describe intended behavior and
   interfaces, not code: include no function bodies or full test code. Include
   exact snippets only when the precise string, regex, config value, or contract
   shape is itself a requirement.
4. Give each task a meaningful `Verify` check using the existing test runner and a
   failing test when it protects changed behavior. With no tests, use a repeatable
   check available in the project; do not add a test runner solely for the plan.
   Record the expected result, and mark a behavior `cannot verify` when no check
   can establish it. For a source-less project, the first task bootstraps the
   runtime and first entry point the design specifies, with its verification; if
   the design does not establish them, call `brainstorm-feature`.
5. Add `## Approval Gate` and `## Decision Log` as the template shows. A new
   `tasks.md` is `Status: pending`; revisions follow the template's revision rule.
6. Save the complete plan with `## Design`, `## Global Constraints`, and
   `## Impact map` (seven fields from `read-codebase-context`'s
   `## Trace and record the impact`). The folder is indexed only on approval
   (step 9).
7. Run the self-review below and fix issues inline.
8. Do not estimate effort here. When the user explicitly requests an estimate,
   call `estimate-feature` before presenting the approval gate; otherwise present
   none. An estimate never authorizes implementation.
9. Before requesting approval or delivering a planning-only result, give a short
   summary in the user's language with links to the written files: **Goal**;
   **Scope and impact**; **Tasks** (count and ordered titles); **Verification**
   (checks, naming any limit); **Documentation** (pages to update, or wiki not
   applicable); **Risks and decisions**. Summarize the actual design and tasks,
   not a second plan. State whether approval authorizes implementation or the
   request stops at planning. Unresolved material decisions return to
   `brainstorm-feature`; never present the plan as ready to implement.
   Apply the template's revision rule first: an existing plan that stays approved
   is summarized without a new approval request. Otherwise present `design.md`,
   `tasks.md`, any `delta.md`, and the requested estimate together and ask for one
   approval, then stop without editing application code. Revise the files in place
   until the user explicitly approves; then set `Status: approved`, index the
   folder per `using-devkit`'s `## Change lifecycle`, and continue: call
   `setup-codebase` first when the target has no `AGENTS.md` or application
   source, then `implement-task`. That approval is the gate, so do not ask again.
   If the user limited the request to design or planning, record the approval and
   stop. End with the `Next:` block from `using-devkit`; for a pending gate it
   names the exact approval the user must give.

## No placeholders

Every step must contain the actual content an engineer needs. Never write:
"TBD", "TODO", "implement later"; "add appropriate error handling" without saying
what; tests described as code rather than named cases with input → expected
result; "similar to Task N" (repeat the details); steps that omit the specific
behavior, interface, or check; references to types or functions defined in no
task.

## Self-review

Fix only issues that could change approved behavior, scope, plan correctness, or
execution; skip wording preferences. Check: **spec coverage** (a task per design
requirement); **placeholders** (none, per the section above); **type
consistency** across tasks; **links** (design and index resolve; the design links
only wiki pages read as context); **gate** (new tasks are `Progress: todo` with
`Result: none`, existing tasks keep theirs, a new `tasks.md` has only
`Status: pending`); **minimal design** (anything removable via the ladder);
**decision consistency** (persisted decisions agree with tasks and approval;
material changes leave the gate pending); **global constraints** (each copied
from the design and consistent with every task, or `None.`); **edge cases** (each
mapped to a task and check, with unresolved behavior routed to
`brainstorm-feature`).

Prefer the fewest tasks that make the sequence and verification unambiguous.

## Red flags

| Thought                                                    | Reality                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "The user said implement earlier, so the plan is approved" | An instruction given before both files were presented is not approval.                        |
| "Approval is in the chat history"                          | Only this conversation after both files were shown, or the gate's `Status: approved`, counts. |
| "This decision is small; keep the gate approved"           | A material change to scope, behavior, an interface, a schema, or risk resets it to pending.   |
