---
name: review-and-verify
description: Use when a user asks to review the diff, check the work, run or verify tests or builds, confirm a bug or feature is complete, or before declaring implementation or documentation done.
---

# review-and-verify

## Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you have not performed a fresh verification check in this message, you
cannot claim it passes. "Should work" is not evidence. "Looks correct" is not
evidence. Previous runs are not evidence.

## Verification gate

Before claiming any status or expressing satisfaction:

1. **Identify** — what command or repeatable manual procedure proves this claim?
2. **Run** — execute the command or perform the procedure (fresh, complete)
3. **Read** — check the full output or observed result, including failures
4. **Verify** — does the result confirm the claim?
   - If no: state actual status with evidence
   - If yes: state claim with evidence
5. **Only then** — make the claim

Before final completion, run every repository-mandated full verification
command documented in `AGENTS.md`, manifests, or CI configuration. Targeted
checks are useful during implementation but do not replace this final gate. If
no full command is established, report that limitation explicitly.

Before reviewing requirements, read the active spec and plan, including its
`## Decision Log`, plus any task-linked decision file. A persisted decision is
requirement evidence, but it does not override a pending approval gate;
conversation recall alone is not review evidence.

## Git safety invariants

- Treat existing working-tree changes as user-owned. Inspect `git status
--short` and the relevant diff before changing or discarding anything.
- Never run `git reset --hard`, `git clean -fd`/`-xdf`, `git checkout -- <path>`,
  `git restore` that overwrites work, or broad delete commands to remove user
  changes unless the user explicitly authorizes the exact target and command.
- Never force-push or rewrite remote history without an explicit request naming
  the remote, branch, and intended rewrite. A request to finish, clean up, or
  fix the branch is not authorization.
- Prefer recoverable actions: inspect first, edit with the repository's normal
  tools, and leave commits and remote operations to the user unless explicitly
  requested.

## Claims vs evidence

| Claim            | Requires                                                      | Not sufficient                 |
| ---------------- | ------------------------------------------------------------- | ------------------------------ |
| Tests pass       | Test command output: 0 failures                               | Previous run, "should pass"    |
| Build succeeds   | Build command: exit 0                                         | Linter passing, logs look good |
| Bug fixed        | Repeat original symptom check: passes                         | Code changed, assumed fixed    |
| Requirements met | Line-by-line checklist vs spec, plan, and persisted decisions | Tests passing alone            |
| Wiki updated     | Source paths exist, links resolve                             | "Page edited"                  |

## Diff review

### Trace changed callers

With OpenEZ, call `diff_context` using `staged: true` to isolate staged changes,
`ref` to compare a selected ref, or neither option for the working-tree view;
record changed symbols and callers. A temporary sample run observed that
`staged: true` reported staged changes, while the default working-tree view
included staged and unstaged tracked changes. It did not list untracked files
as changed-file entries, although its graph did surface an indexed untracked
caller. Treat this as observed coverage, not a guarantee for other hosts.

Always run `git status --short` and search changed symbols plus string, route,
config-key, and case variants with FFF multi-pattern grep or `rg`; include new
and untracked paths. This closes gaps when `diff_context` omits untracked files
or graph edges. Without OpenEZ, when `HEAD` exists derive tracked symbols from
`git diff HEAD` (staged and unstaged changes); when no commit exists, use both
`git diff --cached` and `git diff`. For a branch review, also include
`git diff <target-branch>...HEAD` so committed branch changes are reviewed.
Use the PR's target branch, or the branch the task is intended to merge into;
the three-dot comparison uses its merge-base with `HEAD`. If that target cannot
be established from repository or PR evidence, ask instead of assuming it. Read
untracked files listed by `git status --short` directly, then find callers with
FFF multi-pattern grep or `rg`. Read every listed caller. For large diffs, call
OpenEZ `index_workspace` (`mode: "incremental"`) only on the current
repository's already-registered workspace before querying.

