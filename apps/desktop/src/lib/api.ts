import { getApiBase, request } from './api-client';

export const api = {
  request,
  health: () => request<{ status: string; uptime: number; version: string }>('GET', '/health'),

  listConnections: () => request<import('@kamehadb/shared').ConnectionProfile[]>('GET', '/connections'),

  getConnection: (id: number) => request<import('@kamehadb/shared').ConnectionProfile>('GET', `/connections/${id}`),

  backupFileDatabase: (connectionId: number, input: import('@kamehadb/shared').FileDatabaseBackupRequest) =>
    request<import('@kamehadb/shared').FileDatabaseMaintenanceResult>(
      'POST',
      `/connections/${connectionId}/backup`,
      input,
    ),

  restoreFileDatabase: (connectionId: number, input: import('@kamehadb/shared').FileDatabaseRestoreRequest) =>
    request<import('@kamehadb/shared').FileDatabaseMaintenanceResult>(
      'POST',
      `/connections/${connectionId}/restore`,
      input,
    ),

  createConnection: (input: import('@kamehadb/shared').CreateConnectionProfileInput) =>
    request<import('@kamehadb/shared').ConnectionProfile>('POST', '/connections', input),

  updateConnection: (id: number, input: import('@kamehadb/shared').UpdateConnectionProfileInput) =>
    request<import('@kamehadb/shared').ConnectionProfile>('PATCH', `/connections/${id}`, input),

  deleteConnection: (id: number) => request<void>('DELETE', `/connections/${id}`),

  testConnection: (input: import('@kamehadb/shared').CreateConnectionProfileInput) =>
    request<import('@kamehadb/shared').TestConnectionResult>('POST', '/connections/test', input),

  checkConnectionHealth: (id: number) =>
    request<import('@kamehadb/shared').TestConnectionResult>('GET', `/connections/${id}/health`),

  getAISettings: () => request<import('@kamehadb/shared').AISettings>('GET', '/ai/settings'),

  fetchAvailableModels: (baseUrl: string, apiKey?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ baseUrl });
    if (apiKey) params.set('apiKey', apiKey);
    return request<{ models: string[] }>('GET', `/ai/models?${params}`, undefined, false, signal);
  },

  saveAISettings: (input: import('@kamehadb/shared').AISettings) =>
    request<{ success: boolean }>('POST', '/ai/settings', input),

  getChatHistory: (connectionId: number, limit = 50, mongoDatabase?: string) => {
    const dbParam = mongoDatabase ? `&database=${encodeURIComponent(mongoDatabase)}` : '';
    return request<{
      messages: {
        id: string;
        connectionId: number;
        mongoDatabase?: string;
        role: 'user' | 'assistant';
        content: string;
        createdAt: string;
      }[];
    }>(`GET`, `/ai/chat-history/${connectionId}?limit=${limit}${dbParam}`);
  },

  clearChatHistory: (connectionId: number, mongoDatabase?: string) => {
    const dbParam = mongoDatabase ? `?database=${encodeURIComponent(mongoDatabase)}` : '';
    return request<{ success: boolean }>('DELETE', `/ai/chat-history/${connectionId}${dbParam}`);
  },

  clearSchemaCache: (connectionId: number) =>
    request<{ success: boolean }>('POST', `/ai/clear-schema-cache/${connectionId}`),

  searchSchema: (connectionId: number, query: string, schema?: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (schema) params.set('schema', schema);
    if (limit) params.set('limit', String(limit));
    return request<import('@kamehadb/shared').SchemaSearchMatch[]>(
      'GET',
      `/sql/${connectionId}/schema/search?${params}`,
    );
  },

  // PostgreSQL stats
  getTableStats: (connectionId: number, tableId: string) =>
    request<import('@kamehadb/shared').TableStats>(
      'GET',
      `/sql/${connectionId}/tables/${encodeURIComponent(tableId)}/stats`,
    ),

  getIndexStats: (connectionId: number, tableId: string) =>
    request<import('@kamehadb/shared').IndexStats[]>(
      'GET',
      `/sql/${connectionId}/tables/${encodeURIComponent(tableId)}/indexes/stats`,
    ),

  getDatabaseSizes: (connectionId: number, schema?: string) => {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    return request<import('@kamehadb/shared').DatabaseSize[]>('GET', `/sql/${connectionId}/database/sizes${query}`);
  },

  getActiveConnections: (connectionId: number) =>
    request<import('@kamehadb/shared').ConnectionInfo[]>('GET', `/sql/${connectionId}/sessions`),

  captureSchemaSnapshot: (connectionId: number) =>
    request<{ id: number; capturedAt: string; tableCount: number }>('POST', `/sql/${connectionId}/schema/snapshots`),

  getSchemaSnapshots: (connectionId: number) =>
    request<{ snapshots: readonly import('@kamehadb/shared').SchemaSnapshotSummary[] }>(
      'GET',
      `/sql/${connectionId}/schema/snapshots`,
    ),

  getSchemaChangelog: (connectionId: number) =>
    request<import('@kamehadb/shared').SchemaChangelog>('GET', `/sql/${connectionId}/schema/changelog`),

  getSchemaDiff: (connectionId: number, input: import('@kamehadb/shared').SchemaDiffInput) =>
    request<import('@kamehadb/shared').SchemaDiffResult>('POST', `/sql/${connectionId}/schema/diff`, input),

  generateMigration: (connectionId: number, input: import('@kamehadb/shared').MigrationInput) =>
    request<import('@kamehadb/shared').MigrationResult>('POST', `/sql/${connectionId}/schema/migrations`, input),

  startSchemaWatcher: (connectionId: number, intervalMs?: number) =>
    request<{ ok: boolean }>('POST', `/sql/${connectionId}/schema/watcher/start`, { intervalMs }),

  stopSchemaWatcher: (connectionId: number) =>
    request<{ ok: boolean }>('POST', `/sql/${connectionId}/schema/watcher/stop`),

  getSchemaWatcherStatus: (connectionId: number) =>
    request<import('@kamehadb/shared').SchemaWatcherStatus>('GET', `/sql/${connectionId}/schema/watcher/status`),

  startSchemaNotifyWatcher: (connectionId: number) =>
    request<{ ok: boolean }>('POST', `/sql/${connectionId}/schema/watcher/notify/start`),

  stopSchemaNotifyWatcher: (connectionId: number) =>
    request<{ ok: boolean }>('POST', `/sql/${connectionId}/schema/watcher/notify/stop`),

  // PostgreSQL pgvector API
  getPostgresVectorCapabilities: (connectionId: number) =>
    request<import('@kamehadb/shared').PostgresVectorCapability>(
      'GET',
      `/sql/${connectionId}/vectors/capabilities`,
      undefined,
    ),

  searchPostgresVector: (connectionId: number, input: import('@kamehadb/shared').PostgresVectorSearchInput) =>
    request<import('@kamehadb/shared').PostgresVectorSearchResult>(
      'POST',
      `/sql/${connectionId}/vectors/search`,
      input,
    ),

  getPostgresVectorSample: (connectionId: number, input: import('@kamehadb/shared').PostgresVectorSampleInput) =>
    request<import('@kamehadb/shared').PostgresVectorSampleResult>(
      'POST',
      `/sql/${connectionId}/vectors/sample`,
      input,
    ),

  // sqlite-vec API
  getSqliteVecCapabilities: (connectionId: number) =>
    request<import('@kamehadb/shared').SqliteVecCapability>(
      'GET',
      `/sql/${connectionId}/sqlite-vec/capabilities`,
      undefined,
    ),

  searchSqliteVec: (connectionId: number, input: import('@kamehadb/shared').SqliteVecSearchInput) =>
    request<import('@kamehadb/shared').SqliteVecSearchResult>(
      'POST',
      `/sql/${connectionId}/sqlite-vec/search`,
      input,
      true,
    ),

  sampleSqliteVec: (connectionId: number, input: { table: string; column: string }) =>
    request<{ vector: number[]; dimensions: number }>('POST', `/sql/${connectionId}/sqlite-vec/sample`, input, true),

  sampleSqliteVecVectors: (connectionId: number, input: { table: string; column: string; limit: number }) =>
    request<{
      points: { id: string | number; vector: number[]; payload: Record<string, unknown> }[];
      dimensions: number;
    }>('POST', `/sql/${connectionId}/sqlite-vec/vectors/sample`, input),

  // MongoDB API
  listMongoDatabases: (connectionId: number) =>
    request<import('@kamehadb/shared').DatabaseInfo[]>('GET', `/mongo/${connectionId}/databases`, undefined, true),

  listMongoCollections: (connectionId: number, database?: string) => {
    const query = database ? `?database=${encodeURIComponent(database)}` : '';
    return request<import('@kamehadb/shared').CollectionInfo[]>(
      'GET',
      `/mongo/${connectionId}/collections${query}`,
      undefined,
    );
  },

  findMongoDocuments: (connectionId: number, input: import('@kamehadb/shared').FindDocumentsInput) =>
    request<import('@kamehadb/shared').DocumentResult>('POST', `/mongo/${connectionId}/find`, input, true),

  deleteMongoDocument: (
    connectionId: number,
    input: { collection: string; database?: string; filter: Record<string, unknown> },
  ) => request<{ deletedCount: number }>('POST', `/mongo/${connectionId}/delete`, input),

  updateMongoDocument: (
    connectionId: number,
    input: { collection: string; database?: string; filter: Record<string, unknown>; update: Record<string, unknown> },
  ) => request<{ matchedCount: number; modifiedCount: number }>('POST', `/mongo/${connectionId}/update`, input),

  getMongoCollectionStats: (connectionId: number, database: string, collection: string) =>
    request<{ documentCount: number; indexes: { name: string; key: Record<string, unknown>; unique: boolean }[] }>(
      'GET',
      `/mongo/${connectionId}/stats?database=${encodeURIComponent(database)}&collection=${encodeURIComponent(collection)}`,
      undefined,
    ),

  // Redis API
  getRedisStats: (connectionId: number) =>
    request<import('@kamehadb/shared').RedisStats>('GET', `/redis/${connectionId}/stats`, undefined, true),

  runRedisCommand: (connectionId: number, command: string) =>
    request<import('@kamehadb/shared').RedisCommandResult>(
      'POST',
      `/redis/${connectionId}/commands`,
      { command },
      true,
    ),

  // MongoDB shell
  startMongoShell: (connectionId: number, cols = 80, rows = 24) =>
    request<{ sessionId: string }>('POST', `/mongo/${connectionId}/shell`, { cols, rows }, true),

  writeMongoShell: (sessionId: string, data: string) =>
    request<void>('POST', `/mongo/shell/${sessionId}/write`, { data }),

  /** Check if a shell session is still alive (204 = alive, 404 = dead).
   *  Distinguish 404 (no such session) from transient server errors — don't
   *  kill a healthy session on a temporary 5xx. */
  pingMongoShell: (sessionId: string) =>
    fetch(`${getApiBase()}/mongo/shell/${sessionId}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: '' }),
    }).then((r) => {
      if (r.ok) return true;
      if (r.status === 404) return false;
      return true; // transient server error — keep session alive
    }),

  stopMongoShell: (sessionId: string) => request<void>('DELETE', `/mongo/shell/${sessionId}`, undefined),

  resizeMongoShell: (sessionId: string, cols: number, rows: number) =>
    // MongoDB autocomplete
    request<void>('POST', `/mongo/shell/${sessionId}/resize`, { cols, rows }),

  getShellStreamUrl: (connectionId: number, sessionId: string) =>
    `${getApiBase()}/mongo/${connectionId}/shell/${sessionId}/stream`,

  getMongoCompletions: (connectionId: number, database?: string) => {
    const query = database ? `?database=${encodeURIComponent(database)}` : '';
    return request<{ collections: { name: string; fields: string[] }[] }>(
      'GET',
      `/mongo/${connectionId}/autocomplete${query}`,
      undefined,
    );
  },

  // MongoDB command
  runMongoCommand: (connectionId: number, database: string, command: Record<string, unknown>) =>
    request<unknown>('POST', `/mongo/${connectionId}/command`, { database, command }, true),

  // Qdrant API
  listQdrantCollections: (connectionId: number) =>
    request<import('@kamehadb/shared').QdrantCollection[]>(
      'GET',
      `/qdrant/${connectionId}/collections`,
      undefined,
      true,
    ),

  scrollQdrantPoints: (connectionId: number, input: import('@kamehadb/shared').ScrollPointsInput) =>
    request<import('@kamehadb/shared').QdrantPointPage>('POST', `/qdrant/${connectionId}/points`, input, true),

  searchQdrant: (connectionId: number, input: import('@kamehadb/shared').QdrantSearchInput) =>
    request<import('@kamehadb/shared').QdrantSearchResult>('POST', `/qdrant/${connectionId}/search`, input, true),

  recommendQdrant: (connectionId: number, input: import('@kamehadb/shared').RecommendInput) =>
    request<import('@kamehadb/shared').QdrantSearchResult>('POST', `/qdrant/${connectionId}/recommend`, input, true),

  getQdrantStats: (connectionId: number, collection: string) =>
    request<import('@kamehadb/shared').QdrantStats>(
      'GET',
      `/qdrant/${connectionId}/stats?collection=${encodeURIComponent(collection)}`,
      undefined,
    ),

  embedText: (text: string, model?: string) =>
    request<{ vector: number[]; dimensions: number }>('POST', `/ai/embed`, { text, model }),

  // TigerBeetle API
  tbListAccounts: (connectionId: number, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return request<{ accounts: import('@kamehadb/shared').TigerBeetleAccount[] }>(
      'GET',
      `/tigerbeetle/${connectionId}/accounts${query}`,
      undefined,
    );
  },

  tbLookupAccount: (connectionId: number, id: string) =>
    request<import('@kamehadb/shared').TigerBeetleAccount>(
      'GET',
      `/tigerbeetle/${connectionId}/accounts/${id}`,
      undefined,
    ),

  tbCreateAccounts: (connectionId: number, accounts: import('@kamehadb/shared').CreateTigerBeetleAccountInput[]) =>
    request<{ results: import('@kamehadb/shared').TigerBeetleCreateResult[] }>(
      'POST',
      `/tigerbeetle/${connectionId}/accounts`,
      { accounts },
    ),

  tbGetTransfers: (connectionId: number, accountId: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return request<{ transfers: import('@kamehadb/shared').TigerBeetleTransfer[] }>(
      'GET',
      `/tigerbeetle/${connectionId}/transfers/${accountId}${query}`,
      undefined,
    );
  },

  tbGetBalances: (connectionId: number, accountId: string) =>
    request<{ balances: import('@kamehadb/shared').TigerBeetleAccountBalance[] }>(
      'GET',
      `/tigerbeetle/${connectionId}/balances/${accountId}`,
      undefined,
    ),

  tbCreateTransfers: (connectionId: number, transfers: import('@kamehadb/shared').CreateTigerBeetleTransferInput[]) =>
    request<{ results: import('@kamehadb/shared').TigerBeetleCreateResult[] }>(
      'POST',
      `/tigerbeetle/${connectionId}/transfers`,
      { transfers },
    ),
};
