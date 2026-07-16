---
phase: 04-ai-chat-schema-tree-actions
plan: 02
subsystem: backend
tags: [ai-chat, schema-context, hono, zod, sidecar]

requires:
  - phase: 04-ai-chat-schema-tree-actions
    plan: 01
    provides: Context menu, pendingAiPrompt store field, AIChatPanel prompt delivery
provides:
  - Table-scoped DDL via buildTableSchemaContext
  - Canonical prompt templates in prompt-templates.ts
  - tableId support on /ai/chat route
  - tableId forwarding from pendingAiPrompt to useChat forwardedProps
affects: [ai-chat, schema-context, 05-slow-query-insights]

tech-stack:
  added: []
  patterns:
    [
      shared renderTableDdl helper for DDL formatting,
      table-scoped DDL branch in /ai/chat with full-schema fallback,
      canonical prompt templates keyed by AiSchemaAction,
    ]

key-files:
  created:
    - apps/sidecar/src/ai/prompt-templates.ts
  modified:
    - apps/sidecar/src/ai/schema-context.ts
    - apps/sidecar/src/routes/ai.ts
    - apps/desktop/src/components/ai-chat-panel.tsx

key-decisions:
  - "D-10: buildTableSchemaContext reuses renderTableDdl — no DDL formatting duplication"
  - "D-11: tableId on /ai/chat body replaces full-schema DDL with table-scoped DDL"
  - "D-13: prompt-templates.ts mirrors desktop constants for canonical server-side reuse"

verification:
  - pnpm typecheck passes (shared, desktop tsc --noEmit, sidecar tsc --noEmit)
  - All 4 artifacts confirmed present in code
  - buildTableSchemaContext returns null when table not found → full-schema fallback
  - tableId flows: pendingAiPrompt.tableId → forwardedProps → /ai/chat body → buildTableSchemaContext

success-criteria:
  AICHAT-01: "AI response is scoped to the right-clicked table's DDL" — MET (table-scoped context)
  AICHAT-02: "Generate test data uses table-scoped DDL" — MET
  AICHAT-03: "Suggest index uses table-scoped DDL" — MET

notes:
  - renderTableDdl is an internal helper (not exported) — shared by buildSchemaContext and buildTableSchemaContext
  - tableId is read from pendingAiPrompt?.tableId reactively (not a ref) so forwardedProps is correct at send time
  - prompt-templates.ts is not yet called by the sidecar route (desktop constructs the user message); it exists for canonical reuse
---

## Plan 04-02 Summary

Added table-scoped schema context to the sidecar AI chat flow so right-click AI actions ground the LLM in just the target table's DDL.

### What was built

1. **renderTableDdl helper** (`apps/sidecar/src/ai/schema-context.ts`) — extracted the column/index DDL rendering logic from `buildSchemaContext` into a shared internal function. Both `buildSchemaContext` and `buildTableSchemaContext` now use it, ensuring identical formatting with no duplication.

2. **buildTableSchemaContext** (`apps/sidecar/src/ai/schema-context.ts`) — new exported function that finds a table by `tableId` across all schemas, fetches its columns and indexes, and returns single-table DDL. Returns `null` if the table is not found.

3. **prompt-templates.ts** (`apps/sidecar/src/ai/prompt-templates.ts`) — new file with three canonical prompt template functions (`explainSchemaPrompt`, `generateTestDataPrompt`, `suggestIndexPrompt`) and a `PROMPT_TEMPLATES` record keyed by `AiSchemaAction`. Mirrors the desktop `AI_SCHEMA_ACTIONS` constants for server-side reuse.

4. **tableId on /ai/chat** (`apps/sidecar/src/routes/ai.ts`) — added `tableId: z.string().optional()` to the Zod validator. When `tableId` is present and the connection is SQL, the route calls `buildTableSchemaContext` for table-scoped DDL. Falls back to full-schema DDL if the table is not found or no `tableId` is provided.

5. **tableId forwarding** (`apps/desktop/src/components/ai-chat-panel.tsx`) — `useChat` `forwardedProps` now includes `tableId: pendingAiPrompt?.tableId`. This is read reactively from the store (not a ref) so the value is correct at the time `chat.sendMessage` fires.

### Verification

- `pnpm typecheck` passes (shared package)
- `npx tsc --noEmit` passes for both desktop and sidecar
- All 4 artifacts confirmed in code
- End-to-end trace: right-click → setPendingAiPrompt({ tableId }) → AIChatPanel forwardedProps → /ai/chat body → buildTableSchemaContext → table-scoped system prompt
