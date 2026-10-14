import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';

export function useRedisKeys(connectionId: string | null, pattern = '*', cursor?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEYS(connectionId!, pattern, cursor),
    queryFn: ({ signal }) => api.scanRedisKeys(connectionId!, { pattern, count: 100, cursor }, signal),
    enabled: !!connectionId,
    staleTime: 10000,
    retry: 1,
    retryDelay: 1000,
  });
}

export function useRedisKeyDetails(connectionId: string | null, key: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEY(connectionId!, key!),
    queryFn: ({ signal }) => api.getRedisKey(connectionId!, key!, signal),
    enabled: !!connectionId && !!key,
    staleTime: 10000,
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
