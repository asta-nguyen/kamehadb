---
name: plan-feature
description: Use when an architectural design needs its tasks.md before the joint design-and-tasks approval, or an open change or legacy plan needs revision for a non-trivial behavior, API, or cross-file change.
---

# Plan Feature

Turn a design into a short execution plan before editing code. For a new
change, `brainstorm-feature` writes `design.md` and calls this skill before any
approval; the user then approves `design.md` and `tasks.md` together, once. In
this skill, "the design" means that written `design.md` (or an approved legacy
design). For a change folder, save `tasks.md` beside its `design.md` under
`docs/agent-devkit/changes/<folder>/`. For a legacy design with no change
folder, save the plan at
`docs/agent-devkit/plans/YYYY-MM-DD-<slug>-plan.md`. Follow the shared artifact
naming rule in `using-devkit` (read it if it is not loaded). Create the folder
only when writing the plan.

## Process

1. Read the design, `AGENTS.md`, and related wiki pages. If application
   source exists, call the available Skill entry whose local name is
   `read-codebase-context` to inspect
   affected source,
   callers, and tests. Otherwise map planned files and interfaces from the
   design; state that callers and tests do not exist yet.
   Apply the change lifecycle in `using-devkit`: revise an open change's
   `tasks.md` in place; for new architectural work after a change is archived,
   use a new design and change folder. An open legacy plan is revised
   in place (same file, decision log, and approval gate); do not recreate it, and
   start a new plan only when the old one is complete. Keep completed tasks and
   results historical; add new work as a new task only while the change is open.
   Extract only exact constraints from the design that bind more than
   one task. Do not infer constraints from convention or preference.
2. Map out which files will be created or modified and what each one is
   responsible for. Design units with clear boundaries. Follow existing
   patterns; do not unilaterally restructure. Before accepting a proposed unit,
   apply this minimal-design ladder in order and stop at the first option that
   satisfies the approved behavior:
   1. Does this need to exist at all? Remove work that no approved requirement
      needs (YAGNI).
   2. Does it already exist in this codebase? Reuse the module, helper, type, or
      pattern.
   3. Does the standard library do it? Use it.
   4. Does a native platform feature cover it? Use it.
   5. Does an already-installed dependency solve it? Use it.
   6. Only then, plan the minimum clear new code that works.

   Every new file, abstraction, dependency, or configuration value must map to
   an approved requirement. Minimal design must not remove explicit behavior,
   trust-boundary validation, security, accessibility, or error handling that
   prevents data loss.

3. Split the work into small, ordered tasks. Each task must state:

   ```text
   Files: <paths anchored as path::SymbolName; line ranges only for files without symbols>
   Interfaces: <what this task consumes from earlier tasks and produces for later ones>
   Change: <observable behavior or implementation>
   Verify: <smallest relevant test/check>
   Progress: todo
   Result: none
   ```

   `implement-task` later sets `Progress: done` and records `Result:` with the
   check it ran and its outcome. Only a new task starts with `Progress: todo`
   and `Result: none`. When revising an open plan, keep every existing task's
   `Progress` and `Result` unchanged; never reset a `done` task. Work that
   changes or extends a `done` task becomes a new task, per step 1. Leave a
   task with no `Progress` line as is; `implement-task` backfills it.

   Plans specify implementation; they do not pre-write code. Do not include
   function bodies or full test code; `implement-task` writes code. Include
   exact snippets only when a precise string, regex, config value, or contract
   shape is itself the requirement.

   For cross-file work, also list `Files inspected, no change` so the plan
   distinguishes evidence from guesses.

   Map every approved edge case to a task and specific verification. If
   planning exposes an unresolved case that would change observable behavior,
   scope, an interface, a schema, or a protected boundary, stop and call
   `brainstorm-feature` to resolve it; do not invent the behavior. Leave only
   behavior-equivalent implementation details for `implement-task` rulings.

