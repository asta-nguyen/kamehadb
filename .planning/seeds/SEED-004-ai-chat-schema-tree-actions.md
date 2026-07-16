---
id: SEED-004
status: dormant
planted: 2026-06-29T07:55:53Z
planted_during: unknown
trigger_when: when relevant
scope: unknown
area: dashboard
---

# SEED-004: AI chat one-click actions from schema tree right-click menu

## Why This Matters

The AI chat panel already has schema-aware context plumbing, but invoking it requires
manual context assembly. Adding one-click actions ("Explain this schema", "Generate
test data", "Suggest index") to the schema tree right-click menu would let users
trigger AI assistance scoped to the exact table/index they clicked — reducing friction
and ensuring the AI receives precise context without copy-paste.

## When to Surface

**Trigger:** when relevant — surfaces during `/gsd:new-milestone` when the milestone
scope touches the AI chat panel or schema tree UX.

## Scope Estimate

**Unknown** — likely Small-to-Medium (context menu wiring + prompt templates +
reusing existing schema-context generation). Run `/gsd-capture --seed --enrich SEED-004`
to estimate effort.

## Breadcrumbs

- `apps/desktop/src/components/ai-chat-panel.tsx` — AI chat panel; would receive pre-seeded prompts
- `apps/desktop/src/components/sidebar.tsx` — schema tree where the right-click menu would live
- `apps/sidecar/src/ai/` — provider abstraction and schema-context generation already exists
- `apps/sidecar/src/routes/ai.ts` — AI chat route; schema cache and chat history endpoints
- `packages/shared/src/index.ts` — AI-related types shared between desktop and sidecar

## Notes

Captured via one-shot seed capture during gsd-progress routing. Three initial actions:
"Explain this schema", "Generate test data", "Suggest index". Schema context plumbing
already exists in `apps/sidecar/src/ai/` — the work is mostly menu wiring and prompt
templates.
