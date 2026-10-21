import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { REDIS_SCAN_BATCH_SIZE } from '@/lib/constants';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { KeyPage } from '@kamehadb/shared';

export function useRedisKeys(connectionId: string | null, pattern = '*', cursor?: number) {
  return useQuery({
    queryKey: QUERY_KEYS.REDIS_KEYS(connectionId!, pattern, cursor),
    queryFn: ({ signal }) =>
      api.scanRedisKeys(connectionId!, { pattern, count: REDIS_SCAN_BATCH_SIZE, cursor }, signal),
    enabled: !!connectionId,
    staleTime: 10000,
    retry: 1,
    retryDelay: 1000,
  });
}

// Scans keys iteratively using Redis SCAN cursors in pages of REDIS_SCAN_BATCH_SIZE,
// allowing the explorer UI to load subsequent key pages beyond the initial batch cap. (How / Why / What)
export function useRedisInfiniteKeys(connectionId: string | null, pattern = '*') {
  return useInfiniteQuery<KeyPage>({
    queryKey: QUERY_KEYS.REDIS_KEYS_INFINITE(connectionId, pattern),
    queryFn: ({ pageParam = 0, signal }) =>
      api.scanRedisKeys(connectionId!, { pattern, count: REDIS_SCAN_BATCH_SIZE, cursor: Number(pageParam) }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.done ? undefined : lastPage.cursor),
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
