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
  COMPLETIONS: (connectionId: string | null) => ['completions', connectionId] as const,
  MONGO_DATABASES: (connectionId: string | null) => ['mongo', connectionId, 'databases'] as const,
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
  MONGO_STATS: (connectionId: string | null, database: string | null, collection: string | null) =>
    ['mongo-stats', connectionId, database, collection] as const,
  MONGO_COMPLETIONS: (connectionId: string | null) => ['mongo-completions', connectionId] as const,
  CHAT_HISTORY: (connectionId: string | null, mongoDatabase?: string) =>
    ['chat-history', connectionId, mongoDatabase] as const,
  REDIS_KEYS: (connectionId: string | null, pattern: string | null, cursor?: number) =>
    ['redis-keys', connectionId, pattern, cursor] as const,
  REDIS_KEY: (connectionId: string | null, key: string | null) => ['redis-key', connectionId, key] as const,
  REDIS_STATS: (connectionId: string | null) => ['redis-stats', connectionId] as const,
  QDRANT_COLLECTIONS: (connectionId: string | null) => ['qdrant-collections', connectionId] as const,
  QDRANT_POINTS: (
    connectionId: string | null,
    collection: string | null,
    offset?: string | number | null,
    filter?: Record<string, unknown>,
    limit?: number,
  ) => ['qdrant-points', connectionId, collection, offset ?? null, filter ?? null, limit] as const,
  QDRANT_STATS: (connectionId: string | null, collection: string | null) =>
    ['qdrant-stats', connectionId, collection] as const,
  QDRANT_MAP: (connectionId: string | null, collection: string | null) =>
    ['qdrant-map', connectionId, collection] as const,
  CONNECTION_HEALTH: (connectionId: string | null) => ['connection-health', connectionId] as const,
  ACTIVE_CONNECTIONS: (connectionId: string) => ['active-connections', connectionId] as const,
  TABLE_STATS: (connectionId: string) => ['table-stats', connectionId] as const,
  INDEX_STATS: (connectionId: string) => ['index-stats', connectionId] as const,
  DB_SIZES: (connectionId: string) => ['db-sizes', connectionId] as const,
  SCHEMA_CHANGELOG: (connectionId: string | null) => ['schema-changelog', connectionId] as const,
  AI_SETTINGS: ['ai-settings'] as const,
  QUERY_HISTORY: (connectionId: string | null) => ['query-history', connectionId] as const,
  QUERY_HISTORY_FAVORITES: (connectionId: string | null) => ['query-history-favorites', connectionId] as const,
  TB_ACCOUNTS: (connectionId: string | null, limit?: number) =>
    ['tigerbeetle', connectionId, 'accounts', limit] as const,
  TB_ACCOUNT: (connectionId: string | null, id: string | null) => ['tigerbeetle', connectionId, 'account', id] as const,
  TB_TRANSFERS: (connectionId: string | null, accountId: string | null) =>
    ['tigerbeetle', connectionId, 'transfers', accountId] as const,
  TB_BALANCES: (connectionId: string | null, accountId: string | null) =>
    ['tigerbeetle', connectionId, 'balances', accountId] as const,
} as const;

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];
