import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';

export function useRedisKeys(connectionId: number | null, pattern = '*', cursor?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEYS(connectionId!, pattern, cursor),
    queryFn: () =>
      api.request<{ keys: Array<{ key: string; type: string; ttl: number }>; cursor: number; done: boolean }>(
        'POST',
        `/redis/${connectionId}/keys`,
        { pattern, count: 100, cursor },
      ),
    enabled: !!connectionId,
    staleTime: 10000,
    retry: 1,
    retryDelay: 1000,
  });
}

export function useRedisKeyDetails(connectionId: number | null, key: string | null) {
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
    staleTime: 10000,
  });
}

export function useRedisStats(connectionId: number | null, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_STATS(connectionId),
    queryFn: () => api.getRedisStats(connectionId!),
    enabled: !!connectionId && enabled,
    staleTime: 10000,
    retry: 1,
  });
}
