export type WorkspaceTab =
  | {
      readonly id: string;
      readonly type: 'table' | 'query' | 'redis-query' | 'redis' | 'graph' | 'stats' | 'database-stats';
      readonly title: string;
      readonly connectionId: number;
      readonly sql?: string;
      readonly command?: string;
      readonly autoRun?: boolean;
    }
  | {
      readonly id: string;
      readonly type: 'mongo';
      readonly title: string;
      readonly connectionId: number;
      readonly database: string;
      readonly collection: string;
    }
  | {
      readonly id: string;
      readonly type: 'mongo-query';
      readonly title: string;
      readonly connectionId: number;
      readonly database: string;
      readonly collection: string;
      readonly pipeline?: string;
    }
  | {
      readonly id: string;
      readonly type: 'qdrant';
      readonly title: string;
      readonly connectionId: number;
      readonly collection: string;
    }
  | {
      readonly id: string;
      readonly type: 'qdrant-search';
      readonly title: string;
      readonly connectionId: number;
      readonly collection?: string;
      readonly mode?: 'text' | 'similar' | 'raw';
      readonly pointId?: string | number;
    }
  | {
      readonly id: string;
      readonly type: 'qdrant-graph';
      readonly title: string;
      readonly connectionId: number;
      readonly collection: string;
      readonly colorBy?: string;
      readonly camera?: { readonly position: number[]; readonly target: number[] };
    }
  | {
      readonly id: string;
      readonly type: 'qdrant-stats';
      readonly title: string;
      readonly connectionId: number;
      readonly collection: string;
    }
  | {
      readonly id: string;
      readonly type: 'table-stats';
      readonly title: string;
      readonly connectionId: number;
      readonly tableId: string;
    }
  | { readonly id: string; readonly type: 'schema-timeline'; readonly title: string; readonly connectionId: number }
  | { readonly id: string; readonly type: 'schema-diff'; readonly title: string; readonly connectionId: number }
  | {
      readonly id: string;
      readonly type: 'migration';
      readonly title: string;
      readonly connectionId: number;
      readonly fromSnapshotId?: number;
      readonly toSnapshotId?: number;
    }
  | { readonly id: string; readonly type: 'postgres-psql'; readonly title: string; readonly connectionId: number }
  | { readonly id: string; readonly type: 'tigerbeetle'; readonly title: string; readonly connectionId: number }
  | { readonly id: string; readonly type: 'tigerbeetle-stats'; readonly title: string; readonly connectionId: number }
  | {
      readonly id: string;
      readonly type: 'postgres-vector-search';
      readonly title: string;
      readonly connectionId: number;
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
      readonly connectionId: number;
      readonly table: string;
      readonly schema: string;
      readonly column: string;
      readonly camera?: { readonly position: [number, number, number]; readonly target: [number, number, number] };
    }
  | {
      readonly id: string;
      readonly type: 'mongo-shell';
      readonly title: string;
      readonly connectionId: number;
      readonly sessionId?: string;
    }
  | {
      readonly id: string;
      readonly type: 'sqlite-vec-search';
      readonly title: string;
      readonly connectionId: number;
      readonly table?: string;
      readonly column?: string;
      readonly vectorText?: string;
      readonly mode?: 'similar' | 'raw';
    }
  | {
      readonly id: string;
      readonly type: 'sqlite-vec-map';
      readonly title: string;
      readonly connectionId: number;
      readonly table: string;
      readonly column: string;
      readonly camera?: { readonly position: [number, number, number]; readonly target: [number, number, number] };
    }
  | {
      readonly id: string;
      readonly type: 'federated-query';
      readonly title: string;
      readonly connectionIds: readonly number[];
      readonly sql?: string;
    };

export type AppView = 'workspace' | 'api-settings' | 'logs';

/** A pending AI prompt queued by a schema-tree right-click action. Carries the
 * prompt text and optional tableId so the sidecar can scope schema context. */
export type PendingAiPrompt = {
  readonly prompt: string;
  readonly tableId?: string;
};

export type AppStoreState = {
  readonly activeConnectionId: number | null;
  readonly activeDatabaseId: string | null;
  readonly activeSchemaId: string | null;
  readonly activeTableId: string | null;
  readonly activeMongoDatabase: string | null;
  readonly aiPanelConnectionId: number | null;
  readonly pendingAiPrompt: PendingAiPrompt | null;
  readonly openedTabs: readonly WorkspaceTab[];
  readonly activeTabId: string | null;
  readonly sidebarCollapsed: boolean;
  readonly density: 'compact' | 'comfortable';
  readonly view: AppView;
  readonly theme: 'light' | 'dark' | 'system';
  readonly expandedConnections: readonly number[];
  readonly pinnedConnections: readonly number[];
  readonly connectionLatency: Readonly<Record<number, number>>;
  readonly connectionStatus: Readonly<Record<number, 'connected' | 'slow' | 'disconnected' | 'reconnecting'>>;
};
