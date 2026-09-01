# Query Tab Rename

## Context

Query tabs currently use generated names such as `Query 1`. The existing workspace tab context menu already supports tab actions, so rename belongs there rather than in a separate toolbar control.

## Design

- Show `Rename` in the context menu only for tabs with `type === 'query'`.
- Open a shadcn dialog with the current tab title prefilled.
- Save on the dialog action or Enter; cancel on Cancel or Escape.
- Trim the entered title. Empty input leaves the existing title unchanged.
- Add `renameTab(tabId, title)` to the workspace tab store. It updates only the matching query tab and preserves SQL, pinning, and all other tab state.
- Reuse the existing store persistence subscription so renamed titles survive reloads without a new persistence path.

## Testing

- Add a store-level regression test that renames a query tab and verifies its title changes while its SQL and neighboring tabs remain unchanged.
- Run the desktop test suite, lint, and build.

## Scope

Non-query tabs, sidecar APIs, connection profiles, and backend persistence are unchanged.
