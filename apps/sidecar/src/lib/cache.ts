import { LRUCache } from 'lru-cache';

const MAX_ENTRIES = 100;

export const CACHE_TTL = {
  SCHEMA: 5 * 60 * 1000, // 5 minutes for schema/tables
  STATS: 30 * 1000, // 30 seconds for stats
  AI_SCHEMA: 5 * 60 * 1000, // 5 minutes for AI schema context
};

const cache = new LRUCache<string, { data: unknown; timestamp: number }>({ max: MAX_ENTRIES });

export function getCached<T>(key: string, ttl = CACHE_TTL.SCHEMA): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }
  return null;
}

export function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearConnectionCache(connectionId: string) {
  for (const key of cache.keys()) {
    if (key.includes(`:${connectionId}:`) || key.endsWith(`:${connectionId}`)) {
      cache.delete(key);
    }
  }
}

export function clearSchemaCache(connectionId: string, mongoDatabase?: string) {
  if (mongoDatabase) {
    cache.delete(`ai-schema:${connectionId}:mongo:${mongoDatabase}`);
  } else {
    // Clear all schema caches for this connection
    for (const key of cache.keys()) {
      if (key.includes(`ai-schema:${connectionId}`)) {
        cache.delete(key);
      }
    }
  }
}
