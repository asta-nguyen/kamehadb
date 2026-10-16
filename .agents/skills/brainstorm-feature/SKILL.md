---
name: brainstorm-feature
description: Use when a request is new, ambiguous, affects product behavior, or has unresolved scope, UX, API, data, or compatibility decisions, before any design or code.
---

# Brainstorm Feature

Do not start implementation from an unclear request.

## Classify the task first

Before your first question, classify the request and state the classification
out loud so the user can override it:

- **Spike** — a feasibility question ("can we…", "is it possible…", "quick and
  dirty is fine") whose output is an answer, not code you keep. Present the
  question and what you will try in 2-3 sentences, get a nod, then investigate
  as cheaply as correctness allows. No design doc, no spec file. Report
  findings as a recommendation; anything built stays labeled throwaway.

- **Bounded** — a well-scoped change to code that already exists in this repo:
  a new flag, a small endpoint, a one-file fix. Bounded means the flow you are
  changing is already here to read. If there is no existing flow to change, the
  task is not bounded. Ask the clarifying questions that matter, present a
  short design in chat (a few sentences to a few short paragraphs), and STOP.
  Implementation starts only after the user says yes. No spec file, no tasks
  document. After approval, write a `delta.md` only when the delta condition in
  `using-devkit`'s `## Change lifecycle` holds, before `implement-task`.

- **Architectural** — new projects, new subsystems, changes that restructure
  how components fit together or alter interfaces others depend on. Follow the
  full process: questions and approaches. Once material decisions are settled,
  write the design straight to `design.md` (required headings in
  `references/spec-self-review.md`) in a change folder
  (`using-devkit`'s `## Change lifecycle`), plus `delta.md` when the delta
  condition holds, then call `plan-feature` to write `tasks.md`. The user approves `design.md`,
  `tasks.md`, and any `delta.md` together, once.

When in doubt between two paths, take the heavier one. Hidden complexity
discovered mid-task upgrades the path — stop, say so, and step up. Nothing
downgrades mid-task.

## Process

1. Read `AGENTS.md` and relevant wiki pages when they exist. If the target has
   application source, call the available Skill entry whose local name is
   `read-codebase-context` to establish the affected code path before asking
   questions. Otherwise, state
   that the project is new and establish scope from the user's request; there
   is no code path to trace. For follow-up work, read related specs and plans
   and apply the plan lifecycle in `using-devkit` before classifying the new
   request. A completed plan is evidence of prior scope, not approval for new
   scope.
2. If the project is too large for a single spec, help the user decompose into
   sub-projects: what are the independent pieces, how do they relate, what
   order should they be built? Then brainstorm the first sub-project through
   the normal flow. Each sub-project gets its own design → tasks → implementation
   cycle.
3. Build an internal decision tree before asking questions. Start from the
   intended user, problem, and observable success, then add only applicable
   branches for scope and flows, permissions and security, data and lifecycle,
   interfaces and compatibility, failure and recovery, and rollout and
   verification. A decision is settled only when the answer is concrete,
   consistent with known facts, and sufficient to choose a design. Recompute
   the unresolved frontier after every answer.
   - Ask one frontier question per message. You may batch up to three only
     when their answers do not depend on each other; keep dependent questions
     sequential. For each, state known facts, ask for the material decision,
     and recommend an answer with its main reason or tradeoff. The
     recommendation is a default to react to, not a decision made for the user.
   - For a straightforward decision with one clearly preferable path, present
     only that recommendation and its reason. When viable approaches materially
     differ in behavior, complexity, compatibility, cost, or risk, present two
     or three options, recommendation first, and explain the consequential
     trade-offs. Do not manufacture alternatives for an obvious choice.
   - Treat a failure or edge-case branch as applicable when current source or
     proposed behavior can introduce that risk: invalid input, authorization,
     duplicate or concurrent operations, partial failure, retry and recovery,
     lifecycle, external-system failure, compatibility or migration. Omit
     impossible branches; explain an omission only when it is not obvious.
   - Drill further on a vague, partial, or contradictory answer before moving
     to another branch. When the user says "standard", "whatever", or similar,
     propose one concrete interpretation and ask them to confirm it.
   - Find repository and platform facts yourself. Do not ask the user for
     information available from source, tests, documentation, or tools.
   - Do not ask low-impact implementation questions or inflate the interview.
     Before presenting the design, check every applicable branch and keep
     questioning while an unresolved answer could materially change it.
4. Offer the smallest viable design first. Include scope, observable behavior,
   affected interfaces/files, error cases, and verification approach.
   For a source-less new project, also state the approved runtime, package or
   build tool, first entry point, and how the first behavior will be verified.
   Do not require a unit-test runner without a concrete need. If the runtime,
   build tool, or first entry point is undecided, continue clarifying before
   presenting the design for approval.
5. Get one approval. For a Spike or Bounded task, present the design in chat
   in short sections and ask for approval. For an Architectural task, skip the
   chat approval: create the change folder, write `design.md` and any
   `delta.md`, self-review them, and call `plan-feature`, which writes
   `tasks.md` and presents all of them for one joint approval. Do not write
   production code while material decisions remain unresolved.
6. After approval, follow the selected path:
   - Spike: investigate and report a recommendation, keeping probe code
     throwaway; end with the `Next:` block.
   - Bounded: when the delta condition holds, write `delta.md` with its
     `Approved:` line in a change folder; then call `implement-task`. Without a
     folder, the approval lives only in this conversation; `context-handoff`
     records it if the work pauses.
   - Architectural: `plan-feature` records the joint approval, calls
     `setup-codebase` when the target has no `AGENTS.md` or application source,
     and then calls `implement-task`.

   Whenever this skill stops for an answer or approval, end with the `Next:`
   block from `using-devkit`.

For follow-up work, apply `using-devkit`'s `## Change lifecycle`: revise an open
change's files in place (`tasks.md` through `plan-feature`, `delta.md` here);
after it is archived, start a new change.

## Change folder and delta

A change that produces any file in the table keeps one folder
(`using-devkit`'s `## Shared rules` owns its naming and `## Change lifecycle` its
indexing and delta condition). Files and owners:

| File           | Owner                              | When                                                                   |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `design.md`    | this skill                         | Architectural changes                                                  |
| `delta.md`     | this skill, `systematic-debugging` | When a `docs/llm/` requirement needs `ADDED`, `MODIFIED`, or `REMOVED` |
| `tasks.md`     | `plan-feature`                     | Architectural changes                                                  |
| `estimate.md`  | `estimate-feature`                 | When an estimate is requested for a change with `tasks.md`             |
| `decisions.md` | `implement-task`                   | When a persistent decision occurs                                      |
| `handoff.md`   | `context-handoff`                  | When the change pauses                                                 |

- **Delta condition:** applies to Architectural, Bounded, clear-small-change, and
  bug-fix work alike. New behavior needs `ADDED` when its domain already has a
  page; a domain with no page gets scoped coverage from `document-wiki` after
  the code checks, before final review.
- **Ownership:** the design assigns each affected requirement to exactly one
  change. A delta never targets a requirement assigned to another open change.
- **Issue IDs:** when the folder name carries one, record `Issue: <id>` in each
  change artifact that exists (`design.md` and/or `delta.md`). Requirements and
  wiki pages carry no issue IDs.
- **Legacy target pages:** if a page the delta targets still uses
  `## Business rules`, the design names each page to convert, and
  `document-wiki`'s `## Convert a legacy target page` runs before the delta is
  written. Pages the task explicitly names are selected automatically; ask only
  when their scope or intended behavior is unclear. A page marked `[~]` as a
  `verification limit` cannot be converted: stop and report the missing
  evidence. A request that needs a conversion is not eligible for the
  clear-small-change lane; use the Bounded path.

Read `references/delta-format.md` when writing or self-reviewing a `delta.md`; it owns
the delta shape, rules, and self-review.

Keep the design proportionate. For a one-line fix with an unambiguous expected
result, the design may be one or two sentences, but wait for explicit approval
before implementation.

## Approval gate

The default gate requires the user to approve the presented design before
implementation. A request may use the clear-small-change lane only when it meets
all four clear-small-change conditions in `using-devkit`'s `## Task flows`, with
the `read-codebase-context` impact map showing every affected caller, consumer,
test, config, persisted-data path, and wiki page inside the named scope. Bugs go
to `systematic-debugging`.

When eligible and the delta condition holds, write `delta.md` in a change folder
before the notice. A request that needs a legacy page conversion is not eligible
for this lane; use the Bounded path. Then post this non-blocking notice and call
the available `implement-task` Skill entry without waiting:

```text
Clear, small change: <change>. Impact checked: <entry, callers, tests>.
No other affected callers. Verify: <check, run before and after>.
```

If extra impact is found, list what the user may not know plus a short design,
then wait for approval. If hidden impact appears during implementation, stop
and return to this gate. `review-and-verify` remains mandatory.

## Red flags

| Thought                                                | Reality                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| "The user named the line, so nothing else is affected" | Trace first; any impact outside the named location returns to the gate. |

## Spec self-review (architectural path only)

When writing or self-reviewing an architectural spec, read
`references/spec-self-review.md` before continuing.
