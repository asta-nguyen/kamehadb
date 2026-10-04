# Evidence matrix and page template

Before documenting each selected feature, build and check this evidence
matrix. Do not treat an unchecked row as a content gap: finish all feasible
source, caller, and test checks first. If a row remains unverified because
evidence cannot be accessed or established, record `not established by source`,
mark `[~]` as a `verification limit`, and do not invent the claim. Classify an
existing page as a `confirmed content gap` only when completed checks prove a
material omission or contradiction.

| Required evidence | What to verify                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| Entry and caller  | Route, command, job, webhook, or API and its inbound caller             |
| Use case          | Service/domain method and important downstream calls                    |
| State             | Persistence, status transitions, and returned user-visible result       |
| Side effects      | Storage, external APIs, DB writes, queues, events, email, notifications |
| Rules             | Authorization, plan/access checks, validation, limits, and invariants   |
| Errors            | Important rejected, missing, retry, and failure paths                   |
| Tests             | Matching tests found by searching the repository                        |

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

## Business rules

Current source- or test-backed invariants. Do not invent product requirements.

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
