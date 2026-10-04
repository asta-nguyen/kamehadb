---
name: using-devkit
description: Use when starting any task in a repo with agent-devkit installed, including feature work, bug fixes, reviews, documentation, estimates, unfamiliar requests, or choosing another devkit skill.
---

# Using Devkit

Choose the owning workflow skill, then follow that skill's instructions.

## Skill names

Skill references use their local name, such as `review-and-verify`. In a
namespaced plugin host, invoke the available entry with that local name, such
as `agent-devkit:review-and-verify`; in a direct skills install, invoke the
bare local name.

## Priority rule

**Read context before changing code.** Run `read-codebase-context` (or
`setup-codebase` on a first visit) before any edit.

## Team Git workflow

Use the team's one-branch/PR-per-task workflow; worktrees are optional. Keep
repository and user commit/push approval rules. Use issue IDs present in the
task or a linked artifact, including its filename; never infer one. When
resolving conflicts in `docs/agent-devkit/INDEX.md` or `docs/llm/INDEX.md`,
preserve links from every task and verify every target after the merge. Do not
add locks or coordination tools.

## Routing map

| Task type                                                       | Skill                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| First visit to a repo missing context or repository conventions | `setup-codebase`                                                               |
| Set up or refresh OpenEZ when needed and approved               | `setup-openez`                                                                 |
| Understand code before changing it                              | `read-codebase-context`                                                        |
| Checkpoint unfinished work before pausing                       | `context-handoff`                                                              |
| Document existing app features                                  | `document-wiki`                                                                |
| Audit a whole repository for over-engineering or bloat          | `lean-audit`                                                                   |
| Small feature in an existing flow                               | `brainstorm-feature` → `implement-task` → `review-and-verify`                  |
| Architectural feature                                           | `brainstorm-feature` → `plan-feature` → `implement-task` → `review-and-verify` |
| Bug or possible bug                                             | `systematic-debugging`                                                         |
| Per-task AI-assisted estimate (optional)                        | `estimate-feature`                                                             |
| Implement an already approved design or plan                    | `implement-task` → `review-and-verify`                                         |

A bounded feature uses a short chat design and approval, with no spec or plan
file. Architectural work uses an approved spec before planning and follows any
required plan approval gate. Bounded bug fixes are verified after debugging;
architectural bugs hand off to the spec/plan route.

Run skills in the listed order when a task spans several. The arrow (`→`)
marks a required handoff: the left skill's output feeds the right one.

### Bug classification

A "fix issue A" request is not one shape. Use the vocabulary owned by
`brainstorm-feature` and enforced during `systematic-debugging`:

- **Spike bug** — the real question is "is this actually a bug?" or "what is
  happening?" Route to `systematic-debugging` for an evidence-backed answer.
- **Bounded bug** — the fix stays within an existing flow without changing a
  shared interface, contract, or component boundary. Route to
  `systematic-debugging`.
- **Architectural bug** — the fix changes a shared interface, contract, or
  component boundary, or spans multiple components. Route through the full
  architectural workflow in the table.

When the type is not yet clear from the request, route to
`systematic-debugging`; it classifies after investigation (Phase 4 step 1) and
hands off to `brainstorm-feature` if the bug turns out to be architectural.

This skill routes only. Do not use it without the full devkit skill set.

## Red flags

| Thought                                                | Reality                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| "It's just a quick fix, skip the skill"                | Quick fixes still touch callers and contracts. `read-codebase-context` first, every time.                          |
| "Routing is overhead, I'll just start editing"         | Improvising skips context and verification; the devkit skills exist to enforce both.                               |
| "I can fold `review-and-verify` into `implement-task`" | They are separate for a reason: the implementer is not its own reviewer.                                           |
| "I'll classify after I start fixing"                   | Classification decides the route. Classify before routing; re-classify only upgrades to the heavier path mid-task. |
