# Query Tab Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename query tabs from the existing workspace tab context menu.

**Architecture:** Keep tab titles in the existing `WorkspaceTab` store state. Add one store mutation that updates only query tabs, then connect it to a controlled shadcn dialog opened from the tab context menu. The existing store subscription continues persisting the changed title to localStorage.

**Tech Stack:** React 19, TypeScript, TanStack Store, Base UI-backed shadcn Dialog/Input/Button components, Vitest.

## Global Constraints

- Only tabs with `type === 'query'` expose Rename.
- Empty trimmed titles are ignored.
- Do not add dependencies, sidecar routes, or a new persistence mechanism.
- Use shadcn components from `apps/desktop/src/components/ui/` for dialog controls and form fields.

---

### Task 1: Add the query-tab rename store mutation

**Files:**

- Create: `apps/desktop/src/store/workspace-tabs.test.ts`
- Modify: `apps/desktop/src/store/workspace-tabs.ts` near the existing `updateTabSql` mutation

**Interfaces:**

- Consumes: `appStore` and `WorkspaceTab` from the existing workspace store modules.
- Produces: `renameTab(tabId: string, title: string): void`, exported from `workspace-tabs.ts` and therefore from `store/index.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@/lib/types';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
});

Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

import { appStore } from './state';
import { renameTab } from './workspace-tabs';

const queryTab: WorkspaceTab = {
  id: 'query-1',
  type: 'query',
  title: 'Query 1',
  connectionId: 'connection-1',
  sql: 'SELECT 1',
};

const tableTab: WorkspaceTab = {
  id: 'table-1',
  type: 'table',
  title: 'users',
  connectionId: 'connection-1',
};

describe('renameTab', () => {
  beforeEach(() => {
    appStore.setState((state) => ({
      ...state,
      openedTabs: [queryTab, tableTab],
      activeTabId: queryTab.id,
    }));
  });

  it('renames only the query tab and preserves its SQL and neighboring tabs', () => {
    renameTab(queryTab.id, 'Customer report');

    expect(appStore.state.openedTabs).toEqual([{ ...queryTab, title: 'Customer report' }, tableTab]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kamehadb/desktop test -- src/store/workspace-tabs.test.ts`

Expected: FAIL because `renameTab` is not exported yet.

- [ ] **Step 3: Write the minimal store implementation**

Add this mutation beside the other tab update functions:

```ts
export function renameTab(tabId: string, title: string): void {
  const nextTitle = title.trim();
  if (!nextTitle) return;
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) =>
      tab.id === tabId && tab.type === 'query' ? { ...tab, title: nextTitle } : tab,
    ),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kamehadb/desktop test -- src/store/workspace-tabs.test.ts`

Expected: PASS with one test.

- [ ] **Step 5: Commit the store mutation and regression test**

```bash
git add apps/desktop/src/store/workspace-tabs.ts apps/desktop/src/store/workspace-tabs.test.ts
git commit -m "feat: add query tab rename mutation"
```

### Task 2: Add Rename to the workspace tab context menu

**Files:**

- Modify: `apps/desktop/src/components/workspace-tab-bar.tsx`

**Interfaces:**

- Consumes: `renameTab(tabId, title)` from `@/store` and the existing `tab.title` value.
- Produces: A Rename action for query tabs and a controlled dialog with keyboard-accessible save/cancel behavior.

- [ ] **Step 1: Add dialog state and the save handler**

Add `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, and `DialogClose` imports from `@/components/ui/dialog`; add `Input` from `@/components/ui/input`; add `Label` from `@/components/ui/label`; add `Pencil` from `lucide-react`; import `renameTab` from `@/store`.

Use these states and handler inside `WorkspaceTabBar`:

```tsx
const [tabToRename, setTabToRename] = useState<WorkspaceTab | null>(null);
const [renameValue, setRenameValue] = useState('');

// Commit a non-empty trimmed title, then close the dialog without changing tab state.
function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!tabToRename || !renameValue.trim()) return;
  renameTab(tabToRename.id, renameValue);
  setTabToRename(null);
  setRenameValue('');
}
```

Import `type WorkspaceTab` from `@/lib/types` so the dialog state remains aligned with the store union.

- [ ] **Step 2: Add the query-only context-menu item**

Place this item before the existing pin action inside each `ContextMenuContent`:

```tsx
{
  tab.type === 'query' && (
    <ContextMenuItem
      onClick={() => {
        setTabToRename(tab);
        setRenameValue(tab.title);
      }}
    >
      <Pencil className="size-4" />
      <span>Rename</span>
    </ContextMenuItem>
  );
}
```

- [ ] **Step 3: Add the controlled shadcn rename dialog**

Render this once after the tab map and before the trailing tab-bar actions:

```tsx
<Dialog
  open={tabToRename !== null}
  onOpenChange={(open) => {
    if (!open) {
      setTabToRename(null);
      setRenameValue('');
    }
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Rename Query Tab</DialogTitle>
      <DialogDescription>Choose a name for this query tab.</DialogDescription>
    </DialogHeader>
    <form onSubmit={handleRenameSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rename-query-tab">Tab name</Label>
        <Input
          id="rename-query-tab"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          autoFocus
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!renameValue.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

The form submits on Enter, the controlled Dialog closes on Escape, and the disabled Save button plus store guard prevent empty titles.

- [ ] **Step 4: Run lint and the desktop build**

Run: `pnpm --filter @kamehadb/desktop lint`

Expected: exit 0 with no ESLint errors.

Run: `pnpm --filter @kamehadb/desktop build`

Expected: exit 0 with the existing bundle-size and xterm chunk warnings only.

- [ ] **Step 5: Commit the context-menu and dialog UI**

```bash
git add apps/desktop/src/components/workspace-tab-bar.tsx
git commit -m "feat: add query tab rename dialog"
```

### Task 3: Update release notes and run the full verification gate

**Files:**

- Modify: `CHANGELOG.md` under `[Unreleased]`

**Interfaces:**

- Consumes: The completed store and UI behavior from Tasks 1–2.
- Produces: User-facing release-note coverage and fresh verification evidence.

- [ ] **Step 1: Add the changelog entry**

Add under `[Unreleased]`:

```md
### Added

- **Query tab rename** — rename query tabs from their right-click context menu.
```

- [ ] **Step 2: Run the complete desktop test suite**

Run: `pnpm --filter @kamehadb/desktop test`

Expected: all test files pass, including `src/store/workspace-tabs.test.ts`.

- [ ] **Step 3: Run the final lint, build, and diff checks**

Run: `pnpm --filter @kamehadb/desktop lint`

Expected: exit 0 with no ESLint errors.

Run: `pnpm --filter @kamehadb/desktop build`

Expected: exit 0 with only the known Vite warnings.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Commit the changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: note query tab rename"
```