4. Give each task only the steps needed for its change and a meaningful
   `Verify` check. Use an existing test runner and a failing test when that
   test protects changed behavior. If the project has no tests, use a
   repeatable check available in the project; do not add a unit-test runner
   solely to satisfy the plan. Record the expected result. If no check can
   establish a required behavior, mark it `cannot verify` instead of claiming
   coverage.

   For a source-less new project, the first task bootstraps the runtime and
   first entry point specified in the design. State its verification procedure.
   If the design does not establish the runtime, build tool, first entry point,
   or verification approach, call `brainstorm-feature` to resolve it; do not
   invent a toolchain.

5. Put contract/data changes before their callers; put tests beside the
   behavior they verify. Do not add tasks for speculative abstractions.
6. Do not add `review-and-verify` as an implementation task. After all plan
   tasks are complete, `implement-task` owns the final review and verification.
7. Add this section to every `tasks.md`:

   ```md
   ## Approval Gate

   Status: pending | approved

   ## Decision Log

   None.
   ```

   A new `tasks.md` always starts at `Status: pending`. The gate covers
   `design.md`, `tasks.md`, and any `delta.md` together; a `tasks.md` has no
   `Required`, `Reason`, or `not-required` field. An instruction such as
   "implement it" given before both files were presented does not approve
   them. Approval never marks execution complete; a change's `tasks.md` has no
   `Execution` field, because completion is the archive move.

   A legacy plan in `plans/`, or an open `tasks.md` written before this rule,
   keeps its existing gate (`Required`, `Reason`,
   `Status: pending | approved | not-required`, plus
   `Execution: open | complete` for legacy plans only).

   For every revision, including a repair handoff, preserve the existing gate
   when scope, observable behavior, interfaces, schemas, and risk are unchanged.
   For a material revision, append the change and its approval state to
   `## Decision Log` and set `Status: pending`; a legacy gate also gets
   `Required: yes` and an updated `Reason`. A repair does not authorize a new
   behavior decision: route unresolved decisions through `brainstorm-feature`.

8. Save the complete plan. Include `## Design` with a relative link to the
   exact design, immediately followed by `## Global Constraints`.
   Copy only exact cross-task constraints from the design; write `None.` when
   there are none. Include `## Impact map` using exactly the seven fields in
   `read-codebase-context` step 5. Do not add a second design/spec pointer. For a
   change folder, `tasks.md` links to its sibling `design.md`, the folder is
   linked under `## Changes` in `docs/agent-devkit/INDEX.md` only on approval
   (step 10), and there is no `## Execution` backlink. For a legacy design, add the plan link to the
   design's `## Execution` section and add both artifacts to
   `docs/agent-devkit/INDEX.md` (`## Designs` and `## Plans`). Follow the shared
   process-artifact link and wiki-boundary
   rules in `using-devkit` (read them if they are not loaded). For a planned
   entry point or flow that does not exist yet, keep the seven fields and write
   `Entry: no existing source; planned entry: <design file + symbol>` and
   `Flow: no existing flow; planned flow: <design flow>`. Fill planned files,
   effects, and verification only from the written design; label planned values
   `pending approval` until joint approval. Do not claim
   nonexistent callers or tests were traced.
9. Repair handoff: when this skill was called to fix a plan for another skill
   (such as `estimate-feature`), return to the caller right after saving the
   plan and running the self-review below. Skip the rest of this step and
   step 10: do not call `estimate-feature` or present an approval request.
   Return the gate preserved or reset by step 7, plus the reason for any reset;
   the caller reports the plan and its gate. Never start implementation.

   Do not estimate effort in this skill. When the user explicitly requests an
   estimate, call `estimate-feature` before presenting the approval gate;
   otherwise continue without an estimate. Estimation never authorizes
   implementation.

10. Before requesting approval or delivering a planning-only result, give a
    short summary in the user's language with links to the written files:

