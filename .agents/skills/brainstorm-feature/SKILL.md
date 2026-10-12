---
name: brainstorm-feature
description: Use when a user request is new, ambiguous, affects product behavior, or has unresolved scope, UX, API, data, or compatibility decisions.
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
  document. After approval, write a `delta.md` in a change folder only when the
  delta condition holds (a `docs/llm/` requirement needs `ADDED`, `MODIFIED`, or
  `REMOVED`), before `implement-task`.

- **Architectural** — new projects, new subsystems, changes that restructure
  how components fit together or alter interfaces others depend on. Follow the
  full process: questions and approaches. Once material decisions are settled,
  write the sectioned design straight to `design.md` in a change folder under
  `docs/agent-devkit/changes/` (naming rule in `using-devkit`; read it if it is
  not loaded), plus `delta.md` when the delta condition holds, then call
  `plan-feature` to write `tasks.md`. The user approves `design.md`,
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
     proposed behavior can introduce that risk. Resolve applicable invalid
     input, authorization, duplicate or concurrent operations, partial failure,
     retry and recovery, lifecycle, external-system failure, and compatibility
     or migration behavior. Omit impossible branches; explain an omission only
     when its reason is not obvious from the repository or approved design.
   - Drill further on a vague, partial, or contradictory answer before moving
     to another branch. When the user says "standard", "whatever", or similar,
     propose one concrete interpretation and ask them to confirm it.
   - Find repository and platform facts yourself. Do not ask the user for
     information available from source, tests, documentation, or tools.
   - Do not ask low-impact implementation questions or inflate the interview
     to appear thorough. Before presenting the design, check every applicable
     branch and continue questioning whenever an unresolved answer could
     materially change the design.
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
   `tasks.md` and presents all of them for one joint approval. The folder is
   not indexed before that approval. If a delta targets a legacy
   `## Business rules` page, use the affected pages named by the task as its
   selection; after the `document-wiki` Task updates conversion, write
   `delta.md` and continue. Do not write production code while material
   decisions remain unresolved.
6. After approval, follow the selected path:
   - Spike: investigate and report a recommendation; keep probe code throwaway.
   - Bounded: when the delta condition holds, write `delta.md` in a change
     folder and index it under `## Changes`; then call `implement-task`.
   - Architectural: `plan-feature` records the joint approval, indexes the
     folder, calls `setup-codebase` when the target has no `AGENTS.md` or
     application source, and then calls `implement-task`.

   Whenever this skill stops for an answer or approval, end with the `Next:`
   block from `using-devkit`.

For follow-up work, apply the change lifecycle in `using-devkit`. If the
related change is open, revise its files in place; do not create a new folder:
`tasks.md` through `plan-feature`, and a `delta.md` here. After a change is
archived, start a new one: a bounded follow-up that needs no folder writes
nothing, and an architectural follow-up creates a new change folder. An open
legacy plan is revised in place by `plan-feature`; a completed legacy plan is
history.

## Change folder and delta

A change that produces any file in the table keeps one folder under
`docs/agent-devkit/changes/YYYY-MM-DD-<issue-id>-<slug>/` (an issue ID only when
one is provided). Files and owners:

| File           | Owner                              | When                                                                   |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `design.md`    | this skill                         | Architectural changes                                                  |
| `delta.md`     | this skill, `systematic-debugging` | When a `docs/llm/` requirement needs `ADDED`, `MODIFIED`, or `REMOVED` |
| `tasks.md`     | `plan-feature`                     | Architectural changes                                                  |
| `estimate.md`  | `estimate-feature`                 | When an estimate is requested for a change with `tasks.md`             |
| `decisions.md` | `implement-task`                   | When a persistent decision occurs                                      |
| `handoff.md`   | `context-handoff`                  | When the change pauses                                                 |

- **Delta condition (the only one):** write `delta.md` only when a requirement
  in `docs/llm/` needs `ADDED`, `MODIFIED`, or `REMOVED`. New behavior needs
  `ADDED` when its domain already has a page; behavior in a domain with no page
  needs no delta; after code checks, `document-wiki` creates scoped coverage
  for that behavior before final review.
  Code that restores a correctly documented requirement needs none. A repository
  with no `docs/llm/` writes no delta. This applies the same way to
  Architectural, Bounded, explicit-change, and bug-fix work.
- **Folder condition:** a change gets a folder when it produces any file in the
  table. An Architectural change always has `design.md` and `tasks.md`; a
  Bounded, explicit-change, or bug-fix change has a folder only when it needs a
  file there.
- **Index:** add an Architectural folder under `## Changes` in
  `docs/agent-devkit/INDEX.md` only after joint approval; keep an unapproved
  draft unindexed. For Bounded, explicit-change, and bug-fix work, add the link
  when the folder is created. `review-and-verify` moves the link to
  `## Archived changes` at archive.
