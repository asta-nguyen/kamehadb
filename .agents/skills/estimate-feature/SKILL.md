---
name: estimate-feature
description: Use when a user, BA, PM, or delivery team requests an effort estimate for a completed feature implementation plan.
---

# Estimate Feature

Estimate active engineering hours for a developer using an AI coding agent.
Never run this optional skill unless the user requests an estimate.

## Process

1. Require a completed plan under `docs/agent-devkit/plans/`. If none exists,
   tell the user to invoke `plan-feature` only when the user also requested a
   plan and an approved design exists; otherwise stop and request a plan. Never
   estimate directly from a feature request.
2. Read `AGENTS.md`, the plan, linked design, relevant wiki, source, and tests.
   Call the available Skill entry whose local name is `read-codebase-context`
   when source exists. If
   tasks omit files, behavior, or verification, tell the user to invoke
   `plan-feature`.
3. State the AI support profile. Assume the coding agent can inspect and edit
   source, write and run tests, and update documentation, while a developer
   reviews output and resolves product decisions. Include context gathering,
   prompting, coding, tests, expected debugging, review, and planned docs.
   Exclude waiting, stakeholder response, deployment, and manual QA unless
   planned.
4. Estimate every plan task with an hours range, confidence, and evidence-based
   rationale. Consider local patterns, novelty, touched files, migrations,
   integrations, test cost, and unresolved dependencies. Never apply a generic
   "AI is N% faster" discount. Mark a task `Blocked: spike required` when an
   unknown prevents a defensible range; do not hide uncertainty in a buffer.
5. Save a new estimate at
   `docs/agent-devkit/estimates/YYYY-MM-DD-<issue-id>-<slug>-estimate.md` when
   the task or linked plan (including its filename) has an issue ID; otherwise
   use the existing
   `YYYY-MM-DD-<slug>-estimate.md` form. Use only the exact issue ID provided,
   do not rename existing estimates, and link to the exact plan filename. Use:

   ```md
   # Feature Estimate

   ## Plan

   - <link to the exact plan file>

   ## AI support profile

   <included effort and exclusions>

   ## Task estimates

   | Plan task      | Hours | Confidence | Basis and risks                 |
   | -------------- | ----: | ---------- | ------------------------------- |
   | Task 1: <name> |  2-4h | Medium     | <repo evidence and uncertainty> |

   ## Total

   - Active engineering effort: <sum of estimable task ranges>
   - Confidence: <High, Medium, or Low>

   ## Open unknowns

   - <blocked items or "None">
   ```

6. Add `## Estimate` with a link to the estimate in the plan, and add the
   estimate to `docs/agent-devkit/INDEX.md` under `## Estimates`. When an
   Obsidian vault exists, targets are relative to its root; otherwise use
   relative Markdown links. Never add process-artifact links to `docs/llm/`.
7. Treat the estimate as stale when the linked plan's tasks, files, behavior,
   verification, or assumptions change. On refresh, compare the whole current
   plan with the estimate, then update the same estimate file and totals.
8. Verify every plan task appears exactly once, range totals are correct, all
   links resolve, and `git diff --check` passes. Do not edit application code,
   start implementation, or create a commit.

## Red flags

| Thought                          | Reality                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| "AI makes this 50% faster"       | Estimate the actual repo task; generic discounts are fiction.      |
| "Three hours exactly"            | Use a range that exposes uncertainty.                              |
| "I'll skip review and test time" | AI-assisted delivery still includes human review and verification. |
| "The plan is close enough"       | Missing task detail makes the estimate unsupported.                |
| "I'll add a safety buffer"       | Name the risk or require a spike.                                  |
