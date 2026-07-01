export type WorkspaceTab =
  | {
      readonly id: string;
      readonly type: 'table' | 'query' | 'redis-query' | 'redis' | 'graph' | 'stats' | 'database-stats';
      readonly title: string;
      readonly connectionId: string;
      readonly sql?: string;
      readonly command?: string;
      readonly autoRun?: boolean;
    }
  | {
      readonly id: string;
      readonly type: 'mongo';
      readonly title: string;
      readonly connectionId: string;
      readonly database: string;
      readonly collection: string;
    }
  | {
      readonly id: string;
      readonly type: 'mongo-query';
      readonly title: string;
      readonly connectionId: string;
      readonly database: string;
      readonly collection: string;
      readonly pipeline?: string;
    }
  | {
      readonly id: string;
      readonly type: 'qdrant';
      readonly title: string;
      readonly connectionId: string;
      readonly collection: string;
    }
  | {
      readonly id: string;
      readonly type: 'qdrant-search';
      readonly title: string;
      readonly connectionId: string;
      readonly collection?: string;
      readonly mode?: 'text' | 'similar' | 'raw';
      readonly pointId?: string | number;
    }
  | {
      readonly id: string;
      readonly type: 'qdrant-graph';
      readonly title: string;
      readonly connectionId: string;
      readonly collection: string;
      readonly colorBy?: string;
      readonly camera?: { readonly position: number[]; readonly target: number[] };
    }
  | {
      readonly id: string;
      readonly type: 'qdrant-stats';
      readonly title: string;
      readonly connectionId: string;
      readonly collection: string;
    }
  | {
      readonly id: string;
      readonly type: 'table-stats';
      readonly title: string;
      readonly connectionId: string;
      readonly tableId: string;
    }
  | { readonly id: string; readonly type: 'schema-timeline'; readonly title: string; readonly connectionId: string }
  | { readonly id: string; readonly type: 'schema-diff'; readonly title: string; readonly connectionId: string }
  | {
      readonly id: string;
      readonly type: 'migration';
      readonly title: string;
      readonly connectionId: string;
      readonly fromSnapshotId?: string;
      readonly toSnapshotId?: string;
    }
  | { readonly id: string; readonly type: 'postgres-psql'; readonly title: string; readonly connectionId: string }
  | { readonly id: string; readonly type: 'oracle-sqlplus'; readonly title: string; readonly connectionId: string }
  | {
      readonly id: string;
      readonly type: 'oracle-vec-search';
      readonly title: string;
      readonly connectionId: string;
      readonly table?: string;
      readonly schema?: string;
      readonly column?: string;
    }
  | { readonly id: string; readonly type: 'clickhouse-client'; readonly title: string; readonly connectionId: string }
  | { readonly id: string; readonly type: 'duckdb-cli'; readonly title: string; readonly connectionId: string }
  | {
      readonly id: string;
      readonly type: 'duckdb-vec-search';
      readonly title: string;
      readonly connectionId: string;
      readonly table?: string;
      readonly column?: string;
    }
  | {
      readonly id: string;
      readonly type: 'clickhouse-vec-search';
      readonly title: string;
      readonly connectionId: string;
      readonly table?: string;
      readonly column?: string;
    }
  | { readonly id: string; readonly type: 'tigerbeetle'; readonly title: string; readonly connectionId: string }
  | {
      readonly id: string;
      readonly type: 'postgres-vector-search';
      readonly title: string;
      readonly connectionId: string;
      readonly table?: string;
      readonly schema?: string;
      readonly column?: string;
      readonly vectorText?: string;
      readonly mode?: 'similar' | 'raw';
    }
  | {
      readonly id: string;
      readonly type: 'postgres-vector-map';
      readonly title: string;
      readonly connectionId: string;
      readonly table: string;
      readonly schema: string;
      readonly column: string;
      readonly camera?: { readonly position: [number, number, number]; readonly target: [number, number, number] };
    }
  | {
      readonly id: string;
      readonly type: 'mongo-shell';
      readonly title: string;
      readonly connectionId: string;
      readonly sessionId?: string;
    }
  | {
      readonly id: string;
      readonly type: 'sqlite-vec-search';
      readonly title: string;
      readonly connectionId: string;
      readonly table?: string;
      readonly column?: string;
      readonly vectorText?: string;
      readonly mode?: 'similar' | 'raw';
    }
  | {
      readonly id: string;
      readonly type: 'sqlite-vec-map';
      readonly title: string;
      readonly connectionId: string;
      readonly table: string;
      readonly column: string;
      readonly camera?: { readonly position: [number, number, number]; readonly target: [number, number, number] };
    };

export type AppView = 'workspace' | 'api-settings' | 'logs';

export type AppStoreState = {
  readonly activeConnectionId: string | null;
  readonly activeDatabaseId: string | null;
  readonly activeSchemaId: string | null;
  readonly activeTableId: string | null;
  readonly activeMongoDatabase: string | null;
  readonly aiPanelConnectionId: string | null;
  readonly openedTabs: readonly WorkspaceTab[];
  readonly activeTabId: string | null;
  readonly sidebarCollapsed: boolean;
  readonly density: 'compact' | 'comfortable';
  readonly view: AppView;
  readonly theme: 'light' | 'dark' | 'system';
  readonly expandedConnections: readonly string[];
  readonly pinnedConnections: readonly string[];
  readonly connectionLatency: Readonly<Record<string, number>>;
  readonly connectionStatus: Readonly<Record<string, 'connected' | 'slow' | 'disconnected' | 'reconnecting'>>;
};
