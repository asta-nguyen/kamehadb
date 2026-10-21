import { nanoid } from 'nanoid';
import type { WorkspaceTab } from '@/lib/types';
import { appStore } from './state';

export function openTab(tab: WorkspaceTab): void {
  appStore.setState((state) => {
    const existsIndex = state.openedTabs.findIndex((item) => item.id === tab.id);
    if (existsIndex !== -1) {
      // Merge new fields into the existing tab so callers (e.g. migration
      // handoff from Schema Diff) can update snapshot IDs on a reused tab.
      const merged = { ...state.openedTabs[existsIndex], ...tab } as WorkspaceTab;
      const tabs = [...state.openedTabs];
      tabs[existsIndex] = merged;
      return {
        ...state,
        openedTabs: tabs,
        activeTabId: tab.id,
        activeConnectionId: 'connectionId' in tab ? tab.connectionId : null,
      };
    }
    return {
      ...state,
      openedTabs: [...state.openedTabs, tab],
      activeTabId: tab.id,
      activeConnectionId: 'connectionId' in tab ? tab.connectionId : null,
    };
  });
}

export function openNewQueryTab(connectionId: string, sql?: string, shouldAutoRun = false): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'query').length;
  openTab({
    id: `query-${nanoid()}`,
    type: 'query',
    title: `Query ${tabCount + 1}`,
    connectionId,
    sql: sql ?? '',
    autoRun: shouldAutoRun,
  });
}

export function openQueryTabWithSql(connectionId: string, sql: string, shouldAutoRun = false): string {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'query').length;
  const tabId = `query-${nanoid()}`;
  openTab({ id: tabId, type: 'query', title: `Query ${tabCount + 1}`, connectionId, sql, autoRun: shouldAutoRun });
  return tabId;
}

export function openGraphTab(connectionId: string): void {
  openTab({ id: `${connectionId}:graph`, type: 'graph', title: 'Schema Graph', connectionId });
}

export function openDatabaseStatsTab(connectionId: string): void {
  openTab({ id: `${connectionId}:db-stats`, type: 'database-stats', title: 'Database Stats', connectionId });
}

export function openSchemaTimelineTab(connectionId: string): void {
  openTab({ id: `${connectionId}:schema-timeline`, type: 'schema-timeline', title: 'Schema Timeline', connectionId });
}

export function openSchemaDiffTab(connectionId: string): void {
  openTab({ id: `${connectionId}:schema-diff`, type: 'schema-diff', title: 'Schema Diff', connectionId });
}

export function openMigrationTab(connectionId: string, fromSnapshotId?: string, toSnapshotId?: string): void {
  openTab({
    id: `${connectionId}:migration`,
    type: 'migration',
    title: 'Migration Assistant',
    connectionId,
    fromSnapshotId,
    toSnapshotId,
  });
}

export function openRedisTab(connectionId: string): void {
  openTab({ id: `${connectionId}:redis`, type: 'redis', title: 'Redis Browser', connectionId });
}

export function openRedisQueryTab(connectionId: string): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'redis-query').length;
  openTab({
    id: `redis-query-${nanoid()}`,
    type: 'redis-query',
    title: `Redis Query ${tabCount + 1}`,
    connectionId,
    command: '',
  });
}

export function openMongoQueryTab(connectionId: string, database: string, collection: string): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'mongo-query').length;
  openTab({
    id: `mongo-query-${nanoid()}`,
    type: 'mongo-query',
    title: `Aggregate ${collection || tabCount + 1}`,
    connectionId,
    database,
    collection,
  });
}

export function updateTabSql(tabId: string, sql: string): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) => (tab.id === tabId ? { ...tab, sql } : tab)),
  }));
}

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

export function updateTabCommand(tabId: string, command: string): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) => (tab.id === tabId ? { ...tab, command } : tab)),
  }));
}

export function updateTabPipeline(tabId: string, pipeline: string): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) => (tab.id === tabId ? { ...tab, pipeline } : tab)),
  }));
}

export function updateTabAutoRun(tabId: string, autoRun: boolean): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) => (tab.id === tabId ? { ...tab, autoRun } : tab)),
  }));
}

export function openMongoShellTab(connectionId: string): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'mongo-shell').length;
  openTab({
    id: `mongo-shell-${nanoid()}`,
    type: 'mongo-shell',
    title: `Mongo Shell ${tabCount + 1}`,
    connectionId,
  });
}

export function openPostgresPsqlTab(connectionId: string): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'postgres-psql').length;
  openTab({
    id: `postgres-psql-${nanoid()}`,
    type: 'postgres-psql',
    title: `PSQL ${tabCount + 1}`,
    connectionId,
  });
}

export function updateTabShellSessionId(tabId: string, sessionId: string): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) =>
      tab.id === tabId && tab.type === 'mongo-shell' ? { ...tab, sessionId } : tab,
    ),
  }));
}

export function closeTab(tabId: string): void {
  appStore.setState((state) => {
    const tabs = state.openedTabs.filter((tab) => tab.id !== tabId);
    const newActiveTabId = state.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId;
    const newActiveTab = tabs.find((tab) => tab.id === newActiveTabId);
    return {
      ...state,
      openedTabs: tabs,
      activeTabId: newActiveTabId,
      activeConnectionId: newActiveTab && 'connectionId' in newActiveTab ? newActiveTab.connectionId : null,
    };
  });
}

