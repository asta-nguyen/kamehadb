import { Store } from '@tanstack/store';
import { nanoid } from 'nanoid';
import type { AppStoreState, AppView, WorkspaceTab } from '@kamehadb/shared';

const initialState: AppStoreState = {
  activeConnectionId: null,
  activeDatabaseId: null,
  activeSchemaId: null,
  activeTableId: null,
  activeMongoDatabase: null,
  openedTabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  density: 'compact',
  view: 'workspace',
  theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system',
};

export const appStore = new Store<AppStoreState>(initialState);

export function setActiveConnection(id: string | null) {
  appStore.setState((state) => ({ ...state, activeConnectionId: id, activeMongoDatabase: null }));
}

export function setActiveMongoDatabase(database: string | null) {
  appStore.setState((state) => ({ ...state, activeMongoDatabase: database }));
}

let queryCounter = 0;
let mongoCounter = 0;

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

export function openNewQueryTab(connectionId: string) {
  queryCounter++;
  const tab: WorkspaceTab = {
    id: `query-${nanoid()}`,
    type: 'query',
    title: `Query ${queryCounter}`,
    connectionId,
    sql: 'SELECT * FROM ',
  };
  openTab(tab);
}

export function openMongoTab(connectionId: string, database: string, collection: string) {
  mongoCounter++;
  const tab: WorkspaceTab = {
    id: `mongo-${connectionId}-${database}-${collection}-${mongoCounter}`,
    type: 'mongo',
    title: collection,
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

export function openTableStatsTab(connectionId: string, tableId: string) {
  openTab({
    id: `${connectionId}:${tableId}:stats`,
    type: 'table-stats' as const,
    title: `Stats: ${tableId}`,
    connectionId,
    tableId,
  });
}

export function updateTabSql(tabId: string, sql: string) {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((t) => (t.id === tabId ? { ...t, sql } : t)),
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
