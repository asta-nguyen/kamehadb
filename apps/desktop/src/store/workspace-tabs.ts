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

export function openNewQueryTab(connectionId: number, sql?: string, shouldAutoRun = false): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'query').length;
  openTab({
    id: `query-${crypto.randomUUID()}`,
    type: 'query',
    title: `Query ${tabCount + 1}`,
    connectionId,
    sql: sql ?? 'SELECT * FROM ',
    autoRun: shouldAutoRun,
  });
}

export function openQueryTabWithSql(connectionId: number, sql: string, shouldAutoRun = false): string {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'query').length;
  const tabId = `query-${crypto.randomUUID()}`;
  openTab({ id: tabId, type: 'query', title: `Query ${tabCount + 1}`, connectionId, sql, autoRun: shouldAutoRun });
  return tabId;
}

export function openGraphTab(connectionId: number): void {
  openTab({ id: `${connectionId}:graph`, type: 'graph', title: 'Schema Graph', connectionId });
}

export function openDatabaseStatsTab(connectionId: number): void {
  openTab({ id: `${connectionId}:db-stats`, type: 'database-stats', title: 'Database Stats', connectionId });
}

export function openSchemaTimelineTab(connectionId: number): void {
  openTab({ id: `${connectionId}:schema-timeline`, type: 'schema-timeline', title: 'Schema Timeline', connectionId });
}

export function openSchemaDiffTab(connectionId: number): void {
  openTab({ id: `${connectionId}:schema-diff`, type: 'schema-diff', title: 'Schema Diff', connectionId });
}

export function openMigrationTab(connectionId: number, fromSnapshotId?: number, toSnapshotId?: number): void {
  openTab({
    id: `${connectionId}:migration`,
    type: 'migration',
    title: 'Migration Assistant',
    connectionId,
    fromSnapshotId,
    toSnapshotId,
  });
}

export function openRedisTab(connectionId: number): void {
  openTab({ id: `${connectionId}:redis`, type: 'redis', title: 'Redis Browser', connectionId });
}

export function openRedisQueryTab(connectionId: number): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'redis-query').length;
  openTab({
    id: `redis-query-${crypto.randomUUID()}`,
    type: 'redis-query',
    title: `Redis Query ${tabCount + 1}`,
    connectionId,
    command: '',
  });
}

export function openTigerBeetleTab(connectionId: number): void {
  openTab({ id: `${connectionId}:tigerbeetle`, type: 'tigerbeetle', title: 'TigerBeetle Explorer', connectionId });
}

export function openTigerBeetleStatsTab(connectionId: number): void {
  openTab({
    id: `${connectionId}:tigerbeetle-stats`,
    type: 'tigerbeetle-stats',
    title: 'TigerBeetle Stats',
    connectionId,
  });
}

export function openMongoQueryTab(connectionId: number, database: string, collection: string): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'mongo-query').length;
  openTab({
    id: `mongo-query-${crypto.randomUUID()}`,
    type: 'mongo-query',
    title: `Aggregate ${collection || tabCount + 1}`,
    connectionId,
    database,
    collection,
  });
}

export function openQdrantTab(connectionId: number, collection: string): void {
  openTab({ id: `${connectionId}:qdrant:${collection}`, type: 'qdrant', title: collection, connectionId, collection });
}

export function openQdrantSearchTab(
  connectionId: number,
  collection?: string,
  options?: { readonly mode?: 'text' | 'similar' | 'raw'; readonly pointId?: string | number },
): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'qdrant-search').length;
  openTab({
    id: `qdrant-search-${crypto.randomUUID()}`,
    type: 'qdrant-search',
    title: options?.pointId
      ? `Similar to ${options.pointId}`
      : collection
        ? `Search ${collection}`
        : `Vector Search ${tabCount + 1}`,
    connectionId,
    collection,
    mode: options?.mode,
    pointId: options?.pointId,
  });
}

export function openQdrantGraphTab(connectionId: number, collection: string): void {
  openTab({
    id: `${connectionId}:qdrant-graph:${collection}`,
    type: 'qdrant-graph',
    title: `Map: ${collection}`,
    connectionId,
    collection,
  });
}

