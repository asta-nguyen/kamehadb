---
id: SEED-007
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: landing
---

# SEED-007: AI Compare panel screenshot refresh CI automation on release tags

## Why This Matters

The AI Compare panel screenshots in `landing/public/images/` are regenerated manually
via `node landing/scripts/capture-images.mjs`. Screenshots drift out of sync with the
actual UI over time. Adding a CI workflow that runs the capture script on every release
tag and commits updated images would keep the landing visuals fresh without manual
toil, and would catch visual regressions at release time.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the landing site, CI, or release workflow.

## Scope Estimate

**Unknown** — likely Small (one workflow file + commit step). Run
`/gsd-capture --seed --enrich SEED-007` to estimate effort.

## Breadcrumbs

- `AGENTS.md:30` — "Landing site image generation: use `node scripts/capture-images.mjs` to update the AI Compare panel screenshots in `public/images/`"
- `AGENTS.md:86` — `node landing/scripts/capture-images.mjs # Regenerate AI compare panels`
- `AGENTS.md:361` — `landing/public/images/` — Compare panel screenshots (`sql-panel.png`, `chat-panel.png`, plus any new ones)
- `.github/workflows/release.yml` — existing release workflow triggered by `v*` tags; the screenshot workflow would key off the same trigger
- `landing/scripts/capture-images.mjs` — the capture script (referenced in AGENTS.md; verify exact path during enrichment — AGENTS.md references both `scripts/capture-images.mjs` and `landing/scripts/capture-images.mjs`)

## Notes

Captured via one-shot seed capture during gsd-progress routing. Note: AGENTS.md
references the capture script at two different paths (`scripts/capture-images.mjs` on
line 30 and `landing/scripts/capture-images.mjs` on line 86). The actual
`landing/scripts/` directory appears empty in the current tree — the script may not
exist yet or may live elsewhere. Resolve this discrepancy during enrichment before
planning the CI workflow.
