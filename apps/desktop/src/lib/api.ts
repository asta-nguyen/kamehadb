const DEV_PROXY_API_BASE = 'http://127.0.0.1:3170';
const DIRECT_SIDECAR_API_BASE = 'http://127.0.0.1:3170';
const SIDECAR_API_BASE = 'http://127.0.0.1:3170';

let apiBase = import.meta.env.DEV ? DEV_PROXY_API_BASE : DIRECT_SIDECAR_API_BASE;
let sidecarBase = SIDECAR_API_BASE;

export function getApiBase(): string {
  return apiBase;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  useSidecar = false,
  signal?: AbortSignal,
): Promise<T> {
  const base = useSidecar ? sidecarBase : apiBase;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `API error: ${res.status}`);
  }
  return data as T;
}

export async function get<T>(path: string, useSidecar = true): Promise<T> {
  return request<T>('GET', path, undefined, useSidecar);
}

export async function post<T>(path: string, body: unknown, useSidecar = true): Promise<T> {
  return request<T>('POST', path, body, useSidecar);
}

export const api = {
  request: request as <T>(method: string, path: string, body?: unknown) => Promise<T>,
  health: () => request<{ status: string; uptime: number; version: string }>('GET', '/health'),

  listConnections: () => request<import('@kamehadb/shared').ConnectionProfile[]>('GET', '/connections'),

  getConnection: (id: string) => request<import('@kamehadb/shared').ConnectionProfile>('GET', `/connections/${id}`),

  createConnection: (input: import('@kamehadb/shared').CreateConnectionProfileInput) =>
    request<import('@kamehadb/shared').ConnectionProfile>('POST', '/connections', input),

  updateConnection: (id: string, input: import('@kamehadb/shared').UpdateConnectionProfileInput) =>
    request<import('@kamehadb/shared').ConnectionProfile>('PATCH', `/connections/${id}`, input),

  deleteConnection: (id: string) => request<void>('DELETE', `/connections/${id}`),

  testConnection: (input: import('@kamehadb/shared').CreateConnectionProfileInput) =>
    request<import('@kamehadb/shared').TestConnectionResult>('POST', '/connections/test', input),

  checkConnectionHealth: (id: string) =>
    request<import('@kamehadb/shared').TestConnectionResult>('GET', `/connections/${id}/health`),

  getAISettings: () => request<import('@kamehadb/shared').AISettings>('GET', '/ai/settings'),

  saveAISettings: (input: import('@kamehadb/shared').AISettings) =>
    request<{ success: boolean }>('POST', '/ai/settings', input),

  getChatHistory: (connectionId: string, limit = 50, mongoDatabase?: string) => {
    const dbParam = mongoDatabase ? `&database=${encodeURIComponent(mongoDatabase)}` : '';
    return request<{
      messages: {
        id: string;
        connectionId: string;
        mongoDatabase?: string;
        role: 'user' | 'assistant';
        content: string;
        createdAt: string;
      }[];
    }>(`GET`, `/ai/chat-history/${connectionId}?limit=${limit}${dbParam}`);
  },

  clearChatHistory: (connectionId: string, mongoDatabase?: string) => {
    const dbParam = mongoDatabase ? `?database=${encodeURIComponent(mongoDatabase)}` : '';
    return request<{ success: boolean }>('DELETE', `/ai/chat-history/${connectionId}${dbParam}`);
  },

  clearSchemaCache: (connectionId: string) =>
    request<{ success: boolean }>('POST', `/ai/clear-schema-cache/${connectionId}`),

  searchSchema: (connectionId: string, query: string, schema?: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (schema) params.set('schema', schema);
    if (limit) params.set('limit', String(limit));
    return request<import('@kamehadb/shared').SchemaSearchMatch[]>(
      'GET',
      `/sql/${connectionId}/search-schema?${params}`,
    );
  },

  // PostgreSQL stats
  getTableStats: (connectionId: string, tableId: string) =>
    request<import('@kamehadb/shared').TableStats>(
      'GET',
      `/sql/${connectionId}/tables/${encodeURIComponent(tableId)}/stats`,
    ),

  getIndexStats: (connectionId: string, tableId: string) =>
    request<import('@kamehadb/shared').IndexStats[]>(
      'GET',
      `/sql/${connectionId}/tables/${encodeURIComponent(tableId)}/index-stats`,
    ),

  getDatabaseSizes: (connectionId: string, schema?: string) => {
    const query = schema ? `?schema=${encodeURIComponent(schema)}` : '';
    return request<import('@kamehadb/shared').DatabaseSize[]>('GET', `/sql/${connectionId}/sizes${query}`);
  },

  getActiveConnections: (connectionId: string) =>
    request<import('@kamehadb/shared').ConnectionInfo[]>('GET', `/sql/${connectionId}/connections`),

  // MongoDB API
  listMongoDatabases: (connectionId: string) =>
    request<import('@kamehadb/shared').DatabaseInfo[]>('GET', `/mongo/${connectionId}/databases`, undefined, true),

  listMongoCollections: (connectionId: string, database?: string) => {
    const query = database ? `?database=${encodeURIComponent(database)}` : '';
    return request<import('@kamehadb/shared').CollectionInfo[]>(
      'GET',
      `/mongo/${connectionId}/collections${query}`,
      undefined,
      true,
    );
  },

  findMongoDocuments: (connectionId: string, input: import('@kamehadb/shared').FindDocumentsInput) =>
    request<import('@kamehadb/shared').DocumentResult>('POST', `/mongo/${connectionId}/find`, input, true),

  deleteMongoDocument: (
    connectionId: string,
    input: { collection: string; database?: string; filter: Record<string, unknown> },
  ) => request<{ deletedCount: number }>('POST', `/mongo/${connectionId}/delete`, input, true),

  updateMongoDocument: (
    connectionId: string,
    input: { collection: string; database?: string; filter: Record<string, unknown>; update: Record<string, unknown> },
  ) => request<{ matchedCount: number; modifiedCount: number }>('POST', `/mongo/${connectionId}/update`, input, true),

  getMongoCollectionStats: (connectionId: string, database: string, collection: string) =>
    request<{ documentCount: number; indexes: { name: string; key: Record<string, unknown>; unique: boolean }[] }>(
      'GET',
      `/mongo/${connectionId}/stats?database=${encodeURIComponent(database)}&collection=${encodeURIComponent(collection)}`,
      undefined,
      true,
    ),

  // Redis API
  getRedisStats: (connectionId: string) =>
    request<import('@kamehadb/shared').RedisStats>('GET', `/redis/${connectionId}/stats`, undefined, true),

  runRedisCommand: (connectionId: string, command: string) =>
    request<import('@kamehadb/shared').RedisCommandResult>('POST', `/redis/${connectionId}/command`, { command }, true),

  // MongoDB command
  runMongoCommand: (connectionId: string, database: string, command: Record<string, unknown>) =>
    request<unknown>('POST', `/mongo/${connectionId}/command`, { database, command }, true),

  // Qdrant API
  listQdrantCollections: (connectionId: string) =>
    request<import('@kamehadb/shared').QdrantCollection[]>(
      'GET',
      `/qdrant/${connectionId}/collections`,
      undefined,
      true,
    ),

  scrollQdrantPoints: (connectionId: string, input: import('@kamehadb/shared').ScrollPointsInput) =>
    request<import('@kamehadb/shared').QdrantPointPage>('POST', `/qdrant/${connectionId}/points`, input, true),

  searchQdrant: (connectionId: string, input: import('@kamehadb/shared').QdrantSearchInput) =>
    request<import('@kamehadb/shared').QdrantSearchResult>('POST', `/qdrant/${connectionId}/search`, input, true),

  recommendQdrant: (connectionId: string, input: import('@kamehadb/shared').RecommendInput) =>
    request<import('@kamehadb/shared').QdrantSearchResult>('POST', `/qdrant/${connectionId}/recommend`, input, true),

  getQdrantStats: (connectionId: string, collection: string) =>
    request<import('@kamehadb/shared').QdrantStats>(
      'GET',
      `/qdrant/${connectionId}/stats?collection=${encodeURIComponent(collection)}`,
      undefined,
      true,
    ),

  embedText: (text: string, model?: string) =>
    request<{ vector: number[]; dimensions: number }>('POST', `/ai/embed`, { text, model }),

  // TigerBeetle API
  tbListAccounts: (connectionId: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return request<{ accounts: import('@kamehadb/shared').TigerBeetleAccount[] }>(
      'GET',
      `/tigerbeetle/${connectionId}/accounts${query}`,
      undefined,
      true,
    );
  },

  tbLookupAccount: (connectionId: string, id: string) =>
    request<import('@kamehadb/shared').TigerBeetleAccount>(
      'GET',
      `/tigerbeetle/${connectionId}/accounts/${id}`,
      undefined,
      true,
    ),

  tbCreateAccounts: (connectionId: string, accounts: import('@kamehadb/shared').CreateTigerBeetleAccountInput[]) =>
    request<{ results: import('@kamehadb/shared').TigerBeetleCreateResult[] }>(
      'POST',
      `/tigerbeetle/${connectionId}/accounts`,
      { accounts },
      true,
    ),

  tbGetTransfers: (connectionId: string, accountId: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return request<{ transfers: import('@kamehadb/shared').TigerBeetleTransfer[] }>(
      'GET',
      `/tigerbeetle/${connectionId}/transfers/${accountId}${query}`,
      undefined,
      true,
    );
  },

  tbGetBalances: (connectionId: string, accountId: string) =>
    request<{ balances: import('@kamehadb/shared').TigerBeetleAccountBalance[] }>(
      'GET',
      `/tigerbeetle/${connectionId}/balances/${accountId}`,
      undefined,
      true,
    ),

  tbCreateTransfers: (connectionId: string, transfers: import('@kamehadb/shared').CreateTigerBeetleTransferInput[]) =>
    request<{ results: import('@kamehadb/shared').TigerBeetleCreateResult[] }>(
      'POST',
      `/tigerbeetle/${connectionId}/transfers`,
      { transfers },
      true,
    ),
};
