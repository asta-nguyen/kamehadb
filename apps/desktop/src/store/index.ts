import { Store } from '@tanstack/store';
import { nanoid } from 'nanoid';
import type { AppStoreState, AppView, WorkspaceTab } from '@kamehadb/shared';

const initialState: AppStoreState = {
  activeConnectionId: null,
  activeDatabaseId: null,
  activeSchemaId: null,
  activeTableId: null,
  activeMongoDatabase: null,
  aiPanelConnectionId: null,
  openedTabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  density: 'compact',
  view: 'workspace',
  theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system',
  expandedConnections: [],
  connectionStatus: {},
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

export function openMongoTab(connectionId: string, database: string, collection: string) {
  const tabCount = appStore.state.openedTabs.filter((t) => t.type === 'mongo').length;
  const tab: WorkspaceTab = {
    id: `mongo-${nanoid()}`,
    type: 'mongo',
    title: collection || `Mongo Query ${tabCount + 1}`,
    connectionId,
    database,
    collection,
  };
  openTab(tab);
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

export function openTableStatsTab(connectionId: string, tableId: string) {
  openTab({
    id: `${connectionId}:${tableId}:stats`,
    type: 'table-stats' as const,
    title: `Stats: ${tableId}`,
    connectionId,
    tableId,
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

export function clearTabAutoRun(tabId: string) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId ? { ...t, autoRun: false } : t)),
  }));
}

export function closeTab(tabId: string) {
  appStore.setState((state) => {
    const tabs = state.openedTabs.filter((t) => t.id !== tabId);
    const activeTabId = state.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId;
    return { ...state, openedTabs: tabs, activeTabId };
  });
}

export function navigateTo(view: AppView) {
  appStore.setState((state) => ({ ...state, view }));
}

export function toggleSidebar() {
  appStore.setState((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
}

export function toggleExpandedConnection(id: string) {
  appStore.setState((state) => {
    const expanded = state.expandedConnections.includes(id)
      ? state.expandedConnections.filter((e) => e !== id)
      : [...state.expandedConnections, id];
    return { ...state, expandedConnections: expanded };
  });
}

export function setExpandedConnections(ids: string[]) {
  appStore.setState((state) => ({ ...state, expandedConnections: ids }));
}

export function setConnectionStatus(id: string, status: 'connected' | 'disconnected') {
  appStore.setState((state) => {
    if (state.connectionStatus[id] === status) return state;
    return { ...state, connectionStatus: { ...state.connectionStatus, [id]: status } };
  });
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  localStorage.setItem('theme', theme);
  appStore.setState((state) => ({ ...state, theme }));
  applyTheme(theme);
}

export function toggleTheme() {
  appStore.setState((state) => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIdx = themes.indexOf(state.theme);
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
    return { ...state, theme: nextTheme };
  });
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

export function setActiveTab(tabId: string | null) {
  appStore.setState((state) => ({ ...state, activeTabId: tabId }));
}

export { updateTabSql as setTabSql };
