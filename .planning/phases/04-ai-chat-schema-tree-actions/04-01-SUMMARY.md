---
phase: 04-ai-chat-schema-tree-actions
plan: 01
subsystem: frontend
tags: [ai-chat, schema-tree, context-menu, shadcn, tanstack-store, react]

requires:
  - phase: 03-schema-timeline-auto-snapshots
    provides: Schema timeline infrastructure (no direct dependency, but follows in execution order)
provides:
  - Right-click context menu on schema-tree table items with three AI actions
  - pendingAiPrompt store field for cross-component prompt delivery
  - AI_SCHEMA_ACTIONS constant with labels, icons, and prompt templates
  - AiSchemaAction shared type
affects: [04-02, ai-chat-panel, schema-tree]

tech-stack:
  added: [context-menu (shadcn/base-ui)]
  patterns:
    [
      store-field for cross-component prompt delivery,
      ContextMenu primitive on tree items,
      useRef guard for strict-mode safe effects,
    ]

key-files:
  created:
    - apps/desktop/src/components/ui/context-menu.tsx
  modified:
    - packages/shared/src/types.ts
    - apps/desktop/src/lib/types.ts
    - apps/desktop/src/store/state.ts
    - apps/desktop/src/store/ui-preferences.ts
    - apps/desktop/src/lib/constants.ts
    - apps/desktop/src/components/schema-tree.tsx
    - apps/desktop/src/components/ai-chat-panel.tsx

key-decisions:
  - "D-01: shadcn ContextMenu installed via CLI (base-ui primitive) — correct semantic component for right-click menus"
  - "D-08: pendingAiPrompt store field delivers prompts from schema tree to AIChatPanel without prop-drilling"
  - "D-05: AiSchemaAction typed union in @kamehadb/shared — no magic strings"

verification:
  - pnpm typecheck passes (shared, desktop tsc --noEmit, sidecar tsc --noEmit)
  - pnpm --filter @kamehadb/desktop test passes (1 test)
  - All 7 artifacts confirmed present in code
  - Context menu has 3 ContextMenuItem entries mapped from AI_SCHEMA_ACTION_ORDER
  - handleAiAction calls openAiChatPanel + setPendingAiPrompt
  - AIChatPanel useEffect sends prompt via chat.sendMessage and clears field

success-criteria:
  AICHAT-01: "User can right-click a table and choose 'Explain this schema' to pre-seed AI chat" — MET
  AICHAT-02: "User can right-click a table and choose 'Generate test data'" — MET
  AICHAT-03: "User can right-click a table and choose 'Suggest index'" — MET

notes:
  - context-menu.tsx installed via `npx shadcn@latest add context-menu`; fixed cn import (cnfast, not @/lib/utils)
  - base-ui ContextMenuTrigger does not support asChild; trigger renders a div wrapper around the Button
  - The prompt text includes the qualified table name; table-scoped DDL is Plan 04-02
---

## Plan 04-01 Summary

Implemented the desktop schema-tree right-click context menu with three AI actions and the cross-component prompt-delivery flow.

### What was built

1. **AiSchemaAction type** (`packages/shared/src/types.ts`) — `'explain-schema' | 'generate-test-data' | 'suggest-index'` union, exported from `@kamehadb/shared`.

2. **pendingAiPrompt store field** (`apps/desktop/src/lib/types.ts`, `state.ts`, `ui-preferences.ts`) — `PendingAiPrompt { prompt, tableId? }` type, `pendingAiPrompt: null` initial state, `setPendingAiPrompt`/`clearPendingAiPrompt` store actions.

3. **AI_SCHEMA_ACTIONS constant** (`apps/desktop/src/lib/constants.ts`) — maps each `AiSchemaAction` to `{ label, icon, buildPrompt }`. The `buildPrompt` function takes the qualified table name and returns the user message text. `AI_SCHEMA_ACTION_ORDER` defines menu ordering.

4. **ContextMenu on TableItem** (`apps/desktop/src/components/schema-tree.tsx`) — wraps the table `Button` in `ContextMenu` > `ContextMenuTrigger` + `ContextMenuContent` with three `ContextMenuItem` entries. `handleAiAction` calls `openAiChatPanel(connectionId)` then `setPendingAiPrompt({ prompt, tableId })`.

5. **pendingAiPrompt effect** (`apps/desktop/src/components/ai-chat-panel.tsx`) — `useStore` reads `pendingAiPrompt`; a `useEffect` sends it via `chat.sendMessage(prompt)` and clears the field. `sentPromptRef` guards against strict-mode double-invocation.

### Verification

- `pnpm typecheck` passes (shared package)
- `npx tsc --noEmit` passes for both desktop and sidecar
- `pnpm --filter @kamehadb/desktop test` passes
- All 7 artifacts confirmed in code
