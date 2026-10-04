# Wiki Maintenance

This wiki documents behavior verified from the current repository source and tests. Source and tests are authoritative; specs, plans, commit history, and filenames alone are not evidence.

## Verification Status

- `[x]` means every material claim on a page was checked against current source or tests in this run.
- `[ ]` means the feature is not documented.
- `[~]` must state whether the cause is a `verification limit` or a `confirmed content gap`, with the exact reason. Do not treat these states as equivalent.
- Continue all feasible source and test checks before identifying a content gap. Do not call unchecked behavior stale.

## Page Requirements

- Include exact, existing repository-relative source and test paths in `## Sources`.
- Use Obsidian wikilinks for links between wiki pages. With no `.obsidian/` vault in this repository, link targets are relative to `docs/llm/`.
- Document only behavior established by current source and tests. Label unresolved questions rather than inferring behavior.
- Keep the overview as the baseline map; create feature pages only for selected features.

## Logs

Do not create, read, update, or use `docs/llm/LOG.md` as evidence. If a legacy `LOG.md` exists, preserve it byte-for-byte.
