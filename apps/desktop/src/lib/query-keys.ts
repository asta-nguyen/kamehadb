export const QUERY_KEYS = {
  CONNECTIONS: ['connections'] as const,
  CONNECTION: (id: string | null) => ['connection', id] as const,
  SCHEMA: (connectionId: string | null) => ['schema', connectionId] as const,
  TABLES: (connectionId: string | null, tableOrSchema?: string | import('@kamehadb/shared').PreviewRowsInput | null) =>
    ['tables', connectionId, tableOrSchema] as const,
  COLUMNS: (connectionId: string | null, tableId?: string | null) => ['columns', connectionId, tableId] as const,
  INDEXES: (connectionId: string | null, tableId?: string | null) => ['indexes', connectionId, tableId] as const,
  PREVIEW: (connectionId: string | null, input?: import('@kamehadb/shared').PreviewRowsInput | null) =>
    ['preview', connectionId, input] as const,
  DATABASES: (connectionId: string | null, schema?: string | null) => ['databases', connectionId, schema] as const,
  SCHEMAS: (connectionId: string | null) => ['schemas', connectionId] as const,
  COMPLETIONS: (connectionId: string | null) => ['autocomplete', connectionId] as const,
  MONGO_DATABASES: (connectionId: string | null) => ['mongo-databases', connectionId] as const,
  MONGO_COLLECTIONS: (connectionId: string | null, db: string | null) =>
    ['mongo', connectionId, db, 'collections'] as const,
  MONGO_DOCUMENTS: (
    connectionId: string | null,
    database: string | null,
    collection: string | null,
    filter?: Record<string, unknown>,
    sort?: Record<string, 1 | -1>,
    limit?: number,
    skip?: number,
    search?: string,
  ) =>
    [
      'mongo',
      connectionId,
      database,
      collection,
      'documents',
      JSON.stringify({ filter, sort, limit, skip, search }),
    ] as const,
  /** Prefix key for invalidating all document caches for a collection. */
  MONGO_DOCUMENTS_PREFIX: (connectionId: string | null, database: string | null, collection: string | null) =>
    ['mongo', connectionId, database, collection, 'documents'] as const,
  MONGO_STATS: (connectionId: string | null, database: string | null, collection: string | null) =>
    ['mongo-stats', connectionId, database, collection] as const,
  MONGO_COMPLETIONS: (connectionId: string | null) => ['mongo-completions', connectionId] as const,
  CHAT_HISTORY: (connectionId: string | null, mongoDatabase?: string) =>
    ['chat-history', connectionId, mongoDatabase] as const,
  REDIS_KEYS: (connectionId: string | null, pattern: string | null, cursor?: number) =>
    ['redis-keys', connectionId, pattern, cursor] as const,
  REDIS_KEY: (connectionId: string | null, key: string | null) => ['redis-key', connectionId, key] as const,
  REDIS_STATS: (connectionId: string | null) => ['redis-stats', connectionId] as const,
  ACTIVE_CONNECTIONS: (connectionId: string) => ['active-connections', connectionId] as const,
  TABLE_STATS: (connectionId: string | null, tableId?: string | null) =>
    tableId ? (['table-stats', connectionId, tableId] as const) : (['table-stats', connectionId] as const),
  INDEX_STATS: (connectionId: string | null, tableId?: string | null) =>
    tableId ? (['index-stats', connectionId, tableId] as const) : (['index-stats', connectionId] as const),
  DB_SIZES: (connectionId: string) => ['db-sizes', connectionId] as const,
  SCHEMA_SNAPSHOTS: (connectionId: string | null) => ['schema-snapshots', connectionId] as const,
  SCHEMA_CHANGELOG: (connectionId: string | null) => ['schema-changelog', connectionId] as const,
  SCHEMA_DIFF: (connectionId: string | null, input?: import('@kamehadb/shared').SchemaDiffInput | null) =>
    ['schema-diff', connectionId, input ?? null] as const,
  SCHEMA_WATCHER: (connectionId: string | null) => ['schema-watcher', connectionId] as const,
  AI_SETTINGS: ['ai-settings'] as const,
  MCP_SETTINGS: ['mcp-settings'] as const,
  MCP_ACCOUNTS: ['mcp-accounts'] as const,
  QUERY_HISTORY: (connectionId: string | null) => ['query-history', connectionId] as const,
  QUERY_HISTORY_FAVORITES: (connectionId: string | null) => ['query-history-favorites', connectionId] as const,
} as const;

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];
