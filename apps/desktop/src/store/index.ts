import { Store } from '@tanstack/store';
import { nanoid } from 'nanoid';
import type { AppStoreState, AppView, WorkspaceTab } from '@kamehadb/shared';

// Restore saved session tabs from localStorage
function restoreTabs(): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem('kamehadb_tabs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function restoreActiveTab(): string | null {
  return localStorage.getItem('kamehadb_active_tab') ?? null;
}

const initialState: AppStoreState = {
  activeConnectionId: null,
  activeDatabaseId: null,
  activeSchemaId: null,
  activeTableId: null,
  activeMongoDatabase: null,
  aiPanelConnectionId: null,
  openedTabs: restoreTabs(),
  activeTabId: restoreActiveTab(),
  sidebarCollapsed: false,
  density: 'compact',
  view: 'workspace',
  theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system',
  expandedConnections: [],
  pinnedConnections: JSON.parse(localStorage.getItem('kamehadb_pinned') ?? '[]'),
  connectionStatus: {},
  connectionLatency: {},
};

export const appStore = new Store<AppStoreState>(initialState);

export function setActiveConnection(id: string | null) {
  appStore.setState((state) => ({ ...state, activeConnectionId: id, activeMongoDatabase: null }));
}

export function setActiveMongoDatabase(database: string | null) {
  appStore.setState((state) => ({ ...state, activeMongoDatabase: database }));
}

export function openTab(tab: WorkspaceTab) {
  appStore.setState((state) => {
    const exists = state.openedTabs.find((t) => t.id === tab.id);
    if (exists) return { ...state, activeTabId: tab.id };
    return {
      ...state,
      openedTabs: [...state.openedTabs, tab],
      activeTabId: tab.id,
    };
  });
}

export function openNewQueryTab(connectionId: string, sql?: string, shouldAutoRun = false) {
  const tabCount = appStore.state.openedTabs.filter((t) => t.type === 'query').length;
  const tab: WorkspaceTab = {
    id: `query-${nanoid()}`,
    type: 'query',
    title: `Query ${tabCount + 1}`,
    connectionId,
    sql: sql ?? 'SELECT * FROM ',
    autoRun: shouldAutoRun,
  };
  openTab(tab);
}

export function openQueryTabWithSql(connectionId: string, sql: string, shouldAutoRun = false) {
  const tabCount = appStore.state.openedTabs.filter((t) => t.type === 'query').length;
  const tab: WorkspaceTab = {
    id: `query-${nanoid()}`,
    type: 'query',
    title: `Query ${tabCount + 1}`,
    connectionId,
    sql,
    autoRun: shouldAutoRun,
  };
  openTab(tab);
  return tab.id;
}

export function openGraphTab(connectionId: string) {
  openTab({
    id: `${connectionId}:graph`,
    type: 'graph' as const,
    title: 'Schema Graph',
    connectionId,
  });
}

export function openDatabaseStatsTab(connectionId: string) {
  openTab({
    id: `${connectionId}:db-stats`,
    type: 'database-stats' as const,
    title: 'Database Stats',
    connectionId,
  });
}

export function openRedisTab(connectionId: string) {
  openTab({
    id: `${connectionId}:redis`,
    type: 'redis' as const,
    title: 'Redis Browser',
    connectionId,
  });
}

export function openRedisQueryTab(connectionId: string) {
  const tabCount = appStore.state.openedTabs.filter((t) => t.type === 'redis-query').length;
  const tab: WorkspaceTab = {
    id: `redis-query-${nanoid()}`,
    type: 'redis-query',
    title: `Redis Query ${tabCount + 1}`,
    connectionId,
    command: '',
  };
  openTab(tab);
}

export function openMongoQueryTab(connectionId: string, database: string, collection: string) {
  const tabCount = appStore.state.openedTabs.filter((t) => t.type === 'mongo-query').length;
  const tab: WorkspaceTab = {
    id: `mongo-query-${nanoid()}`,
    type: 'mongo-query',
    title: `Aggregate ${collection || tabCount + 1}`,
    connectionId,
    database,
    collection,
  };
  openTab(tab);
}

export function openQdrantTab(connectionId: string, collection: string) {
  openTab({
    id: `${connectionId}:qdrant:${collection}`,
    type: 'qdrant' as const,
    title: collection,
    connectionId,
    collection,
  });
}