- **Goal:** the observable result.
- **Scope and impact:** affected components/files and consequential API,
  data, dependency, or risk changes.
- **Tasks:** the count and ordered task titles; group them when numerous.
- **Verification:** the checks and expected outcomes, naming any limit.
- **Documentation:** affected pages to update, or wiki not applicable.
- **Risks and decisions:** material tradeoffs, open questions, or none.

Summarize the actual design/tasks, not a second plan or copied file contents.
Include an estimate only when requested. State whether approval authorizes
implementation or the request stops at planning. Unresolved material
decisions return to `brainstorm-feature`; do not present the plan as ready
to implement. A repair handoff returns to its caller under step 9 instead
of asking for approval or adding another user-facing presentation.

Apply step 7's revision rule first. If an existing plan remains approved
(or legacy `not-required`), present the summary and continue within the
requested stopping point without another approval request. Otherwise present
`design.md`, `tasks.md`, any `delta.md`, and the requested estimate together,
and ask for one approval. Stop without editing
application code. Revise the files in place until the user explicitly
approves them; then set `Status: approved`, add the folder under
`## Changes` in `docs/agent-devkit/INDEX.md`, and continue: call
`setup-codebase` first when the target has no `AGENTS.md` or application
source, then `implement-task`. That approval is the gate, so do not ask
again. If the user limited the request to design or planning, record the
approval and stop instead of implementing.

For a revision, apply step 7's gate rule before presenting the affected
files again; a non-material revision keeps its existing approval. For a
legacy plan, apply its own gate: `Required: yes` waits for approval;
`Required: no` proceeds when the user asked for implementation.

End with the `Next:` block from `using-devkit`; for a pending gate it names
the exact approval the user must give. 11. Do not include commit steps. If the user requests a commit, leave that action
until after `review-and-verify` passes.

## No placeholders

Every step must contain the actual content an engineer needs. These are
plan failures — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" (without specifying what)
- Tests described as code instead of named test cases with input → expected result
- "Similar to Task N" (repeat the interface, test-case, and verify details the task needs)
- Steps that omit the specific behavior, interface, or check
- References to types or functions not defined in any task

## Self-review

After writing the complete plan, review it against the design:

Flag and fix only issues that could change approved behavior, scope, plan
correctness, or execution. Do not block on wording preferences, stylistic
polish, or uneven detail that does not create ambiguity.

1. **Spec coverage** — can you point to a task that implements each
   requirement from the design? List any gaps.
2. **Placeholder scan** — search for any pattern from the "No placeholders"
   section above. Fix them.
3. **Type consistency** — do function names, signatures, parameter types, and
   property names used in later tasks match what was defined earlier?
4. **Artifact links** — do the index, design, and plan links resolve? Does the
   design link only to wiki pages actually read as context?
5. **Approval gate** — does every new task have `Progress: todo` and
   `Result: none`, and does every existing task keep its prior `Progress` and
   `Result`? Does a new `tasks.md` have only `Status: pending`, with no
   `Required` or `Execution` field? Does a revised legacy plan keep its
   `Required`/`Reason`/`Execution` fields consistent with its impact?
6. **Minimal design** — can any proposed file, abstraction, dependency, or
   configuration be removed or replaced by existing, standard-library, native,
   or already-installed behavior without weakening an approved requirement?
7. **Decision consistency** — does every persisted decision agree with the
   tasks and approval status? Material changes must leave the gate pending.
8. **Global constraints** — is each entry copied from the design,
   applicable across tasks, and consistent with every task? Is `None.` used
   when the design has no cross-task constraint?
9. **Edge-case coverage** — does every approved edge case map to a task and a
   specific verification? Did unresolved behavior route back to
   `brainstorm-feature` instead of being invented during planning?

Fix any issues inline. No need to re-review — just fix and move on.

Plans are execution artifacts, not essays. Prefer the fewest tasks that
make the sequence and verification unambiguous.
