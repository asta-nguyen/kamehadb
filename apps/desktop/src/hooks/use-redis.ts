import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useRedisKeys(connectionId: string | null, pattern = '*', cursor?: number) {
  return useQuery({
    queryKey: ['redis-keys', connectionId, pattern, cursor],
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

export function useRedisKeyDetails(connectionId: string | null, key: string | null) {
  return useQuery({
    queryKey: ['redis-key', connectionId, key],
    queryFn: () =>
      api.request<{ key: string; type: string; ttl: number; value: unknown }>('POST', `/redis/${connectionId}/key`, {
        key,
      }),
    enabled: !!connectionId && !!key,
    staleTime: 10000,
  });
}

export function useRedisTtl(connectionId: string | null, key: string | null) {
  return useMutation({
    mutationFn: () => api.request<{ ttl: number }>('POST', `/redis/${connectionId}/ttl`, { key }),
  });
}

export function useRedisStats(connectionId: string | null) {
  return useQuery({
    queryKey: ['redis-stats', connectionId],
    queryFn: () => api.getRedisStats(connectionId!),
    enabled: !!connectionId,
    staleTime: 10000,
    retry: 1,
  });
}
