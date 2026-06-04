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

export async function request<T>(
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

  aiChat: (input: import('@kamehadb/shared').AIChatRequest & { signal?: AbortSignal }) =>
    request<import('@kamehadb/shared').AIChatResponse>('POST', '/ai/chat', input, false, input.signal),

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
};

// --- AI Chat Streaming ---

export type AiStreamChunk = { type: 'chunk'; delta: string };
export type AiStreamSqlExecuting = { type: 'sql_executing'; count: number };
export type AiStreamDone = { type: 'done'; inputTokens: number; outputTokens: number };
export type AiStreamEvent = AiStreamChunk | AiStreamSqlExecuting | AiStreamDone | { type: 'error'; message: string };

export async function* aiChatStream(input: {
  connectionId?: string;
  mongoDatabase?: string;
  messages: import('@kamehadb/shared').AIChatMessage[];
  latestMessage?: import('@kamehadb/shared').AIChatMessage;
  provider?: string;
  model?: string;
  signal?: AbortSignal;
}): AsyncGenerator<AiStreamEvent, void, void> {
  const res = await fetch(`${apiBase}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId: input.connectionId ?? undefined,
      mongoDatabase: input.mongoDatabase,
      messages: input.messages,
      latestMessage: input.latestMessage,
      provider: input.provider,
      model: input.model,
    }),
    signal: input.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Stream error: ${res.status}` }));
    yield { type: 'error', message: err.message || `Stream error: ${res.status}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'Response body is not readable' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
        } else if (trimmed.startsWith('data: ')) {
          // Sidecar wraps every event payload in JSON (e.g. `{"text":"..."}` for
          // chunks, `{"usage":{...}}` for done, `{"error":"..."}` for errors).
          // Parse it instead of forwarding the raw JSON string as the delta.
          const raw = trimmed.slice(6);
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }

          if (currentEvent === 'chunk' && parsed && typeof parsed === 'object' && 'text' in parsed) {
            const text = (parsed as { text: unknown }).text;
            if (typeof text === 'string' && text.length > 0) {
              yield { type: 'chunk', delta: text };
            }
          } else if (currentEvent === 'sql_executing' && parsed && typeof parsed === 'object' && 'count' in parsed) {
            const count = (parsed as { count: unknown }).count;
            if (typeof count === 'number') {
              yield { type: 'sql_executing', count };
            }
          } else if (currentEvent === 'done' && parsed && typeof parsed === 'object' && 'usage' in parsed) {
            const usage = (parsed as { usage: { inputTokens?: number; outputTokens?: number } }).usage;
            yield {
              type: 'done',
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
            };
          } else if (currentEvent === 'error') {
            const message =
              parsed &&
              typeof parsed === 'object' &&
              'error' in parsed &&
              typeof (parsed as { error: unknown }).error === 'string'
                ? (parsed as { error: string }).error
                : raw;
            yield { type: 'error', message };
          }
          currentEvent = '';
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    yield { type: 'error', message: err instanceof Error ? err.message : 'Stream error' };
  } finally {
    reader.releaseLock();
  }
}
