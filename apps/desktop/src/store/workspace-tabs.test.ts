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
import { closeTabsForConnection, renameTab } from './workspace-tabs';

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

const otherTab: WorkspaceTab = {
  id: 'query-2',
  type: 'query',
  title: 'Query 2',
  connectionId: 'connection-2',
  sql: 'SELECT 2',
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

describe('closeTabsForConnection', () => {
  beforeEach(() => {
    appStore.setState((state) => ({
      ...state,
      openedTabs: [queryTab, tableTab, otherTab],
      activeTabId: tableTab.id,
      activeConnectionId: 'connection-1',
    }));
  });

  it('closes all tabs belonging to the given connection and updates active tab', () => {
    closeTabsForConnection('connection-1');

    expect(appStore.state.openedTabs).toEqual([otherTab]);
    expect(appStore.state.activeTabId).toBe(otherTab.id);
    expect(appStore.state.activeConnectionId).toBe('connection-2');
  });

  it('clears active tab and active connection if all tabs were closed', () => {
    closeTabsForConnection('connection-2');
    closeTabsForConnection('connection-1');

    expect(appStore.state.openedTabs).toEqual([]);
    expect(appStore.state.activeTabId).toBeNull();
    expect(appStore.state.activeConnectionId).toBeNull();
  });
});