export function openFederatedQueryTab(): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'federated-query').length;
  openTab({
    id: `federated-query-${nanoid()}`,
    type: 'federated-query',
    title: `Federated Query ${tabCount + 1}`,
    connectionIds: [],
  });
  // Switch to workspace view in case the tab was opened from global search
  // while the app was on the Logs or API Settings view.
  appStore.setState((state) => ({ ...state, view: 'workspace' }));
}

export function updateTabFederatedConnections(tabId: string, connectionIds: readonly string[]): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) =>
      tab.id === tabId && tab.type === 'federated-query' ? { ...tab, connectionIds } : tab,
    ),
  }));
}

export function closeAllTabs(): void {
  appStore.setState((state) => ({ ...state, openedTabs: [], activeTabId: null }));
}

/**
 * Close every tab associated with a connectionId. Pinned or unpinned, all tabs
 * for this connection are closed, and if the active tab was closed, the most
 * recently opened surviving tab becomes active. (How / Why / What)
 */
export function closeTabsForConnection(connectionId: string): void {
  appStore.setState((state) => {
    const tabs = state.openedTabs.filter((tab) => !('connectionId' in tab && tab.connectionId === connectionId));
    if (tabs.length === state.openedTabs.length) return state;

    const activeWasClosed = state.activeTabId !== null && !tabs.some((tab) => tab.id === state.activeTabId);
    const newActiveTabId = activeWasClosed ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId;
    const newActiveTab = tabs.find((tab) => tab.id === newActiveTabId);
    return {
      ...state,
      openedTabs: tabs,
      activeTabId: newActiveTabId,
      activeConnectionId:
        newActiveTab && 'connectionId' in newActiveTab
          ? newActiveTab.connectionId
          : activeWasClosed
            ? null
            : state.activeConnectionId,
    };
  });
}

/** Close every tab except the one with the given id and any pinned tabs. The
 * surviving tab becomes active so the workspace doesn't jump to an empty state. */
export function closeOtherTabs(keepTabId: string): void {
  appStore.setState((state) => {
    const tabs = state.openedTabs.filter((tab) => tab.id === keepTabId || tab.pinned);
    if (tabs.length === state.openedTabs.length) return state;
    const kept = tabs.find((tab) => tab.id === keepTabId);
    return {
      ...state,
      openedTabs: tabs,
      activeTabId: keepTabId,
      activeConnectionId: kept && 'connectionId' in kept ? kept.connectionId : null,
    };
  });
}

/** Close all unpinned tabs to the right of the tab with the given id (by index).
 * The active tab is only changed if it was among the closed ones. */
export function closeTabsToRight(tabId: string): void {
  appStore.setState((state) => {
    const index = state.openedTabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return state;
    const tabs = state.openedTabs.filter((tab, i) => i <= index || tab.pinned);
    const activeWasClosed = state.activeTabId !== null && !tabs.some((tab) => tab.id === state.activeTabId);
    const newActiveTab = activeWasClosed ? tabs.find((tab) => tab.id === tabId) : undefined;
    return {
      ...state,
      openedTabs: tabs,
      activeTabId: activeWasClosed ? tabId : state.activeTabId,
      activeConnectionId:
        newActiveTab && 'connectionId' in newActiveTab
          ? newActiveTab.connectionId
          : activeWasClosed
            ? null
            : state.activeConnectionId,
    };
  });
}

/** Toggle the pinned state of a tab. Pinned tabs are immune to "Close Others"
 * and "Close to the Right", and sort to the front of the tab bar. */
export function toggleTabPin(tabId: string): void {
  appStore.setState((state) => {
    const toggled = state.openedTabs.map((tab) => (tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab));
    // Stable sort: pinned tabs first, preserving relative order within each group.
    toggled.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return { ...state, openedTabs: toggled };
  });
}

/** Duplicate a tab — clone its state with a fresh id, inserted right after the
 * original. Only meaningful for stateful tabs (query, mongo-query, redis-query,
 * federated-query). For singleton tabs (graph, schema-timeline, etc.) this is
 * a no-op. */
export function duplicateTab(tabId: string): void {
  appStore.setState((state) => {
    const index = state.openedTabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return state;
    const original = state.openedTabs[index];
    // Only duplicate tabs that carry meaningful per-instance state.
    const duplicableTypes = ['query', 'redis-query', 'mongo-query', 'federated-query'];
    if (!duplicableTypes.includes(original.type)) return state;
    const clone: WorkspaceTab = {
      ...original,
      id: `${original.type}-${crypto.randomUUID()}`,
      title: original.title,
    } as WorkspaceTab;
    const tabs = [...state.openedTabs];
    tabs.splice(index + 1, 0, clone);
    return {
      ...state,
      openedTabs: tabs,
      activeTabId: clone.id,
      activeConnectionId: 'connectionId' in clone ? clone.connectionId : null,
    };
  });
}

export function reorderTabs(fromIndex: number, toIndex: number): void {
  appStore.setState((state) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return state;
    if (fromIndex >= state.openedTabs.length || toIndex >= state.openedTabs.length) return state;
    const tabs = [...state.openedTabs];
    const [moved] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, moved);
    return { ...state, openedTabs: tabs };
  });
}
