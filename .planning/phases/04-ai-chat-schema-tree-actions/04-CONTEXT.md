# Phase 4: AI Chat Schema-Tree Actions - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds right-click context-menu actions to the schema tree that pre-seed the AI chat panel with table-scoped context. Users can right-click a table in the schema tree and choose one of three AI actions: "Explain this schema", "Generate test data", or "Suggest index". Each action opens the AI chat panel (if not already open), scopes it to the table's connection, and sends a pre-built prompt that includes the table's DDL so the AI response is grounded in that table's structure.

Scope: desktop app (`apps/desktop`) for the context menu on schema-tree table items and the prompt-pre-seed wiring into the existing AI chat panel; sidecar (`apps/sidecar`) for a new table-scoped schema-context helper and three prompt templates that reuse the existing `buildSchemaContext` infrastructure; `packages/shared` for the AI action type constants.

Out of scope: context menus on schema-level nodes (only table nodes get AI actions), non-SQL engines (MongoDB/Qdrant/Redis/TigerBeetle explorers have their own UIs and are not part of the schema tree), and a generic "custom prompt" action (only the three named actions are in scope per AICHAT-01/02/03).

</domain>

<decisions>
## Implementation Decisions

### Context Menu Component

- **D-01:** A shadcn `ContextMenu` component is installed via the shadcn CLI into `apps/desktop/src/components/ui/context-menu.tsx`. base-ui (the primitive library this project uses) ships a `context-menu` primitive, and the shadcn registry wraps it. This follows AGENTS.md rule 5: "No new shadcn components without a shadcn CLI install — never hand-roll a parallel component." The component was installed during discussion (`npx shadcn@latest add context-menu`).
- **D-02:** The context menu wraps each table `Button` in `schema-tree.tsx`'s `TableItem` component. `ContextMenuTrigger` renders as the table row (the existing `Button` becomes the trigger's child). Right-clicking the table row opens the menu at the cursor position — no manual x/y positioning needed; base-ui's `ContextMenu` handles pointer anchoring natively.
- **D-03:** Rationale: Using the dedicated `ContextMenu` primitive (rather than abusing `DropdownMenu` with a controlled `open` state and manual cursor anchoring) is the correct semantic component for right-click menus and avoids fragile position math. It matches the existing dropdown-menu pattern (same base-ui Menu primitives under the hood, same styling tokens).

### Menu Items and Actions

- **D-04:** Three `ContextMenuItem` entries, each with a lucide icon and label:
  - "Explain this schema" — `Sparkles` icon — pre-seeds a prompt asking the AI to explain the table's structure, relationships, and purpose.
  - "Generate test data" — `Beaker` icon — pre-seeds a prompt asking the AI to generate INSERT statements with realistic sample data respecting column types and constraints.
  - "Suggest index" — `KeyRound` icon — pre-seeds a prompt asking the AI to recommend indexes based on the table's columns and existing indexes.
- **D-05:** The three action labels and prompt templates are defined as named constants in `apps/desktop/src/lib/constants.ts` (the labels) and `apps/sidecar/src/ai/prompt-templates.ts` (the prompt bodies). The action identifiers (`'explain-schema'`, `'generate-test-data'`, `'suggest-index'`) are a string-literal union type in `packages/shared/src/types.ts` (`AiSchemaAction`). AGENTS.md rule 6 forbids magic strings — the action ids are typed constants, not inline literals.
- **D-06:** The menu is only shown for SQL connections. The schema tree (`SchemaTree` component) is only rendered for SQL engines (MongoDB/Qdrant/TigerBeetle have dedicated explorers in `ConnectionExpansion`), so this is naturally enforced — no extra `KIND` guard needed in the menu itself. The menu items are always enabled (no disabled state); if the AI provider is not configured, the chat panel shows the existing error toast from the `/ai/chat` endpoint.

### Pre-Seed Flow

- **D-07:** When a context-menu action is clicked, the desktop app:
  1. Calls `openAiChatPanel(connectionId)` — the existing store action that sets `aiPanelConnectionId` and `activeConnectionId`, causing `WorkspaceScreen` to render the `AIChatPanel`.
  2. Constructs a prompt string by combining the action's template with the table's qualified name (`schema.table`).
  3. Sends the prompt via the existing `useChat` hook's `sendMessage` — but the `AIChatPanel` owns the `useChat` instance, so the prompt must be delivered cross-component.
