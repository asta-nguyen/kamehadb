import { LRUCache } from 'lru-cache';
import { CACHE_MAX_ENTRIES } from './constants.js';
import { SCHEMA_CACHE_TIME, STATS_CACHE_TIME } from '@kamehadb/shared';

const AI_SCHEMA_CACHE_TIME = 5 * 60 * 1000;

export const CACHE_TTL = {
  SCHEMA: SCHEMA_CACHE_TIME,
  STATS: STATS_CACHE_TIME,
  AI_SCHEMA: AI_SCHEMA_CACHE_TIME,
};

const cache = new LRUCache<string, { data: unknown; timestamp: number }>({ max: CACHE_MAX_ENTRIES });

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
    // Clear all schema caches for this connection.
    // Use startsWith with a delimiter so conn-1 doesn't match conn-12.
    for (const key of cache.keys()) {
      if (key.startsWith(`ai-schema:${connectionId}:`) || key === `ai-schema:${connectionId}`) {
        cache.delete(key);
      }
    }
  }
}
