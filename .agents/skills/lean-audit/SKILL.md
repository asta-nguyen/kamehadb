---
name: lean-audit
description: Use when the user asks to audit a whole repository for over-engineering, code bloat, unnecessary dependencies, speculative abstractions, or what can be deleted or simplified.
---

# Lean Audit

## Overview

Run a read-only whole-repo simplicity audit. Report
validated cuts; do not edit, delete, commit, open a PR, or post comments.

## When to use

Use for audits of over-engineering, bloat, or simplification.
Do not use for diff-only review, correctness, security, performance, generic
test coverage, or style; route those concerns to review or debugging.

## Process

1. Establish root. Read applicable instructions and inspect `git status` without
   changing it. Record root, exclusions (`.git`, generated output, vendored
   code, `node_modules`, and build caches), and every inspected first-party
   area. If the user explicitly includes an excluded path, state that override.
   If a required area or repository-wide search is unavailable, report `Audit
incomplete: <specific limitation>` and do not make a lean verdict.
2. Inventory source, structure, entrypoints, manifests, dependencies,
   configuration, commands, and tests. Use `rg` and direct reads. Before
   judging a candidate, use FFF multi-pattern grep (fallback: `rg`) to search
   callers, registrations, and dynamic-reference variants, then inspect
   relevant configuration, tests, and extension requirements.
3. Report only validated cuts with one of these tags:
   `delete`, `stdlib`, `native`, `yagni`, or `shrink`. Omit ambiguous
   candidates. Preserve explicit requirements, repository conventions,
   compatibility boundaries, required validation, and behavior-protecting
   tests. Route out-of-scope concerns to review/debugging.
4. Rank the largest credible cut first. Report savings only when supported;
   never imply that a change was applied.

## Output

```md
# Lean audit

Scope: <repository root>; exclusions: <paths>; inspected: <first-party areas>

1. delete: <path:line> <cut>. <replacement>. evidence: <paths/searches>

net: -<N> lines, -<M> dependencies possible.
```

Every finding needs an exact repository-relative `path:line`, evidence, and a
replacement. For `shrink`, show the shorter equivalent form. After complete
coverage with no validated cut, keep the header and scope, then output
`Lean already. Ship.` and omit findings and net. If coverage is incomplete,
output the limitation instead.

## Quick reference

| Tag      | Meaning                                                  |
| -------- | -------------------------------------------------------- |
| `delete` | Remove code or a dependency with no required use.        |
| `stdlib` | Replace custom behavior with a standard-library API.     |
| `native` | Replace custom machinery with a platform-native feature. |
| `yagni`  | Remove speculative or unused abstraction.                |
| `shrink` | Keep behavior while making code materially smaller.      |

## Example

`src/format.js:18` — `stdlib`: replace the hand-written extension parser with
`node:path.extname`; evidence: callers and tests cover the same input boundary.

## Common mistakes

- Calling a style preference bloat without behavior or reuse evidence.
- Calling code dead after checking only one direct occurrence.
- Removing a factory or validation despite an explicit extension contract.
