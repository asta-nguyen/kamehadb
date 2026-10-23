import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';

export function useRedisKeys(connectionId: string | null, pattern = '*', cursor?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEYS(connectionId!, pattern, cursor),
    queryFn: ({ signal }) => api.scanRedisKeys(connectionId!, { pattern, count: 100, cursor }, signal),
    enabled: !!connectionId,
    staleTime: 10000,
    retry: 1,
    retryDelay: 1000,
  });
}

// Paged value inspector: cursor advances by admitted items so byte-shortened
// pages never skip members. The cursor is opaque — never parse it as a number.
export function useRedisKeyPage(connectionId: string | null, key: string | null, cursor?: string, limit?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEY_PAGE(connectionId!, key!, cursor, limit),
    queryFn: ({ signal }) => api.getRedisKeyPage(connectionId!, { key: key!, cursor, limit }, signal),
    enabled: !!connectionId && !!key,
    staleTime: 10000,
    retry: 1,
  });
}

export function useRedisStats(connectionId: string | null, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_STATS(connectionId),
    queryFn: () => api.getRedisStats(connectionId!),
    enabled: !!connectionId && enabled,
    staleTime: 10000,
    retry: 1,
  });
}
