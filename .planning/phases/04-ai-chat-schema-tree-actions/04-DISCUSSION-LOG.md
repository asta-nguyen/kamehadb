# Phase 4: AI Chat Schema-Tree Actions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 4-AI Chat Schema-Tree Actions
**Mode:** --auto (autonomous, recommended defaults selected)
**Areas discussed:** Context Menu Component, Menu Items and Actions, Pre-Seed Flow, Table-Scoped Schema Context, Prompt Templates, Store Changes

---

## Context Menu Component

| Option                                                        | Description                                                               | Selected |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| shadcn ContextMenu (base-ui primitive)                        | Install via shadcn CLI; native right-click anchoring                      | ✓        |
| DropdownMenu with controlled open + manual cursor positioning | Reuse existing DropdownMenu, trigger on onContextMenu, position at cursor |          |

**[auto] Selected:** shadcn ContextMenu (recommended default)
**Notes:** base-ui ships a context-menu primitive; shadcn registry wraps it. Correct semantic component for right-click menus; avoids fragile position math. Installed during discussion via `npx shadcn@latest add context-menu`.

---

## Menu Items and Actions

| Option                                  | Description                                                                                 | Selected |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Three named AI actions with icons       | Explain schema, Generate test data, Suggest index — each a ContextMenuItem with lucide icon | ✓        |
| Named actions + a "custom prompt" entry | Three named actions plus a free-text "Ask AI about this table…" item                        |          |

**[auto] Selected:** Three named AI actions (recommended default)
**Notes:** AICHAT-01/02/03 specify exactly three actions. A custom-prompt entry is a separate UX investment — deferred. Action ids are a typed union in packages/shared, not magic strings.

---

## Pre-Seed Flow

| Option                      | Description                                                                                                          | Selected |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| Store field pendingAiPrompt | Context-menu handler sets pendingAiPrompt on AppStoreState; AIChatPanel watches and sends                            | ✓        |
| Event bus / pub-sub         | A micro event emitter that the schema tree publishes to and the chat panel subscribes to                             |          |
| Prop-drilling a callback    | Pass an onAiAction callback from WorkspaceScreen down through Sidebar → ConnectionExpansion → SchemaTree → TableItem |          |

**[auto] Selected:** Store field pendingAiPrompt (recommended default)
**Notes:** Reuses the existing TanStack Store that already coordinates aiPanelConnectionId. Simplest mechanism; no new event bus; no deep prop-drilling through 4 component layers. AIChatPanel keeps its single useChat instance as the owner of message state.

---

## Table-Scoped Schema Context

| Option                                                | Description                                                                                    | Selected |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| buildTableSchemaContext helper                        | Extract renderTableDdl from buildSchemaContext; new helper fetches one table's columns+indexes | ✓        |
| Full schema DDL with a "focus on table X" instruction | Send the entire schema DDL and tell the AI to focus on the right-clicked table                 |          |

**[auto] Selected:** buildTableSchemaContext helper (recommended default)
**Notes:** Token-efficient — only the target table's DDL is sent. Reuses identical DDL formatting via a shared internal helper (no duplication). The tableId flows through the /ai/chat request body to the sidecar.

---

## Prompt Templates

| Option                                                        | Description                                                                                          | Selected |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Desktop-constructed user message + sidecar-injected table DDL | Desktop builds the natural-language prompt; sidecar injects table DDL into system prompt via tableId | ✓        |
| Sidecar-constructed full prompt                               | Desktop sends only the action id + tableId; sidecar builds the entire user message                   |          |

**[auto] Selected:** Desktop-constructed user message + sidecar-injected table DDL (recommended default)
**Notes:** Matches the existing chat architecture — system prompt carries schema context, user message carries the question. The desktop constants hold the prompt text; a sidecar prompt-templates.ts file keeps canonical templates for potential API reuse.

---

## Store Changes

| Option                                               | Description                                                                                 | Selected |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Single pendingAiPrompt field with {prompt, tableId?} | One nullable field on AppStoreState; set by context menu, cleared by AIChatPanel after send | ✓        |
| Separate pendingPrompt and pendingTableId fields     | Two independent nullable fields                                                             |          |

**[auto] Selected:** Single pendingAiPrompt field (recommended default)
**Notes:** The prompt and tableId are semantically a single pending action — bundling them prevents partial states (prompt without tableId). One field, one clear, one effect.

---

## Claude's Discretion

- Exact prompt template wording (keep concise and actionable)
- Whether to show a toast on action trigger
- Icon choice for "Generate test data" (any lucide lab icon)
- Whether to include a separator in the context menu (v1 has only AI items, no separator needed)

## Deferred Ideas

- Context menu on schema-level nodes (broader prompt, different token budget)
- Custom prompt action ("Ask AI about this table…" free-text entry)
- Non-SQL engine AI actions (MongoDB/Redis/Qdrant have different UI components)
- AI action history / re-run as reusable prompts
- Streaming table DDL preview tooltip on menu hover