export function openQdrantSearchTab(
  connectionId: string,
  collection?: string,
  opts?: { mode?: 'text' | 'similar' | 'raw'; pointId?: string | number },
) {
  const tabCount = appStore.state.openedTabs.filter((t) => t.type === 'qdrant-search').length;
  const tab: WorkspaceTab = {
    id: `qdrant-search-${nanoid()}`,
    type: 'qdrant-search',
    title: opts?.pointId
      ? `Similar to ${opts.pointId}`
      : collection
        ? `Search ${collection}`
        : `Vector Search ${tabCount + 1}`,
    connectionId,
    collection,
    mode: opts?.mode,
    pointId: opts?.pointId,
  };
  openTab(tab);
}

export function openQdrantGraphTab(connectionId: string, collection: string) {
  openTab({
    id: `${connectionId}:qdrant-graph:${collection}`,
    type: 'qdrant-graph' as const,
    title: `Map: ${collection}`,
    connectionId,
    collection,
  });
}

export function openAiChatPanel(connectionId: string) {
  appStore.setState((state) => ({
    ...state,
    activeConnectionId: connectionId,
    aiPanelConnectionId: connectionId,
  }));
}

export function closeAiChatPanel() {
  appStore.setState((state) => ({
    ...state,
    aiPanelConnectionId: null,
  }));
}

export function updateTabSql(tabId: string, sql: string) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId ? { ...t, sql } : t)),
  }));
}

export function updateTabCommand(tabId: string, command: string) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId ? { ...t, command } : t)),
  }));
}

export function updateTabPipeline(tabId: string, pipeline: string) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId ? { ...t, pipeline } : t)),
  }));
}
export function updateTabAutoRun(tabId: string, autoRun: boolean) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId ? { ...t, autoRun } : t)),
  }));
}

export function updateTabQdrantGraphState(
  tabId: string,
  updates: { colorBy?: string; camera?: { position: number[]; target: number[] } },
) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId && t.type === 'qdrant-graph' ? { ...t, ...updates } : t)),
  }));
}

export function closeTab(tabId: string) {
  appStore.setState((state) => {
    const tabs = state.openedTabs.filter((t) => t.id !== tabId);
    const activeTabId = state.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId;
    return { ...state, openedTabs: tabs, activeTabId };
  });
}

export function closeAllTabs() {
  appStore.setState((state) => ({ ...state, openedTabs: [], activeTabId: null }));
}

export function navigateTo(view: AppView) {
  appStore.setState((state) => ({ ...state, view }));
}

// Persist opened tabs to localStorage whenever they change
appStore.subscribe(() => {
  const { openedTabs, activeTabId } = appStore.state;
  try {
    localStorage.setItem('kamehadb_tabs', JSON.stringify(openedTabs));
    if (activeTabId) localStorage.setItem('kamehadb_active_tab', activeTabId);
    else localStorage.removeItem('kamehadb_active_tab');
  } catch {
    // Storage quota or other write error — skip
  }
});

export function togglePinnedConnection(id: string) {
  appStore.setState((state) => {
    const pinned = state.pinnedConnections.includes(id)
      ? state.pinnedConnections.filter((p) => p !== id)
      : [...state.pinnedConnections, id];
    localStorage.setItem('kamehadb_pinned', JSON.stringify(pinned));
    return { ...state, pinnedConnections: pinned };
  });
}

export function toggleExpandedConnection(id: string) {
  appStore.setState((state) => {
    const expanded = state.expandedConnections.includes(id)
      ? state.expandedConnections.filter((e) => e !== id)
      : [...state.expandedConnections, id];
    return { ...state, expandedConnections: expanded };
  });
}

const LATENCY_SLOW_THRESHOLD = 500;

export function setConnectionStatus(id: string, status: 'connected' | 'slow' | 'disconnected' | 'reconnecting') {
  appStore.setState((state) => {
    if (state.connectionStatus[id] === status) return state;
    return { ...state, connectionStatus: { ...state.connectionStatus, [id]: status } };
  });
}

export function setConnectionLatency(id: string, latencyMs: number) {
  appStore.setState((state) => ({
    ...state,
    connectionLatency: { ...state.connectionLatency, [id]: latencyMs },
    connectionStatus: {
      ...state.connectionStatus,
      [id]: latencyMs > LATENCY_SLOW_THRESHOLD ? 'slow' : 'connected',
    },
  }));
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  localStorage.setItem('theme', theme);
  appStore.setState((state) => ({ ...state, theme }));
  applyTheme(theme);
}

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}