- **D-08:** Cross-component prompt delivery uses a lightweight store field `pendingAiPrompt: string | null` on `AppStoreState`. The context-menu handler sets `pendingAiPrompt` to the constructed prompt. The `AIChatPanel` watches `pendingAiPrompt` via `useStore`; when it transitions from `null` to a string, the panel calls `chat.sendMessage(prompt)` and immediately clears the field back to `null`. This avoids prop-drilling or a new event bus — it reuses the existing TanStack Store that already coordinates the panel open/close state.
- **D-09:** Rationale: The `AIChatPanel` already manages its own `useChat` instance and message history. Re-creating the chat instance in the schema tree would duplicate state and break history continuity. The store-field approach is the simplest mechanism that keeps the single chat instance as the owner of message state, matching how `openAiChatPanel` already works via the store.

### Table-Scoped Schema Context

- **D-10:** The sidecar gains a new `buildTableSchemaContext(adapter, tableId)` helper in `apps/sidecar/src/ai/schema-context.ts` alongside the existing `buildSchemaContext`. It fetches columns and indexes for a single table (via `adapter.getTableColumns(tableId)` and `adapter.getTableIndexes(tableId)`) and returns a DDL string for just that table. This reuses the exact same DDL formatting logic as `buildSchemaContext` — the column/index rendering is extracted into a shared internal helper to avoid duplication.
- **D-11:** The table-scoped context is injected into the AI chat via a new optional `tableId` field on the `/ai/chat` request body (added to the Zod validator in `ai.ts`). When `tableId` is present, the sidecar builds table-scoped DDL instead of (or in addition to) the full-schema DDL. The system prompt already appends DDL — the table-scoped DDL replaces the full-schema DDL when `tableId` is set, keeping the prompt focused and token-efficient.
- **D-12:** The `useChat` hook's `forwardedProps` in `AIChatPanel` is extended to include `tableId` when a pending AI action targets a specific table. The `pendingAiPrompt` store field carries the `tableId` alongside the prompt text (as a small object `{ prompt: string; tableId?: string }` rather than a bare string). This keeps the chat request scoped to the right-clicked table.

### Prompt Templates

- **D-13:** Three prompt templates live in a new `apps/sidecar/src/ai/prompt-templates.ts` file. Each is a pure function `(tableName: string) => string` that returns the user-facing prompt text. The table's DDL is injected separately by the sidecar (via `buildTableSchemaContext`) into the system prompt — the user message only contains the natural-language request plus the table name. This separation matches the existing chat architecture where the system prompt carries schema context and the user message carries the question.
- **D-14:** The prompt templates are also mirrored client-side in `apps/desktop/src/lib/constants.ts` (as the `pendingAiPrompt` text) because the user message is constructed on the desktop and sent through `useChat.sendMessage`. The sidecar's `prompt-templates.ts` is used by a future server-side path (and keeps the templates canonical for potential API reuse), but the immediate v1 flow sends the fully-formed user message from the desktop. The desktop constants import the action-id type from `@kamehadb/shared` to stay in sync.
- **D-15:** Prompt text (concise, copy-pasteable):
  - Explain: `"Explain the structure and purpose of the table {table}. Describe each column, its type, primary and foreign keys, and any notable constraints or relationships."`
  - Test data: `"Generate realistic test data for the table {table}. Produce INSERT statements that respect column types, NOT NULL constraints, primary keys, and foreign key relationships. Provide 5 rows."`
  - Suggest index: `"Suggest indexes for the table {table} based on its columns and existing indexes. Explain the rationale for each suggestion and provide the CREATE INDEX statements."`
    The `{table}` placeholder is replaced with the qualified `schema.table` name (or just `table` if no schema).

### Store Changes

- **D-16:** `AppStoreState` (in `apps/desktop/src/lib/types.ts`) gains one new field: `pendingAiPrompt: { prompt: string; tableId?: string } | null`. Initial value `null`. A new store action `setPendingAiPrompt(value)` sets it, and `clearPendingAiPrompt()` resets to `null`. These live in `apps/desktop/src/store/ui-preferences.ts` alongside the existing `openAiChatPanel`/`closeAiChatPanel` actions.
- **D-17:** The `AIChatPanel` adds a `useEffect` that subscribes to `pendingAiPrompt` via `useStore`. When it becomes non-null AND the panel's `connectionId` matches `activeConnectionId`, it calls `chat.sendMessage(prompt)` and immediately `clearPendingAiPrompt()`. A ref guard prevents double-sends from React strict-mode double-invocation. The `forwardedProps` passed to `useChat` are extended to include `tableId` from the pending prompt so the sidecar receives the table scope.

### Claude's Discretion

- Exact wording of the three prompt templates (keep them concise and actionable)
- Whether to show a toast on action trigger ("Opening AI chat for {table}…") — nice-to-have, not required
- Icon choice for "Generate test data" (Beaker vs FlaskConical vs TestTube) — any lucide lab icon is fine
- Whether the context menu includes a separator above the AI actions (if other non-AI items are added later) — for v1, only the three AI items are in the menu, no separator needed

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning

