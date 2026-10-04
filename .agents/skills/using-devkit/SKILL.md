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

## Team Git workflow

Use one branch/PR per task; worktrees are optional. Keep repository and user
commit/push approval rules. When resolving conflicts in
`docs/agent-devkit/INDEX.md` or `docs/llm/INDEX.md`, preserve every task link
and verify all targets. Do not add locks or coordination tools.

## Routing map

| Task                                                         | Skill                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| First visit or missing repository conventions                | `setup-codebase`                                                           |
| Set up or refresh OpenEZ when needed and approved            | `setup-openez`                                                             |
| Understand affected code and callers                         | `read-codebase-context`                                                    |
| Pause unfinished work                                        | `context-handoff`                                                          |
| Resume paused work                                           | `context-handoff` Resume procedure                                         |
| Create or refresh the LLM wiki                               | `document-wiki`                                                            |
| Whole-repository simplicity audit                            | `lean-audit`                                                               |
| New or ambiguous feature                                     | `brainstorm-feature`; follow the handoff for its classification            |
| Exact, low-risk, non-bug change                              | `brainstorm-feature` impact check → `implement-task` → `review-and-verify` |
| Bug or possible bug                                          | `systematic-debugging`                                                     |
| Per-task AI estimate, when requested                         | `estimate-feature`                                                         |
| Turn an approved architectural design into an execution plan | `plan-feature`                                                             |
| Implement an approved design or plan                         | `implement-task` → `review-and-verify`                                     |

The explicit-change row applies only after `brainstorm-feature` verifies
eligibility; otherwise it uses the approval gate. The arrow marks a required
handoff.

After `brainstorm-feature` classifies the request, route a Spike to
investigation and reporting, a Bounded feature to `implement-task`, and an
Architectural feature through `plan-feature` before implementation. Implemented
work still goes through `review-and-verify`.

## Bug classification

- **Diagnostic investigation** — asks whether something is a bug or what is
  happening; `systematic-debugging` investigates and reports evidence.
- **Bounded bug** — fixes an existing flow without changing a shared interface,
  contract, or component boundary; `systematic-debugging` verifies the fix.
- **Architectural bug** — changes a shared interface, contract, component
  boundary, or spans components; use `brainstorm-feature` → `plan-feature` →
  `implement-task` → `review-and-verify`.

When classification is unclear, start with `systematic-debugging`; it upgrades
architectural bugs to the full route. Diagnostic investigation is distinct
from `brainstorm-feature`'s feasibility Spike. This skill routes only and
requires the full devkit skill set. In namespaced hosts use entries such as
`agent-devkit:review-and-verify`; direct installs use the bare skill name.
