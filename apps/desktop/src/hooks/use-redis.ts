import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { FAST_CACHE_TIME } from '@/lib/constants';
import { useQuery } from '@tanstack/react-query';

export function useRedisKeys(connectionId: string | null, pattern = '*', cursor?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEYS(connectionId!, pattern, cursor),
    queryFn: () =>
      api.request<{ keys: Array<{ key: string; type: string; ttl: number }>; cursor: number; done: boolean }>(
        'POST',
        `/redis/${connectionId}/keys`,
        { pattern, count: 100, cursor },
      ),
    enabled: !!connectionId,
    staleTime: FAST_CACHE_TIME,
    retry: 1,
    retryDelay: 1000,
  });
}

export function useRedisKeyDetails(connectionId: string | null, key: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEY(connectionId!, key!),
    queryFn: () =>
      api.request<{ key: string; type: string; ttl: number; value: unknown }>(
        'POST',
        `/redis/${connectionId}/keys/value`,
        {
          key,
        },
      ),
    enabled: !!connectionId && !!key,
    staleTime: FAST_CACHE_TIME,
  });
}

export function useRedisStats(connectionId: string | null, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_STATS(connectionId),
    queryFn: () => api.getRedisStats(connectionId!),
    enabled: !!connectionId && enabled,
    staleTime: FAST_CACHE_TIME,
    retry: 1,
  });
}
