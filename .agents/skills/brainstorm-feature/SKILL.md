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
  Implementation starts only after the user says yes. No spec file, no plan
  document.

- **Architectural** — new projects, new subsystems, changes that restructure
  how components fit together or alter interfaces others depend on. Follow the
  full process: questions, approaches, and a sectioned design. Save its spec
  under `docs/agent-devkit/specs/` with the `-design.md` suffix, follow the
  shared artifact naming rule in `using-devkit` (read it if it is not loaded),
  then tell the user to invoke `plan-feature`.

When in doubt between two paths, take the heavier one. Hidden complexity
discovered mid-task upgrades the path — stop, say so, and step up. Nothing
downgrades mid-task.

## Process

1. Read `AGENTS.md` and relevant wiki pages when they exist. If the target has
   application source, call the available Skill entry whose local name is
   `read-codebase-context` to establish the affected code path before asking
   questions. Otherwise, state
   that the project is new and establish scope from the user's request; there
   is no code path to trace.
2. If the project is too large for a single spec, help the user decompose into
   sub-projects: what are the independent pieces, how do they relate, what
   order should they be built? Then brainstorm the first sub-project through
   the normal flow. Each sub-project gets its own spec → plan → implementation
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
5. Present the design in short sections and ask for approval before planning.
   Do not write production code while material decisions remain unresolved.
6. After approval, follow the selected path:
   - Spike: investigate and report a recommendation; keep probe code throwaway.
   - Bounded: tell the user to invoke `implement-task`; do not create a plan
     file.
   - Architectural: create `docs/agent-devkit/specs/` if needed, write and
     self-review the spec, present it, and wait for approval before creating or
     updating `docs/agent-devkit/INDEX.md` with a link to the exact file. Then tell the
     user to invoke `plan-feature`. Approval of the spec authorizes creation of
     the execution plan, not execution of a high-impact plan that does not yet
     exist. An instruction such as "implement it" given before the plan exists
     does not approve a later `Required: yes` plan gate.
     If the target has no
     `AGENTS.md` or application source, tell the user to invoke
     `setup-codebase` first so it can create the initial repository contract
     from the approved spec.

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

When eligible, post this non-blocking notice, then call the available
`implement-task` Skill entry without waiting:

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
