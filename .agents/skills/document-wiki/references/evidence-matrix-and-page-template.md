# Evidence matrix and page template

Before documenting each selected feature, build and check this evidence
matrix. Do not treat an unchecked row as a content gap: finish all feasible
source, caller, and test checks first. If a row remains unverified because
evidence cannot be accessed or established, record `not established by source`,
mark `[~]` as a `verification limit`, and do not invent the claim. Classify an
existing page as a `confirmed content gap` only when completed checks prove a
material omission or contradiction.

| Required evidence | What to verify                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Entry and caller  | Route, command, job, webhook, or API and its inbound caller                                                     |
| Use case          | Service/domain method and important downstream calls                                                            |
| State             | Persistence, status transitions, and returned user-visible result                                               |
| Side effects      | Storage, external APIs, DB writes, queues, events, email, notifications                                         |
| Rules             | Authorization, plan/access checks, validation, limits, and invariants, documented as requirements with evidence |
| Errors            | Important rejected, missing, retry, and failure paths                                                           |
| Tests             | Matching tests found by searching the repository                                                                |

Then trace the feature end to end:

```text
entry point and inbound caller
→ service/use-case callees
→ persistence and state changes
→ storage/external adapters
→ jobs, events, email, and notifications
→ authorization, constraints, and error paths
→ relevant tests
```

Continue until source establishes the user-visible outcome and material side
effects. Do not stop at a controller or list unrelated helpers merely because
they are reachable. Create or update the smallest relevant page with these
sections. If one page covers multiple selected features, repeat these sections
for each feature or split the page; one generic section cannot stand in for
separate feature behavior.

```md
# Feature name

## Requirements

### PAY-refund-cap

The system SHALL reject a refund larger than the remaining captured amount.

#### Scenario: over-refund rejected

- GIVEN a payment captured for 100
- WHEN a refund of 120 is requested
- THEN the refund is rejected with `amount_exceeds_capture`

Evidence: `src/payments/refund.ts`, `test/refund.test.ts`

## Flow

Source-grounded happy path.

## State changes

Persisted states and transitions, including the user-visible outcome.

## Side effects

Storage, external services, queues, events, email, or notifications.

## Authorization & constraints

Access checks, validation, limits, and plan restrictions.

## Error paths

Important failures, retries, and not-found or rejection behavior.

## Tests

Relevant test paths, or `Tests: none found` after an explicit repository search.

## Related

- [Architecture overview](../architecture/overview.md)

## Sources

- `path/to/source`
- `path/to/test` (when a relevant test exists)
```

`## Sources` lists every inspected file that materially supports the flow and
no unrelated paths. Use exact existing file paths only; never use `*`, `**`, or
a directory. Keep prose concise. Never turn a helper, file, or inferred product
idea into a feature. If evidence is missing, omit the claim or label it an open
question. Use relative Markdown links for internal pages. Add `## Related` to
every non-overview page when a
related wiki page exists. YAML frontmatter is optional; do not invent it for
formatting. Before stating `Tests: none found`, search the repository test tree
for the route, service, domain terms, and state names. Never invent a test path.

### Requirement rules

Each `###` heading under `## Requirements` is one requirement:

- **ID:** `<PREFIX>-<slug>`, an uppercase domain prefix and a lowercase
  kebab-case slug. An ID is unique across `docs/llm/` and is never reused after
  its requirement is removed. Record a removed ID under
  `## Retired requirement IDs` in `docs/llm/INDEX.md` so a later refresh cannot
  reuse it.
- **Heading:** the heading is the ID alone (`### PAY-refund-cap`), so its anchor
  (`#pay-refund-cap`) stays stable when wording changes. Link to a requirement
  with `<page>.md#<lowercase-id>`; the `SHALL` statement carries the
  description.
- **Statement:** exactly one `SHALL` statement of observable behavior.
- **Scenario:** at least one `#### Scenario:` with `GIVEN`, `WHEN`, and `THEN`
  lines, taken from a test when one exists, otherwise from source.
- **Evidence:** one `Evidence:` line with exact existing source paths, plus test
  paths when a relevant test exists. Every `Evidence:` path must also appear in
  the page's `## Sources`. Without source evidence, record an open question
  instead of a requirement.
- **Prefix registry:** `docs/llm/INDEX.md` has a `## Requirement prefixes` table
  with columns `Prefix` and `Domain`. Read it before writing a requirement and
  reuse the domain's prefix. A new domain registers a prefix not already in the
  table in the same change that writes its first requirement; the table is
  created with the first registered prefix.
- **One prefix per page:** every requirement on a page uses that page's single
  prefix. A requirement owned by another domain lives on that domain's page and
  is linked by ID; cross-domain pages link to requirements instead of defining
  them.
- **Order:** requirements on a page are sorted by ID.
- **Before writing:** search every page that uses the prefix for an existing
  requirement covering the behavior and reuse it instead of adding a near
  duplicate.
- **One home:** a rule shared by several pages is defined once, on a page that
  uses its owning domain's prefix; other pages link to the ID.
- **Source-only rules:** a requirement with source but no test is valid; the
  page's `## Tests` section still follows the `Tests: none found` search rule.
- Never write a requirement from a proposal, product idea, or unshipped design.
- **Legacy pages:** a page that still has `## Business rules` stays valid until
  it is converted. Converting preserves every evidence-backed rule as a
  requirement and moves unproven rules to open questions; never drop a rule
  silently. There is no bulk migration.