- **Ownership:** the design assigns each affected requirement to exactly one
  change. A delta never targets a requirement assigned to another open change.
- **Issue IDs:** include an issue ID in the folder name when the task or a
  related artifact provides one, and record `Issue: <id>` in each change
  artifact that exists (`design.md` and/or `delta.md`); never infer one.
  Requirements and wiki pages carry no issue IDs.
- **Legacy target pages:** if a page the delta targets still uses
  `## Business rules`, the design names each page to convert, and conversion
  through `document-wiki` happens before the delta is written. Pages explicitly
  identified as affected by the task are selected automatically for Task
  updates; ask only when their scope or intended behavior is unclear. A page
  marked `[~]` as a `verification limit` cannot be
  converted: stop and report the missing evidence. A request that needs a conversion is not eligible for
  the explicit-change lane; use the Bounded path.
- `design.md` uses the sectioned design and has no `## Execution` link, because
  `tasks.md` shares the folder.

`delta.md` shape:

`````md
# Delta

Issue: ENG-123

## ADDED Requirements

### PAY-refund-partial

Page: `docs/llm/domains/payments.md`
Search: checked every page with prefix PAY; no existing requirement covers this.

Requirement:

```md
### PAY-refund-partial

The system SHALL allow a refund smaller than the remaining captured amount.

#### Scenario: partial refund accepted

- GIVEN a payment captured for 100
- WHEN a refund of 40 is requested
- THEN 40 is refunded and 60 remains refundable

Evidence: `src/payments/refund.ts`, `test/payments/refund.test.ts`
```

## MODIFIED Requirements

### PAY-refund-cap

Previously: rejected any refund after a prior partial refund.

Baseline:

```md
<complete current wiki block for PAY-refund-cap, copied verbatim>
```

Replacement:

```md
<complete new block for PAY-refund-cap>
```

## REMOVED Requirements

### PAY-remember-card

Reason: replaced by saved payment methods in the wallet flow.

Baseline:

```md
<complete current wiki block for PAY-remember-card, copied verbatim>
```
`````

Delta rules:

- Metadata (`Issue:`, `Page:`, `Search:`, `Previously:`, `Reason:`, and the
  labels `Requirement:`, `Baseline:`, `Replacement:`) sits outside the
  four-backtick blocks and is never copied to the wiki. Only a fenced block is a
  wiki block: it starts at its `### <ID>` heading and is copied and compared
  unchanged. `ADDED` has one `Requirement:` block, `MODIFIED` has `Baseline:`
  and `Replacement:`, and `REMOVED` has one `Baseline:`.
- Every `Requirement:` and `Replacement:` block uses `document-wiki`'s
  requirement format (ID-only heading, one `SHALL`, at least one scenario,
  `Evidence:`). "Exactly" means equal after trimming leading and trailing blank
  lines.
- `ADDED` requires `Page:` (the target page as a repository-relative path in
  code format, not a link) and `Search:` (every page using the prefix was
  searched and no existing requirement covers the behavior). The ID uses a
  prefix already registered in `## Requirement prefixes`; a delta never
  registers a prefix.
- `MODIFIED` has `Previously:`, a verbatim `Baseline:` block, and a complete
  `Replacement:`; rewording keeps the ID. `REMOVED` has `Reason:` and the same
  verbatim `Baseline:`. A substantially different behavior is `REMOVED` plus
  `ADDED` under a new ID; removed IDs are never reused.
- Omit empty sections; a delta with no section is invalid — omit the file.
- Before archive a `Requirement:`/`Replacement:` `Evidence:` may name planned
  paths; at archive every path must exist and support the requirement. Links
  from change files to `docs/llm/` are allowed; `docs/llm/` never links to a
  change folder.

Keep the design proportionate. For a one-line fix with an unambiguous expected
result, the design may be one or two sentences, but wait for explicit approval
before implementation.

## Approval gate

The default gate requires the user to approve the presented design before
implementation. A request may use the explicit-change lane only when all are
true: it names the exact change and file or symbol with an unambiguous result;
the `read-codebase-context` impact map shows every affected caller, consumer,
test, config, persisted-data path, and wiki page lies within the named scope;
and it touches no public API, schema, dependency, CI, security boundary, or
data-loss risk and is not a bug fix. Bugs go to `systematic-debugging`.

When eligible and the delta condition holds, write `delta.md` in a change folder
before the notice. A request that needs a legacy page conversion is not eligible
for this lane; use the Bounded path. Then post this non-blocking notice and call
the available `implement-task` Skill entry without waiting:

```text
Explicit change: <change>. Impact checked: <entry, callers, tests>.
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