Review the diff for:

- **Correctness** — logic matches the approved design and persisted decisions
- **Stale documentation** — wiki pages or comments that contradict new behavior
- **Accidental scope** — changes outside the approved plan
- **Missing error handling** — edge cases, error paths, cleanup
- **Protected boundaries** — trust-boundary validation, security,
  accessibility, and data-loss prevention remain intact
- **Conventions** — changed code follows the recorded rules in `AGENTS.md` or
  `CONVENTIONS.md` whose scope matches the changed files; the most specific
  matching scope wins. Cite `path:line` for a violation and why it matters.
  When no conventions are recorded, report this item as `not-applicable` and do
  not fail the review.

Compare implementation and fresh evidence with every approved edge case in the
spec and plan. Report every blocker, non-blocker, spec gap, and complexity
finding with `path:line` when relevant source exists, the observed problem, and
why it matters. A bare filename is not actionable evidence.

When required behavior cannot be established from the diff, source, tests, or
fresh command output, record it under `Spec gaps` as:

```text
cannot verify <requirement> — needs <specific evidence or command>
```

An unverifiable required behavior keeps the review status at `fail`.

For wiki changes, also verify: source paths exist, `## Sources` entries are
real, internal relative Markdown links resolve from their containing files,
`INDEX.md` links resolve, and no placeholder text remains. Also scan
`docs/llm/` for legacy `[[...]]` links. If a task updates the wiki, completion
requires the full `document-wiki` migration; report missing or ambiguous
targets, and fail the wiki check while any legacy wikilink remains.

Before the final result, classify wiki impact even for a bug fix. If the change
alters documented behavior or leaves a relevant page incomplete, use `yes` and
list the pages for a `document-wiki` handoff. Use `no` only after inspecting
the relevant page and source evidence. Use `not-applicable` when the repository
does not maintain `docs/llm/`, or `unknown` when the impact cannot be
established. An existing page that contradicts the changed behavior is a
blocker: keep `Status: fail` until that page is refreshed and verified. Missing
coverage for new behavior remains a `Wiki impact: yes` handoff. In the result
block's `Evidence`, name the check for every listed caller. If a caller has no
check, state `Verification limit: <caller> — <reason>` there.

## Complexity pass

Review the diff for behavior-preserving simplifications. Report each finding
with a file reference and one of these labels:

- `delete:` dead code or flexibility with no approved requirement
- `reuse:` duplicated behavior already present in the repository
- `stdlib:` custom code replaced by a named standard-library feature
- `native:` dependency or custom code replaced by the platform
- `yagni:` abstraction, configuration, or extension point with no current use
- `shrink:` a smaller clear implementation with the same behavior and checks

Fix an in-scope finding before completion; otherwise report it as remaining
work. If none exist, state that the pass found none. Do not produce a line-count
score: fewer lines are useful only when approved behavior, readability, and
protected boundaries remain intact.

## Review result

End every review with this exact result block:

```md
Status: pass | fail
Evidence: <commands run and relevant results>
Blockers: <required fixes, or none>
Non-blockers: <optional findings, or none>
Spec gaps: <missing spec, plan, or persisted-decision requirements, or none>
Wiki impact: yes | no | not-applicable | unknown
Wiki pages: <paths, or none>
Wiki action: <invoke document-wiki / no update needed / limitation>
```

Use `fail` when any blocker or spec gap remains. A passing verification command
does not override a failed requirements or diff review.

## Receiving code review

When reviewing external feedback, read `references/receiving-code-review.md`
before continuing.

## Report

Report any remaining limitation explicitly. A task is complete only when the
result block says `Status: pass` and code, documentation, and verification
output agree. Leave failed blockers for the implementer to fix; do not silently
turn them into non-blockers.

Leave the verified working tree for the user to review and commit. If the user
explicitly requests a commit, create it only after this final verification gate
passes; never commit known failing or unverified work.
