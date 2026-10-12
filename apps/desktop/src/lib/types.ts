export type WorkspaceTab = {
  readonly pinned?: boolean;
} & (
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
  | {
      readonly id: string;
      readonly type: 'mongo-shell';
      readonly title: string;
      readonly connectionId: string;
      readonly sessionId?: string;
    }
  | {
      readonly id: string;
      readonly type: 'federated-query';
      readonly title: string;
      readonly connectionIds: readonly string[];
      readonly sql?: string;
    }
);

export type AppView = 'workspace' | 'api-settings' | 'logs';

/** A pending AI prompt queued by a schema-tree right-click action. Carries the
 * prompt text and optional tableId so the backend can scope schema context. */
export type PendingAiPrompt = {
  readonly prompt: string;
  readonly tableId?: string;
};

export type AppStoreState = {
  readonly activeConnectionId: string | null;
  readonly activeDatabaseId: string | null;
  readonly activeSchemaId: string | null;
  readonly activeTableId: string | null;
  readonly activeMongoDatabase: string | null;
  readonly aiPanelConnectionId: string | null;
  readonly pendingAiPrompt: PendingAiPrompt | null;
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
