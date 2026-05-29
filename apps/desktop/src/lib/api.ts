const DEV_PROXY_API_BASE = 'http://127.0.0.1:3170';
const DIRECT_SIDECAR_API_BASE = 'http://127.0.0.1:3170';
const SIDECAR_API_BASE = 'http://127.0.0.1:3170';

let apiBase = import.meta.env.DEV ? DEV_PROXY_API_BASE : DIRECT_SIDECAR_API_BASE;
let sidecarBase = SIDECAR_API_BASE;

export function setApiPort(port: number) {
  apiBase = `http://127.0.0.1:${port}`;
  sidecarBase = `http://127.0.0.1:${port}`;
}

export function getApiBase(): string {
  return apiBase;
}

export async function request<T>(method: string, path: string, body?: unknown, useSidecar = false): Promise<T> {
  const base = useSidecar ? sidecarBase : apiBase;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `API error: ${res.status}`);
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

  aiChat: (input: import('@kamehadb/shared').AIChatRequest) =>
    request<import('@kamehadb/shared').AIChatResponse>('POST', '/ai/chat', input),

  getChatHistory: (connectionId: string, limit = 50) =>
    request<{
      messages: { id: string; connectionId: string; role: 'user' | 'assistant'; content: string; createdAt: string }[];
    }>('GET', `/ai/chat-history/${connectionId}?limit=${limit}`),

  clearChatHistory: (connectionId: string) =>
    request<{ success: boolean }>('DELETE', `/ai/chat-history/${connectionId}`),

  clearSchemaCache: (connectionId: string) =>
    request<{ success: boolean }>('POST', `/ai/clear-schema-cache/${connectionId}`),

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
};
