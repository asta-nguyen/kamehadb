# Phase 6: Landing Polish - Discussion Log

**Mode:** --auto (autonomous decisions)
**Date:** 2026-06-29

## Discussion

### Q: How to share the canonical engine list with landing (not in pnpm workspace)?

**Decision:** Vendor a static `landing/src/lib/engines.ts` file that mirrors `KIND`, `ALL_KINDS`, `SQL_KINDS`, `NOSQL_KINDS`, and `DEFAULT_PORTS` from `packages/shared/src/schemas.ts`. A comment documents that this is a manual-sync copy. Importing `@kamehadb/shared` into landing would require a workspace boundary change (noted as a known concern in STATE.md), which is out of scope for this phase. The vendored file is typed and structured so drift is detectable during code review.

### Q: ReactFlow + dagre in landing — install or build a lightweight custom graph?

**Decision:** Install `@xyflow/react` and `dagre` into landing via npm. The desktop app already uses these packages for `schema-graph.tsx`, so reusing them ensures visual consistency and reduces maintenance burden. A custom SVG graph would be simpler but would not match the "ReactFlow + dagre" requirement in the success criteria. The packages are added to `landing/package.json` dependencies.

### Q: Screenshot capture — Playwright or Puppeteer?

**Decision:** Playwright. It is already a devDependency in `landing/package.json` (`"playwright": "^1.60.0"`). The capture script starts the Next.js dev server, navigates to the AI Compare section, and saves screenshots. No new dependencies needed.

### Q: CI workflow — commit images back to the tag or open a PR?

**Decision:** Commit directly back to the release tag using `stefanzweifel/git-auto-commit-action`. Opening a PR from a tag-triggered workflow is awkward (tags are immutable). Committing to the tag ensures the screenshots in `public/images/` are fresh for the release. The workflow also supports `workflow_dispatch` for manual triggers.

### Q: Engine matrix interactivity — what counts as "interactive"?

**Decision:** Two interactive elements: (1) a type-filter row (All / SQL / Document / Cache / Vector / Ledger) that filters the visible cards, and (2) a copy-to-clipboard button on each Docker snippet. Clicking a card also expands/collapses the Docker snippet. This goes beyond a static grid and gives visitors something to engage with.

### Q: Where to place the new sections in home-view.tsx?

**Decision:** Engine matrix goes between "Why KamehaDB" and "AI Query Generation" (it showcases engine breadth early). Schema graph demo goes between the "Features" grid and the "Install" section (it demonstrates schema intelligence after the feature list). This keeps the page flow logical: hero → engines → why → AI demo → features → schema demo → install → CTA.

### Q: Should the capture script also screenshot the new engine matrix and schema graph?

**Decision:** No — the success criteria specifically mention "AI Compare screenshot capture script." The capture script focuses on `chat-panel.png` and `sql-panel.png` (the existing Compare panel images). Extending it to capture new sections is a future enhancement, not a Phase 6 requirement.

## Autonomous Decisions Confirmed

- D-01..D-10 in 06-CONTEXT.md are final. No blocking questions.
