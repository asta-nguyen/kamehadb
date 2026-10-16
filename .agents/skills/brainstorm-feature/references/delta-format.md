# Delta format

Read this when writing, self-reviewing, or merging a `delta.md`. When it is
written is decided by `using-devkit`'s `## Change lifecycle`; this file owns the
shape and rules.

Contents: Shape, Rules, Self-review.

## Shape

`````md
# Delta

Issue: ENG-123
Approved: 2026-10-14 — partial refunds allowed up to the remaining amount

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

## Rules

- Metadata (`Issue:`, `Approved:`, `Page:`, `Search:`, `Previously:`,
  `Reason:`, and the labels `Requirement:`, `Baseline:`, `Replacement:`) sits
  outside the four-backtick blocks and is never copied to the wiki.
  `Approved: YYYY-MM-DD — <one-line design>` records a Bounded chat approval;
  Architectural deltas omit it because their gate lives in `tasks.md`;
  clear-small-change and bug-fix deltas omit it too. Only a fenced block is a
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

## Self-review

After writing `design.md` and `delta.md`, self-review the delta: every entry has
a unique `<PREFIX>-<slug>` ID whose prefix is already registered in
`## Requirement prefixes`; an `ADDED` ID is absent from `docs/llm/` and from
`## Retired requirement IDs`; each four-backtick block is a complete
requirement; the metadata matches its section (`ADDED` has `Page:` as a path and
`Search:`; `MODIFIED` keeps the ID with `Baseline:` and `Replacement:`;
`REMOVED` has `Reason:` and `Baseline:`); and no other open change in this branch
targets the same ID. A delta only targets a page already in the
`## Requirements` format.
