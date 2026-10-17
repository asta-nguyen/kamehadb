# tasks.md template and gate fields

Read this when writing or revising a `tasks.md`. `SKILL.md`'s `## Process`
decides what goes in it; this file owns its shape. A legacy plan's gate fields
are in `../../using-devkit/references/legacy.md`.

Contents: file layout, task fields, approval gate, revision rule.

## File layout

```md
# <Change> tasks

## Design

[<design title>](design.md)

## Global Constraints

<exact cross-task constraints copied from the design, or `None.`>

## Impact map

<the seven fields from `read-codebase-context`'s `## Trace and record the impact`>

## Tasks

### Task 1 — <title>

<task fields>

## Files inspected, no change

- <path> — <why it was read>

## Approval Gate

Status: pending

## Decision Log

None.
```

- `## Design` links the exact sibling `design.md`, immediately followed by
  `## Global Constraints`. Do not add a second design pointer or an
  `## Execution` backlink.
- For a planned entry point or flow that does not exist yet, keep the seven
  impact-map fields and write
  `Entry: no existing source; planned entry: <design file + symbol>` and
  `Flow: no existing flow; planned flow: <design flow>`. Fill planned files,
  effects, and verification only from the written design, and label planned
  values `pending approval` until joint approval.
- For cross-file work, list `Files inspected, no change` so the plan separates
  evidence from guesses.

## Task fields

```text
Files: <paths anchored as path::SymbolName; line ranges only for files without symbols>
Interfaces: <what this task consumes from earlier tasks and produces for later ones>
Change: <observable behavior or implementation>
Verify: <smallest relevant test/check>
Progress: todo
Result: none
```

`implement-task` sets `Progress: done` and records `Result:` with the check it ran
and its outcome. Only a new task starts with `Progress: todo` and
`Result: none`; when revising an open plan, keep every existing task's
`Progress` and `Result` and never reset a `done` task. Work that changes or
extends a `done` task becomes a new task.

## Approval gate

```md
## Approval Gate

Status: pending | approved

## Decision Log

None.
```

A new `tasks.md` always starts at `Status: pending`. The gate covers `design.md`,
`tasks.md`, and any `delta.md` together; a `tasks.md` has no `Required`,
`Reason`, or `not-required` field and no `Execution` field, because completion is
the archive move. An instruction such as "implement it" given before both files
were presented does not approve them. Approval never marks execution complete.

## Revision rule

For every revision, including a repair handoff, preserve the existing gate when
scope, observable behavior, interfaces, schemas, and risk are unchanged. For a
material revision, append the change and its approval state to `## Decision Log`
and set `Status: pending`. A repair does not authorize a new behavior decision:
route unresolved decisions through `brainstorm-feature`.
