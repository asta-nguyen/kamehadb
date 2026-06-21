import { nanoid } from 'nanoid';
import type { WorkspaceTab } from '@kamehadb/shared';
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
      return { ...state, openedTabs: tabs, activeTabId: tab.id, activeConnectionId: tab.connectionId };
    }
    return {
      ...state,
      openedTabs: [...state.openedTabs, tab],
      activeTabId: tab.id,
      activeConnectionId: tab.connectionId,
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
    sql: sql ?? 'SELECT * FROM ',
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

export function openQdrantTab(connectionId: string, collection: string): void {
  openTab({ id: `${connectionId}:qdrant:${collection}`, type: 'qdrant', title: collection, connectionId, collection });
}

export function openQdrantSearchTab(
  connectionId: string,
  collection?: string,
  options?: { readonly mode?: 'text' | 'similar' | 'raw'; readonly pointId?: string | number },
): void {
  const tabCount = appStore.state.openedTabs.filter((tab) => tab.type === 'qdrant-search').length;
  openTab({
    id: `qdrant-search-${nanoid()}`,
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

export function openQdrantGraphTab(connectionId: string, collection: string): void {
  openTab({
    id: `${connectionId}:qdrant-graph:${collection}`,
    type: 'qdrant-graph',
    title: `Map: ${collection}`,
    connectionId,
    collection,
  });
}

export function openPostgresVectorSearchTab(
  connectionId: string,
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
    id: `postgres-vector-search-${nanoid()}`,
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
  connectionId: string,
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
      activeConnectionId: newActiveTab?.connectionId ?? null,
    };
  });
}

export function closeAllTabs(): void {
  appStore.setState((state) => ({ ...state, openedTabs: [], activeTabId: null }));
}