- `.planning/ROADMAP.md` §Phase 4 — Phase goal, requirements (AICHAT-01, AICHAT-02, AICHAT-03), success criteria, plans 04-01/04-02
- `.planning/REQUIREMENTS.md` — REQ-IDs AICHAT-01, AICHAT-02, AICHAT-03 (lines 27-29)
- `.planning/PROJECT.md` — Core value, constraints (local-first, AI schema-aware context)

### Codebase Conventions

- `AGENTS.md` — shadcn component mapping rules (rule 5), KIND constant usage (rule 6), no magic strings/numbers, sidecar logger usage, simplicity-first, always comment non-trivial code (rule 7)
- `.planning/codebase/ARCHITECTURE.md` — Sidecar route structure, AI route group, metadata store
- `.planning/codebase/CONVENTIONS.md` — File naming, export conventions, shadcn UI rules, state management patterns

### Shared Contract

- `packages/shared/src/types.ts` — `AIChatMessage`, `AIChatRequest`, `AIProvider`, `AISettings` types (lines 533-559); `SqlAdapter` interface (lines 103-114) — `getTableColumns`, `getTableIndexes` methods
- `packages/shared/src/index.ts` — Re-export surface for shared types

### Existing AI Chat Infrastructure

- `apps/sidecar/src/routes/ai.ts` — `/ai/chat` route (line 215), `buildSystemPrompt` (line 159), `buildSchemaContext` usage (line 299) — the chat endpoint and schema-context injection point
- `apps/sidecar/src/ai/schema-context.ts` — `buildSchemaContext(adapter)` — the full-schema DDL builder to extract a table-scoped variant from
- `apps/sidecar/src/ai/provider.ts` — LLM provider abstraction — unchanged by this phase
- `apps/desktop/src/components/ai-chat-panel.tsx` — `AIChatPanel` component (line 436), `useChat` usage (line 458), `forwardedProps` pattern (line 460) — where the pending-prompt effect is added
- `apps/desktop/src/hooks/use-chat.ts` — `useChat` hook, `sendMessage` (line 96), `forwardedProps` (line 21) — the chat state owner
- `apps/desktop/src/lib/api.ts` — `getChatHistory`, `clearChatHistory`, `clearSchemaCache` — existing AI API methods

### Schema Tree and Store

- `apps/desktop/src/components/schema-tree.tsx` — `SchemaTree` and `TableItem` components — where the context menu is attached to table rows
- `apps/desktop/src/components/sidebar-expansion.tsx` — `ConnectionExpansion` — routes SQL connections to `SchemaTree`
- `apps/desktop/src/store/ui-preferences.ts` — `openAiChatPanel`, `closeAiChatPanel` (lines 7-11) — the existing AI panel store actions to extend
- `apps/desktop/src/store/state.ts` — `appStore` initial state — where `pendingAiPrompt: null` is added
- `apps/desktop/src/lib/types.ts` — `AppStoreState` (line 143 has `aiPanelConnectionId`) — where `pendingAiPrompt` field is added
- `apps/desktop/src/components/workspace-screen.tsx` — Renders `AIChatPanel` when `aiPanelConnectionId` is set (line 162)

### shadcn Components

