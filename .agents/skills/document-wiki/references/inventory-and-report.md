# Inventory, categories, and final report

Read this when a standalone wiki request builds the coverage inventory
(`SKILL.md`'s `## Workflow` step 4), groups selected behavior (step 7), or
writes the final report (`## Verify the wiki`). The `[x]`, `[~]`,
`verification limit`, and `confirmed content gap` definitions are in
`SKILL.md`'s `## Completion contract`.

## Coverage inventory

For each existing content page, use its `## Sources` as starting points, open the
current source and relevant tests, and compare every material claim with that
evidence. Trace additional callers or flow stages as needed. Continue all
feasible checks before assigning a final status; an unchecked source or caller is
not yet evidence of a content gap. The current working tree is authoritative,
including uncommitted changes; file existence or Git history alone does not
establish freshness. A source change alone does not make a still-accurate page
stale.

Report the repository's **domain map** and a **feature inventory**:

```text
Domain: <name> — <scope, or "not established by repository evidence">

[ ] / [x] / [~] Feature — what a user or operator can do
    Entry: <route, command, job, or API>
    Sources: <repository paths>
    Wiki: <page or "missing">
    Reason: <verification limit and/or confirmed content gap> — <exact reason, required for [~]>
```

Do not report only page names; the domain, feature, and entry point are
required.

## Categories

Group selected behavior into the smallest set of evidence-backed categories, and
use only categories that have a real page to contain:

| Category        | Use for                                                |
| --------------- | ------------------------------------------------------ |
| `architecture/` | Cross-cutting structure, boundaries, and API topology  |
| `domains/`      | Domain concepts, state models, and requirements        |
| `workflows/`    | User or operator flows across multiple components      |
| `integrations/` | Stripe, storage, email, and other external systems     |
| `operations/`   | Jobs, cron, deployment, maintenance, and runbooks      |
| `decisions/`    | Source-backed architectural decisions or existing ADRs |

A page belongs in the category that best describes its primary subject; link
related categories instead of duplicating the page. Create a folder only when
writing its first real page; never create placeholder folders. For small
repositories, `architecture/`, `decisions/`, and `workflows/` may be sufficient.

## Final report

The final report repeats the domain map, feature inventory, selected candidates,
verification-limited items, baseline and deep pages documented, verified
features skipped, unresolved evidence questions, and verification results. Never
report only "pages updated". For every selected feature, include the evidence
matrix result: each row names its exact source/test path or says that the
repository does not establish it.
