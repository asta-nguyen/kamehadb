---
name: systematic-debugging
description: Use when investigating any technical issue, including test failures, bugs, unexpected behavior, performance problems, or build failures, especially under time pressure or after failed fixes.
---

# Systematic Debugging

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you cannot propose fixes. Symptom fixes
are failure.

## When to use

Use for any technical issue: test failures, bugs, unexpected behavior,
performance problems, build failures, integration issues.

**Especially when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- Previous fix did not work
- You do not fully understand the issue

**Do not skip when:**

- Issue seems simple (simple bugs have root causes too)
- You are in a hurry (rushing guarantees rework)

## The four phases

You must complete each phase before proceeding to the next.

### Phase 1: Root cause investigation

**Before attempting any fix:**

1. **Read error messages carefully** — do not skip past errors or warnings.
   Read stack traces completely. Note line numbers, file paths, error codes.
2. **Reproduce consistently** — can you trigger it reliably? What are the
   exact steps? If not reproducible, gather more data; do not guess.
3. **Check recent changes** — `git diff`, recent commits, new dependencies,
   config changes, and environmental differences. Use the caller-tracing
   procedure in `review-and-verify` to list changed symbols, check staged and
   unstaged tracked changes plus untracked paths with `git status --short`,
   and trace callers and string/route/config variants using FFF multi-pattern
   grep or `rg`. Name the traced callers so Phase 4 can verify each one.
4. **Gather evidence in multi-component systems** — when a system has
   multiple components (API → service → database), add diagnostic logging
   at each component boundary before proposing fixes. Log what enters and
   exits each layer. Run once to see where it breaks. Treat added logs as
   temporary diagnostics: remove them after the trace, before reporting a
   Diagnostic investigation result or entering Phase 4. Do not leave temporary
   logging in the final diff unless the approved fix requires it.
5. **Trace data flow** — where does the bad value originate? What called
   this with the bad value? Keep tracing up until you find the source. Fix
   at the source, not at the symptom.

### Phase 2: Pattern analysis

1. **Find working examples** — locate similar working code in the same
   codebase. What works that is similar to what is broken?
2. **Compare against references** — if implementing a pattern, read the
   reference implementation completely. Do not skim.
3. **Identify differences** — list every difference between working and
   broken, however small. Do not assume "that can't matter".
4. **Understand dependencies** — what settings, config, environment, or
   assumptions does this need?

### Phase 3: Hypothesis and testing

1. **Form a single hypothesis** — state clearly: "I think X is the root
   cause because Y". Be specific.
2. **Test minimally** — make the smallest possible change to test the
   hypothesis. One variable at a time. Do not fix multiple things at once.
   Revert experimental code changes after observing the result so Phase 4
   starts from the failing baseline.
3. **Verify before continuing** — did it work? Yes → Phase 4. No → form a
   new hypothesis. Do not add more fixes on top.
4. **When you do not know** — say "I don't understand X". Do not pretend.
   Ask for help or research more.

### Phase 4: Implementation

1. **Classify the bug.** Before any fix or verify plan, use the shared
   `Bounded` and `Architectural` labels from `brainstorm-feature`. A
   bug-focused investigation-only request uses the distinct
   `Diagnostic investigation` category:
   - **Diagnostic investigation** — the real question is "is this actually a
     bug?" or "what is happening?", not "fix it." Output is an answer with
     reproduction evidence; do not write production code. Report the evidence
     and stop. If the answer reveals a real fix is needed, re-classify as
     Bounded or Architectural before proceeding. This is distinct from
     `brainstorm-feature`'s feasibility `Spike`.
   - **Bounded** — the fix stays within an existing flow and does not change a
     shared interface, contract, or component boundary. File count alone does
     not classify the bug. Proceed to step 2.
   - **Architectural** — the fix changes a shared interface, contract, or
     component boundary, or spans multiple components. Stop. Tell the user to
     invoke `brainstorm-feature` to produce a spec, then `plan-feature` for an
     execution plan, before any fix. Do not patch an architectural bug as if
     it were bounded; the verify plan in step 3 cannot cover cross-component
     regression surface that was never spec'd.

   When in doubt between two, take the heavier one. Hidden complexity
   discovered mid-fix upgrades the path — stop, say so, step up. Nothing
   downgrades mid-fix.

