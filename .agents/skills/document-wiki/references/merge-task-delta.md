# Merge a task delta

Read this when a task has a `delta.md` and its code checks pass. Run it in the
task's branch before final review; it includes partial-merge recovery. The delta
shape is defined in `../../brainstorm-feature/references/delta-format.md`.

Steps:

1. Check without editing.
2. Decide the merge state block by block.
3. Finish the merge.
4. Verify the wiki.

## 1. Check without editing

Every `Evidence:` path in `Requirement:` and `Replacement:` blocks exists and
supports its requirement in current source. `Baseline:` blocks are only compared
with the wiki before merge; their `Evidence:` paths may name deleted files or
outdated behavior and are not checked against current source. Every requirement
ID's prefix is already registered in `## Requirement prefixes`; delta merge
never registers one. Every target page that already exists uses
`## Requirements`; a page that does not exist yet is valid only as an `ADDED`
target in a registered domain. No `ADDED` ID appears in
`## Retired requirement IDs`. No other open change folder visible in this branch
targets the same ID in its `delta.md`. If any check fails, stop without editing
and return the failing item to the caller as a blocker.

## 2. Decide merge state block by block

Compare each delta block with `docs/llm/`.

- Before merge: an `ADDED` ID is absent, and a `MODIFIED` or `REMOVED` wiki
  block equals its `Baseline:` exactly.
- After merge: `ADDED` `Requirement:` and `MODIFIED` `Replacement:` blocks match
  the wiki exactly, and a `REMOVED` block's ID is absent from every page.

Merge state depends on block content only; retired IDs, `## Sources`, index
entries, and links are side effects that step 3 completes. A
`MODIFIED`/`REMOVED` block matching neither its baseline nor the after-merge
state was changed by another branch: never overwrite or delete it. The
`Merged into docs/llm/` marker is a trace, not the only evidence.

- When every block is either before or after merge, apply only the before-merge
  blocks and complete any missing side effects in step 3, regardless of whether
  the marker exists.
- When every block is already after merge, verify the side effects and add the
  missing marker in step 4; never apply the whole delta again.
- If a block matches neither state, stop the documentation update, report its
  exact difference, and inspect the approved decisions and source. Ask the user
  only if the correct behavior remains unclear; do not overwrite a conflicting
  wiki block.

## 3. Finish the merge

Apply only blocks still before merge and complete missing side effects for all
blocks:

- `ADDED`: insert the `Requirement:` block into `Page:` in ID order. For a new
  page, create it with every section of the template in
  `evidence-matrix-and-page-template.md`; a section outside the task's behavior
  may state an evidence-backed scope limit. Missing evidence for required
  behavior keeps the task incomplete; never substitute an open question for its
  documentation. Add a link to the new page in `docs/llm/INDEX.md`.
- `MODIFIED`: replace the wiki block that equals the `Baseline:` block with the
  `Replacement:` block.
- `REMOVED`: delete the wiki block that equals the `Baseline:` block, append its
  ID to `## Retired requirement IDs`, and update or remove every link to its
  anchor.
- For `ADDED` and `MODIFIED`, add each `Evidence:` path to the page's
  `## Sources`. After `MODIFIED` or `REMOVED`, drop a `## Sources` path only when
  no remaining claim on that page relies on it.

## 4. Verify the wiki

Every block is in the after-merge state, every page created by the merge is
linked from `docs/llm/INDEX.md`, and the wiki checks in `SKILL.md`'s
`## Verify the wiki` pass on every changed page. Check `## Sources`, retired
IDs, and links affected by the delta. On failure, keep the change open, report
the failing item, and fix the wiki, code, or delta within the approved scope. A
changed delta must be reconciled with the already-merged wiki; never overwrite a
conflicting block. Rerun this procedure from step 1 before final review. After
these checks pass, add `Merged into docs/llm/: YYYY-MM-DD` under the `delta.md`
title if it is missing.