export function openPostgresVectorSearchTab(
  connectionId: number,
  options?: {
    readonly schema?: string;
    readonly table?: string;
    readonly column?: string;
    readonly vectorText?: string;
    readonly mode?: 'similar' | 'raw';
  },
): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'postgres-vector-search').length;
  openTab({
    id: `postgres-vector-search-${crypto.randomUUID()}`,
    type: 'postgres-vector-search',
    title: options?.table ? `Vector Search ${options.table}` : `Vector Search ${tabCount + 1}`,
    connectionId,
    schema: options?.schema,
    table: options?.table,
    column: options?.column,
    vectorText: options?.vectorText,
    mode: options?.mode,
  });
}

export function openPostgresVectorMapTab(
  connectionId: number,
  options: {
    readonly schema: string;
    readonly table: string;
    readonly column: string;
  },
): void {
  openTab({
    id: `${connectionId}:postgres-vector-map:${options.schema}.${options.table}.${options.column}`,
    type: 'postgres-vector-map',
    title: `Vector Map ${options.table}`,
    connectionId,
    schema: options.schema,
    table: options.table,
    column: options.column,
  });
}

export function updateTabPostgresVectorMapState(
  tabId: string,
  updates: {
    readonly camera?: { readonly position: [number, number, number]; readonly target: [number, number, number] };
  },
): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) =>
      tab.id === tabId && tab.type === 'postgres-vector-map' ? { ...tab, ...updates } : tab,
    ),
  }));
}

export function updateTabSql(tabId: string, sql: string): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) => (tab.id === tabId ? { ...tab, sql } : tab)),
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

export function updateTabQdrantGraphState(
  tabId: string,
  updates: { readonly colorBy?: string; readonly camera?: { readonly position: number[]; readonly target: number[] } },
): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) =>
      tab.id === tabId && tab.type === 'qdrant-graph' ? { ...tab, ...updates } : tab,
    ),
  }));
}

export function openMongoShellTab(connectionId: number): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'mongo-shell').length;
  openTab({
    id: `mongo-shell-${crypto.randomUUID()}`,
    type: 'mongo-shell',
    title: `Mongo Shell ${tabCount + 1}`,
    connectionId,
  });
}

export function openPostgresPsqlTab(connectionId: number): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'postgres-psql').length;
  openTab({
    id: `postgres-psql-${crypto.randomUUID()}`,
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

export function openSqliteVecSearchTab(
  connectionId: number,
  options?: {
    readonly table?: string;
    readonly column?: string;
    readonly vectorText?: string;
    readonly mode?: 'similar' | 'raw';
  },
): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'sqlite-vec-search').length;
  openTab({
    id: `sqlite-vec-search-${crypto.randomUUID()}`,
    type: 'sqlite-vec-search',
    title: options?.table ? `Vector Search ${options.table}` : `Vector Search ${tabCount + 1}`,
    connectionId,
    table: options?.table,
    column: options?.column,
    vectorText: options?.vectorText,
    mode: options?.mode,
  });
}

export function openSqliteVecMapTab(
  connectionId: number,
  options: {
    readonly table: string;
    readonly column: string;
  },
): void {
  openTab({
    id: `${connectionId}:sqlite-vec-map:${options.table}.${options.column}`,
    type: 'sqlite-vec-map',
    title: `Vector Map ${options.table}`,
    connectionId,
    table: options.table,
    column: options.column,
  });
}

export function updateTabSqliteVecMapState(
  tabId: string,
  updates: {
    readonly camera?: { readonly position: [number, number, number]; readonly target: [number, number, number] };
  },
): void {
  appStore.setState((state) => ({
    ...state,
    openedTabs: state.openedTabs.map((tab) =>
      tab.id === tabId && tab.type === 'sqlite-vec-map' ? { ...tab, ...updates } : tab,
    ),
  }));
}

export function openFederatedQueryTab(): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'federated-query').length;
  openTab({
    id: `federated-query-${crypto.randomUUID()}`,
    type: 'federated-query',
    title: `Federated Query ${tabCount + 1}`,
    connectionIds: [],
  });
  // Switch to workspace view in case the tab was opened from global search
  // while the app was on the Logs or API Settings view.
  appStore.setState((state) => ({ ...state, view: 'workspace' }));
}

export function updateTabFederatedConnections(tabId: string, connectionIds: readonly number[]): void {
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