2. **Establish expected behavior.** Use source, tests, and current wiki pages.
   If they do not establish the intended behavior, stop and tell the user to
   invoke `brainstorm-feature` to get approval before changing behavior.
3. **Write the verify plan.** Before writing a regression check or production
   fix, list the observable conditions that prove the bug is fixed. State each
   as a checkable claim:
   - The original symptom no longer occurs (reproduction steps from Phase 1).
   - A repeatable check of the original symptom passes.
   - Traced callers and relevant existing tests do not regress (name the
     callers and checks from Phase 1, using `review-and-verify`'s caller-
     tracing procedure; record any uncovered caller as a verification limit).
   - Any contract the fix touches still holds (state the contract and how it
     is checked).
   - Any caller or contract without automated coverage is named with a direct
     check or reported as a verification limitation.

   This list is the definition of "fixed" for this bug. Step 9 checks the
   diff against it; `review-and-verify`'s "Bug fixed" row requires it. Without
   a written verify plan, "fixed" is a feeling, not a fact — do not proceed to
   step 4 until it is written.

4. **Choose a repeatable regression check** that reproduces the original
   symptom. Use an existing test runner when it gives a meaningful test. When
   none exists, use an available CLI, self-check, or recorded manual procedure
   with an expected result. Do not set up a unit-test runner solely for this
   fix.
5. **Verify the check fails** without the fix.
6. **Apply the smallest root-cause fix.** Reuse the verified working pattern
   from Phase 2 when it fits. A smaller-looking symptom patch is not minimal if
   sibling callers remain broken.
7. **Verify the same check passes** with the fix.
8. **Run relevant existing tests and checks** for regressions. The final
   `review-and-verify` gate runs repository-mandated full commands when they
   exist; do not invent a test suite.
9. Call the available Skill entry whose local name is `review-and-verify` to
   review the diff against the
   verify plan from step 3 and run fresh verification. Tell the user to invoke
   `document-wiki` after verification only when the fix changes observable
   behavior or reveals stale wiki documentation. An existing page that
   contradicts the fix remains a blocker until refreshed. Do not update the
   wiki when it already correctly describes the intended behavior and the fix
   only restores code to that behavior.
10. Do not create commits during debugging. Even when the user requests a
    commit, wait until final `review-and-verify` passes.

## Red flags — stop and return to Phase 1

If you catch yourself thinking:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "I'll know it's fixed when I see it" (no written verify plan)
- "It's just a bug, no need to classify" (skipping
  Diagnostic investigation/Bounded/Architectural)
- "The fix touches one file, so it's bounded" (file count is not the test — interface/contract impact is)
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)
- Each fix reveals a new problem in a different place

**All of these mean: stop. Return to Phase 1.**

If 3+ fixes have failed, question the architecture. The pattern is wrong,
not the implementation.

## When process reveals "no root cause"

If systematic investigation reveals the issue is truly environmental,
timing-dependent, or external:

1. Document what you investigated.
2. Record the evidence supporting that conclusion. If the request is a
   Diagnostic investigation, report the evidence and stop without changing
   production behavior.
3. If handling such as a retry, timeout, error message, or monitoring change is
   needed, return to Phase 4: classify the change, establish expected behavior,
   and write the verify plan before changing production code. These changes
   alter observable behavior. If current sources do not establish the intended
   behavior, tell the user to invoke `brainstorm-feature` and wait for approval.

But: 95% of "no root cause" cases are incomplete investigation.
