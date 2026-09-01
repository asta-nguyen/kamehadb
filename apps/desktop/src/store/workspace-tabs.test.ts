import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@/lib/types';

vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return storage;
});

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
