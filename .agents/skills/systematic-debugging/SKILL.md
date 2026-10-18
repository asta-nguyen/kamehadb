---
name: systematic-debugging
description: Use when investigating any technical issue, including test failures, bugs, unexpected behavior, performance problems, or build failures, especially under time pressure or after failed fixes.
---

# Systematic Debugging

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you cannot propose fixes. Symptom fixes are
failure.

## When to use

Use for any technical issue: test failures, bugs, unexpected behavior,
performance problems, build failures, integration issues.

**Especially when:** under time pressure (emergencies make guessing tempting),
"just one quick fix" seems obvious, a previous fix did not work, or you do not
fully understand the issue. **Do not skip when** the issue seems simple (simple
bugs have root causes too) or you are in a hurry (rushing guarantees rework).

## The four phases

When `implement-task` calls this skill to repair an active task, keep that task's
scope and approval. Investigate and verify the fix, then return evidence and
blockers to the caller; do not run final review, archive the parent change, or
mark its task done here. A fix needing new behavior or scope returns that
decision to the caller's approval flow. Standalone debugging runs the full route.
Complete each phase before the next.

### Phase 1: Root cause investigation

Before attempting any fix:

1. **Read error messages carefully** — read stack traces completely; note line
   numbers, file paths, and error codes.
2. **Reproduce consistently** — what are the exact steps? If you cannot
   reproduce, gather more data; do not guess.
3. **Check recent changes** — `git diff`, recent commits, new dependencies,
   config and environment differences. Use `review-and-verify`'s
   `### Trace changed callers` to list changed symbols and trace callers and
   string/route/config variants. Name the traced callers so Phase 4 can verify
   each one.
4. **Gather evidence in multi-component systems** — add diagnostic logging at
   each component boundary (what enters and exits each layer) and run once to see
   where it breaks. Treat added logs as temporary: remove them before reporting a
   Bug question result or entering Phase 4, and leave none in the final diff
   unless the approved fix requires it.
5. **Trace data flow** — where does the bad value originate, and what called this
   with it? Keep tracing up to the source and fix there, not at the symptom.

### Phase 2: Pattern analysis

Find working similar code in the same codebase; read any reference
implementation completely; list every difference between working and broken, however
small; and identify the settings, config, environment, or assumptions it needs.

### Phase 3: Hypothesis and testing

1. **Form a single hypothesis** — "I think X is the root cause because Y".
2. **Test minimally** — the smallest possible change, one variable at a time.
   Revert experimental changes after observing, so Phase 4 starts from the
   failing baseline.
3. **Verify before continuing** — worked → Phase 4; not → a new hypothesis. Do
   not stack fixes.
4. **When you do not know**, say "I don't understand X"; ask or research.

### Phase 4: Implementation

1. **Classify the bug** before any fix or verify plan, with the `Bounded` and
   `Architectural` labels from `brainstorm-feature`, or `Bug question` for an
   investigation-only request:
   - **Bug question** — the real question is "is this a bug?" or "what is
     happening?", not "fix it". The output is an answer with reproduction
     evidence; write no production code. Report the evidence and stop. If a real
     fix is needed, re-classify as Bounded or Architectural first. It is distinct
     from `brainstorm-feature`'s feasibility `Spike`.
   - **Bounded** — the fix stays within an existing flow and changes no shared
     interface, contract, or component boundary. File count alone does not
     classify the bug. Go to step 2.
   - **Architectural** — the fix changes a shared interface, contract, or
     component boundary, or spans components. Stop fixing and call
     `brainstorm-feature` (it writes `design.md`, and `plan-feature` writes
     `tasks.md`, for one joint approval) before any fix. A verify plan cannot
     cover regression surface that was never designed. For a repair inside an
     active implementation, return this diagnosis to the caller; a fix already
     covered by that plan's approved scope and verification proceeds within it.

   When in doubt take the heavier class. Hidden complexity found mid-fix moves
   the bug up; nothing moves it down.

2. **Establish expected behavior** from source, tests, and wiki pages. If they do
   not establish it, stop and call `brainstorm-feature` for approval before
   changing behavior.
3. **Write the verify plan** before any regression check or production fix: the
   checkable claims that prove the bug is fixed. The original symptom no longer
   occurs (Phase 1 steps) and a repeatable check of it passes; traced callers and
   relevant existing tests do not regress (name them; an uncovered caller is a
   verification limit); any contract the fix touches still holds (state it and
   how it is checked). This list defines "fixed": step 9 checks the diff against
   it, and `review-and-verify`'s "Bug fixed" row requires it. Without it, "fixed"
   is a feeling, not a fact; do not proceed to step 4.
4. **Choose a repeatable regression check** that reproduces the symptom: an
   existing test runner when meaningful, else an available CLI, self-check, or
   recorded manual procedure with an expected result. Set up no test runner solely
   for this fix.
5. **Verify the check fails** without the fix.
6. **Apply the smallest root-cause fix**, reusing the verified working pattern
   from Phase 2. A symptom patch is not minimal if sibling callers stay broken.
7. **Verify the same check passes**, then **run relevant existing tests** for
   regressions; do not invent a suite. `review-and-verify` runs the
   repository-mandated full commands.
8. For a repair handoff, return the verify-plan result, reproduction/regression
   evidence, affected callers, and any documentation or scope issue to
   `implement-task`, and skip step 9.
9. Otherwise, when the delta condition in `using-devkit`'s `## Change lifecycle`
   holds, write `delta.md` in a change folder before review per
   `../brainstorm-feature/references/delta-format.md` (shape, ownership, `Issue:`,
   self-review). If the target page still
   uses `## Business rules`, convert it with `document-wiki`'s
   `## Convert a legacy target page` first, and stop if it is marked
   `verification limit`. After the code checks pass, call `document-wiki`'s
   `## Task updates` when the existing wiki needs an in-scope update or delta
   merge (skip without a wiki; leave a page that already describes the intended
   behavior alone). Then call the available Skill entry whose local name is
   `review-and-verify` to review the diff against the step 3 verify plan. Missing
   task coverage or a page that contradicts the fix stays a blocker until
   refreshed and verified. If the review returns `Status: fail`, apply `implement-task`'s
   `## After implementation` step 3; a blocker whose fix changes a shared
   interface, contract, or component boundary reclassifies the bug as
   Architectural (step 1).
10. Do not commit (`using-devkit`). When debugging stops before review (a Bug
    question result, an Architectural handoff, or missing expected behavior), end
    with the `Next:` block from `using-devkit`.

## Red flags — stop and return to Phase 1

- "Quick fix for now, investigate later" / "Just try changing X and see"
- "Add multiple changes, run tests" / "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "I'll know it's fixed when I see it" (no written verify plan)
- "It's just a bug, no need to classify" (skipping Bug question/Bounded/Architectural)
- "The fix touches one file, so it's bounded" (interface and contract impact is
  the test, not file count)
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)
- Each fix reveals a new problem in a different place

**All of these mean: stop. Return to Phase 1.** If 3+ fixes have failed, question
the architecture: the pattern is wrong, not the implementation.

## When process reveals "no root cause"

If investigation shows the issue is truly environmental, timing-dependent, or
external: document what you investigated and the evidence for that conclusion
(for a Bug question, report it and stop without changing production behavior). If
handling such as a retry, timeout, error message, or monitoring change is needed,
return to Phase 4: classify it, establish expected behavior, and write the verify
plan first, because these changes alter observable behavior; if sources do not
establish the intended behavior, call `brainstorm-feature` and wait for approval.
But 95% of "no root cause" cases are incomplete investigation.