- `apps/desktop/src/components/ui/context-menu.tsx` — Newly installed context-menu component (shadcn CLI, base-ui primitive)
- `apps/desktop/src/components/ui/dropdown-menu.tsx` — Existing dropdown pattern reference (same base-ui Menu primitives)
- `apps/desktop/src/components/sidebar-dropdown-menu.tsx` — Existing context-menu-style item pattern with icons + labels

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/sidecar/src/ai/schema-context.ts:3-40` — `buildSchemaContext(adapter)` iterates schemas → tables → columns + indexes and renders DDL. The column-rendering and index-rendering loops (lines 18-34) are the logic to extract into a shared `renderTableDdl(table, columns, indexes)` helper so both full-schema and table-scoped context use identical formatting.
- `apps/sidecar/src/routes/ai.ts:159-212` — `buildSystemPrompt(ddl, mongoSchema, connectionKind, postgresVectorPrompt)` appends DDL to the system prompt (line 200). The table-scoped DDL flows through this same function — no new system-prompt builder needed.
- `apps/sidecar/src/routes/ai.ts:215-440` — The `/ai/chat` route handler. The Zod validator (line 218-225) accepts `connectionId`, `mongoDatabase`, `messages`, `provider`, `model`. A new optional `tableId` field is added here. The DDL-building block (lines 276-301) gains a `tableId` branch that calls `buildTableSchemaContext` instead of `buildSchemaContext`.
- `apps/desktop/src/components/schema-tree.tsx:113-153` — `TableItem` component. The table `Button` (line 124) is the element to wrap with `ContextMenuTrigger`. The component already has `connectionId`, `table.id`, `table.name`, and `table.schema` in scope — all needed to build the AI action prompt.
- `apps/desktop/src/store/ui-preferences.ts:7-11` — `openAiChatPanel`/`closeAiChatPanel` — the established pattern for store-driven AI panel control. `setPendingAiPrompt`/`clearPendingAiPrompt` follow the same one-liner `appStore.setState` pattern.
- `apps/desktop/src/components/ai-chat-panel.tsx:458-461` — `useChat({ url: '/ai/chat', forwardedProps: connectionId ? { connectionId, mongoDatabase } : undefined })`. The `forwardedProps` is where `tableId` is added.

### Established Patterns

- shadcn components from `apps/desktop/src/components/ui/` — never raw HTML (AGENTS.md rule 5). The context-menu component is now installed.
- Store actions in `apps/desktop/src/store/ui-preferences.ts` — one-liner `appStore.setState` functions for UI state changes.
- `useStore(appStore, selector)` for reading store state in components — the `AIChatPanel` already uses this pattern via `useStore` for connection-scoped data.
- TanStack Query hooks in `apps/desktop/src/hooks/` — not needed for this phase (no new data fetching; the chat uses `useChat`'s SSE streaming, not TanStack Query).
- Sidecar route Zod validators via `zValidator('json', z.object({...}))` — the `tableId` field follows the existing optional-string pattern.
- Sidecar logger: `import { log } from '../lib/logger.js'` — never `console.log` (AGENTS.md). The new `prompt-templates.ts` is pure functions with no logging; `schema-context.ts` changes follow the existing silent-fail pattern.
- `KIND` constants from `@kamehadb/shared` — not needed in the menu itself (schema tree is SQL-only by construction), but the sidecar `tableId` branch is guarded by the existing `profile.kind !== 'redis' && profile.kind !== 'tigerbeetle'` check already in place.

### Integration Points

- `apps/desktop/src/components/ui/context-menu.tsx` — NEW (installed via shadcn CLI during discussion)
- `apps/desktop/src/components/schema-tree.tsx` — Wrap `TableItem`'s `Button` in `ContextMenu` + `ContextMenuTrigger`; add `ContextMenuContent` with three `ContextMenuItem` entries
- `apps/desktop/src/lib/types.ts` — Add `pendingAiPrompt` field to `AppStoreState`
- `apps/desktop/src/store/state.ts` — Add `pendingAiPrompt: null` to initial state
- `apps/desktop/src/store/ui-preferences.ts` — Add `setPendingAiPrompt`, `clearPendingAiPrompt` actions
- `apps/desktop/src/lib/constants.ts` — Add `AI_SCHEMA_ACTIONS` constant (action id → label + prompt template + icon name)
- `apps/desktop/src/components/ai-chat-panel.tsx` — Add `useEffect` watching `pendingAiPrompt`; extend `forwardedProps` with `tableId`
- `apps/sidecar/src/ai/schema-context.ts` — Extract `renderTableDdl` helper; add `buildTableSchemaContext(adapter, tableId)`
- `apps/sidecar/src/ai/prompt-templates.ts` — NEW: three prompt template functions
- `apps/sidecar/src/routes/ai.ts` — Add `tableId` to Zod validator; add table-scoped DDL branch
- `packages/shared/src/types.ts` — Add `AiSchemaAction` type (`'explain-schema' | 'generate-test-data' | 'suggest-index'`)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing schema tree and AI chat patterns for consistency. The three actions are self-explanatory from their labels. The prompt templates should be concise and directly actionable (the AI should be able to respond with a useful answer in one turn).

</specifics>

<deferred>
## Deferred Ideas

- **Context menu on schema-level nodes** — Right-clicking a schema (not a table) could offer "Explain all tables in this schema", but that's a broader prompt with different token-budget concerns. Deferred to a future iteration.
- **Custom prompt action** — A "Ask AI about this table…" menu item that opens a free-text input scoped to the table. The three named actions cover the explicit AICHAT-01/02/03 requirements; a custom-prompt flow is a separate UX investment.
- **Non-SQL engine AI actions** — MongoDB collections, Redis keys, Qdrant collections could also benefit from right-click AI actions, but those explorers have different UI components (not `SchemaTree`). Each would be its own phase.
- **AI action history / re-run** — Saving triggered AI actions as reusable prompts in query history. Not part of this phase; the chat history already persists the resulting conversation.
- **Streaming the table DDL preview in the menu** — Showing a tooltip with the table's DDL on menu hover. Nice-to-have but adds a data-fetching dependency to the menu render path. Deferred.

</deferred>

---

_Phase: 4-AI Chat Schema-Tree Actions_
_Context gathered: 2026-06-29_
