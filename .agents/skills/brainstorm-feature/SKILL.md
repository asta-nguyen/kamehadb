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
  full process: questions, approaches, sectioned design, a written spec at
  `docs/agent-devkit/specs/YYYY-MM-DD-<issue-id>-<slug>-design.md` when the task
  has an issue ID, or the existing `YYYY-MM-DD-<slug>-design.md` form otherwise;
  then tell the user to invoke `plan-feature`. Use only an issue ID stated in
  the task or present in a linked artifact, including its filename; do not
  rename existing files.

When in doubt between two paths, take the heavier one. Hidden complexity
discovered mid-task upgrades the path — stop, say so, and step up. Nothing
downgrades mid-task.

## Process

1. Read `AGENTS.md` and relevant wiki pages when they exist. If the target has
   application source, call the Skill tool with "read-codebase-context" to
   establish the affected code path before asking questions. Otherwise, state
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
   - Ask one frontier question per message. State the known facts, ask for the
     material decision, and give a recommended answer with its main reason or
     tradeoff. The recommendation is a default to react to, not a decision made
     for the user.
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
     self-review `YYYY-MM-DD-<issue-id>-<slug>-design.md` when an issue ID is
     present, or `YYYY-MM-DD-<slug>-design.md` otherwise. Then create or update
     `docs/agent-devkit/INDEX.md` with a link to the exact file. Get the user's approval of
     the written spec, then tell the user to invoke `plan-feature`. Approval of
     the spec authorizes creation of the execution plan, not execution of a high-impact
     plan that does not exist yet. An instruction such as "implement it" given
     before the plan exists does not approve a later `Required: yes` plan gate.
     If the target has no
     `AGENTS.md` or application source, tell the user to invoke
     `setup-codebase` first so it can create the initial repository contract
     from the approved spec.

Keep the design proportionate. For a one-line fix with an unambiguous expected
result, the design may be one or two sentences, but wait for explicit approval
before implementation.

## Approval gate

Every path ends with the user approving your intent before implementation.
A todo list, a single-function utility, a config change — the design may be
two sentences in chat, but you MUST present it and get approval. "Simple" tasks
are where unexamined assumptions cause the most wasted work. What scales with
simplicity is the artifact, never the approval.

## Red flags

| Thought                                                                  | Reality                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| "This is too simple to need a design"                                    | Simple means a short design, not no design. Two sentences in chat, then approval.                          |
| "I'll call it bounded and skip the spec"                                 | Reaching for a label to skip work IS the doubt — take the heavier path.                                    |
| "It's bounded and the design is obvious — I'll start while they read it" | The gate is the approval, not the design's length. Present, then stop until you hear yes.                  |
| "I understand this kind of app, so it's bounded"                         | Bounded measures the repo, not your familiarity. A new project has no existing flow — it is architectural. |
| "The spike works, so I'll keep the code"                                 | A spike's output is an answer. Keeping the code is a new request — classify it.                            |
| "It grew, but I'm almost done — no need to re-classify"                  | Hidden complexity upgrades the path mid-task. Stop and say so.                                             |
| "They said implement after the spec, so the unseen plan is approved"     | Spec approval permits planning. A required plan gate can be approved only after the complete plan exists.  |

## Spec self-review (architectural path only)

Save the spec under `docs/agent-devkit/specs/`. This is a process artifact, not
a wiki page: never place a proposed design in `docs/llm/`.

Use `docs/agent-devkit/INDEX.md` as the process-artifact index. Link every
design from its `## Designs` section. When an Obsidian vault exists, targets
are relative to its root (for a `docs/` vault, for example:
`[[agent-devkit/specs/YYYY-MM-DD-<issue-id>-<slug>-design|Design]]`, omitting
`<issue-id>-` when unavailable). Otherwise use a relative Markdown link. The
design must include `## Related context` with links
only to existing `docs/llm/` pages read during brainstorming; write `None` when
there was no verified wiki context. Never add a link from `docs/llm/` back to a
design.

Flag and fix only issues that could change approved behavior, scope, plan
correctness, or execution. Do not block on wording preferences, stylistic
polish, or uneven detail that does not create ambiguity.

After writing the spec document, review it with fresh eyes before handing off:

1. **Placeholder scan** — any "TBD", "TODO", incomplete sections, or vague
   requirements? Fix them.
2. **Internal consistency** — do any sections contradict each other? Does the
   architecture match the feature descriptions?
3. **Scope check** — is this focused enough for a single implementation plan,
   or does it need decomposition?
4. **Ambiguity check** — could any requirement be interpreted two different
   ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on. Then ask
the user to review the spec and, after approval, tell them to invoke
`plan-feature`.
