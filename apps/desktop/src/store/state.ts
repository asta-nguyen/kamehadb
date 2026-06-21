import { Store } from '@tanstack/store';
import type { AppStoreState, WorkspaceTab } from '@kamehadb/shared';

function restoreTabs(): readonly WorkspaceTab[] {
  try {
    const raw = localStorage.getItem('kamehadb_tabs');
    return raw ? (JSON.parse(raw) as WorkspaceTab[]) : [];
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
  pinnedConnections: (() => {
    try {
      return JSON.parse(localStorage.getItem('kamehadb_pinned') ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
  connectionStatus: {},
  connectionLatency: {},
};

export const appStore = new Store<AppStoreState>(initialState);

export function setActiveConnection(id: string | null): void {
  appStore.setState((state) => ({ ...state, activeConnectionId: id, activeMongoDatabase: null }));
}

export function setActiveMongoDatabase(database: string | null): void {
  appStore.setState((state) => ({ ...state, activeMongoDatabase: database }));
}
