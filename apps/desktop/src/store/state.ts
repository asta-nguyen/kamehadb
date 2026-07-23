import { Store } from '@tanstack/store';
import type { AppStoreState, WorkspaceTab } from '@/lib/types';

function coerceId(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function restoreTabs(): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem('kamehadb_tabs');
    if (!raw) return [];
    const tabs = JSON.parse(raw) as WorkspaceTab[];
    return tabs.map((tab) => {
      const connectionId = coerceId((tab as Record<string, unknown>).connectionId);
      if (connectionId === undefined) return tab;
      const coerced: Record<string, unknown> = { ...tab, connectionId };
      if ('fromSnapshotId' in tab) {
        const fromSnapshotId = coerceId((tab as Record<string, unknown>).fromSnapshotId);
        if (fromSnapshotId !== undefined) coerced.fromSnapshotId = fromSnapshotId;
      }
      if ('toSnapshotId' in tab) {
        const toSnapshotId = coerceId((tab as Record<string, unknown>).toSnapshotId);
        if (toSnapshotId !== undefined) coerced.toSnapshotId = toSnapshotId;
      }
      return coerced as WorkspaceTab;
    });
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
  pendingAiPrompt: null,
  openedTabs: restoreTabs(),
  activeTabId: restoreActiveTab(),
  sidebarCollapsed: false,
  density: 'compact',
  view: 'workspace',
  theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system',
  expandedConnections: [],
  pinnedConnections: (() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kamehadb_pinned') ?? '[]') as unknown[];
      return raw.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    } catch {
      return [];
    }
  })(),
  connectionStatus: {},
  connectionLatency: {},
};

export const appStore = new Store<AppStoreState>(initialState);

export function setActiveConnection(id: number | null): void {
  appStore.setState((state) => ({ ...state, activeConnectionId: id, activeMongoDatabase: null }));
}

export function setActiveMongoDatabase(database: string | null): void {
  appStore.setState((state) => ({ ...state, activeMongoDatabase: database }));
}
