import { CACHE_MAX_ENTRIES } from './constants.js';
import { SCHEMA_CACHE_TIME, STATS_CACHE_TIME } from '@kamehadb/shared';

const AI_SCHEMA_CACHE_TIME = 5 * 60 * 1000;

export const CACHE_TTL = {
  SCHEMA: SCHEMA_CACHE_TIME,
  STATS: STATS_CACHE_TIME,
  AI_SCHEMA: AI_SCHEMA_CACHE_TIME,
};

const cache = new Map<string, { data: unknown; timestamp: number }>();

export function getCached<T>(key: string, ttl = CACHE_TTL.SCHEMA): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }
  return null;
}

export function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
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
