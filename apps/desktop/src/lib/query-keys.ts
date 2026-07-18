export const QUERY_KEYS = {
  CONNECTIONS: ['connections'] as const,
  CONNECTION: (id: number | null) => ['connection', id] as const,
  SCHEMA: (connectionId: number | null) => ['schema', connectionId] as const,
  TABLES: (connectionId: number | null, tableOrSchema?: string | import('@kamehadb/shared').PreviewRowsInput | null) =>
    ['tables', connectionId, tableOrSchema] as const,
  COLUMNS: (connectionId: number | null, tableId?: string | null) => ['columns', connectionId, tableId] as const,
  INDEXES: (connectionId: number | null, tableId?: string | null) => ['indexes', connectionId, tableId] as const,
  PREVIEW: (connectionId: number | null, input?: import('@kamehadb/shared').PreviewRowsInput | null) =>
    ['preview', connectionId, input] as const,
  DATABASES: (connectionId: number | null, schema?: string | null) => ['databases', connectionId, schema] as const,
  SCHEMAS: (connectionId: number | null) => ['schemas', connectionId] as const,
  COMPLETIONS: (connectionId: number | null) => ['autocomplete', connectionId] as const,
  MONGO_DATABASES: (connectionId: number | null) => ['mongo-databases', connectionId] as const,
  MONGO_COLLECTIONS: (connectionId: number | null, db: string | null) =>
    ['mongo', connectionId, db, 'collections'] as const,
  MONGO_DOCUMENTS: (
    connectionId: number | null,
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
  MONGO_DOCUMENTS_PREFIX: (connectionId: number | null, database: string | null, collection: string | null) =>
    ['mongo', connectionId, database, collection, 'documents'] as const,
  MONGO_STATS: (connectionId: number | null, database: string | null, collection: string | null) =>
    ['mongo-stats', connectionId, database, collection] as const,
  MONGO_COMPLETIONS: (connectionId: number | null) => ['mongo-completions', connectionId] as const,
  CHAT_HISTORY: (connectionId: number | null, mongoDatabase?: string) =>
    ['chat-history', connectionId, mongoDatabase] as const,
  REDIS_KEYS: (connectionId: number | null, pattern: string | null, cursor?: number) =>
    ['redis-keys', connectionId, pattern, cursor] as const,
  REDIS_KEY: (connectionId: number | null, key: string | null) => ['redis-key', connectionId, key] as const,
  REDIS_STATS: (connectionId: number | null) => ['redis-stats', connectionId] as const,
  QDRANT_COLLECTIONS: (connectionId: number | null) => ['qdrant-collections', connectionId] as const,
  QDRANT_POINTS: (
    connectionId: number | null,
    collection: string | null,
    offset?: string | number | null,
    filter?: Record<string, unknown>,
    limit?: number,
  ) => ['qdrant-points', connectionId, collection, offset ?? null, filter ?? null, limit] as const,
  QDRANT_STATS: (connectionId: number | null, collection: string | null) =>
    ['qdrant-stats', connectionId, collection] as const,
  QDRANT_MAP: (connectionId: number | null, collection: string | null) =>
    ['qdrant-map', connectionId, collection] as const,
  POSTGRES_VECTOR_CAPABILITIES: (connectionId: number | null) =>
    ['postgres-vector-capabilities', connectionId] as const,
  POSTGRES_VECTOR_SAMPLE: (
    connectionId: number | null,
    input?: import('@kamehadb/shared').PostgresVectorSampleInput | null,
  ) => ['postgres-vector-sample', connectionId, input] as const,
  SQLITE_VEC_CAPABILITIES: (connectionId: number | null) => ['sqlite-vec-capabilities', connectionId] as const,
  ACTIVE_CONNECTIONS: (connectionId: number) => ['active-connections', connectionId] as const,
  TABLE_STATS: (connectionId: number | null, tableId?: string | null) =>
    tableId ? (['table-stats', connectionId, tableId] as const) : (['table-stats', connectionId] as const),
  INDEX_STATS: (connectionId: number | null, tableId?: string | null) =>
    tableId ? (['index-stats', connectionId, tableId] as const) : (['index-stats', connectionId] as const),
  DB_SIZES: (connectionId: number) => ['db-sizes', connectionId] as const,
  SCHEMA_SNAPSHOTS: (connectionId: number | null) => ['schema-snapshots', connectionId] as const,
  SCHEMA_CHANGELOG: (connectionId: number | null) => ['schema-changelog', connectionId] as const,
  SCHEMA_DIFF: (connectionId: number | null, input?: import('@kamehadb/shared').SchemaDiffInput | null) =>
    ['schema-diff', connectionId, input ?? null] as const,
  SCHEMA_WATCHER: (connectionId: number | null) => ['schema-watcher', connectionId] as const,
  AI_SETTINGS: ['ai-settings'] as const,
  QUERY_HISTORY: (connectionId: number | null) => ['query-history', connectionId] as const,
  QUERY_HISTORY_FAVORITES: (connectionId: number | null) => ['query-history-favorites', connectionId] as const,
  TB_ACCOUNTS: (connectionId: number | null, limit?: number) =>
    ['tigerbeetle', connectionId, 'accounts', limit] as const,
  TB_ACCOUNT: (connectionId: number | null, id: string | null) => ['tigerbeetle', connectionId, 'account', id] as const,
  TB_TRANSFERS: (connectionId: number | null, accountId: string | null) =>
    ['tigerbeetle', connectionId, 'transfers', accountId] as const,
  TB_BALANCES: (connectionId: number | null, accountId: string | null) =>
    ['tigerbeetle', connectionId, 'balances', accountId] as const,
} as const;

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];
