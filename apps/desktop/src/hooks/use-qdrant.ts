import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { QdrantSearchInput, RecommendInput } from '@kamehadb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useQdrantCollections(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.QDRANT_COLLECTIONS(connectionId),
    queryFn: () => api.listQdrantCollections(connectionId!),
    enabled: !!connectionId,
    staleTime: 10000,
    retry: 1,
  });
}

export function useQdrantPoints(
  connectionId: string | null,
  collection: string | null,
  offset?: string | number | null,
  filter?: Record<string, unknown>,
  limit = 50,
) {
  return useQuery({
    queryKey: QUERY_KEYS.QDRANT_POINTS(connectionId!, collection!, offset, filter, limit),
    queryFn: () =>
      api.scrollQdrantPoints(connectionId!, {
        collection: collection!,
        limit,
        offset: offset ?? null,
        filter,
        withPayload: true,
      }),
    enabled: !!connectionId && !!collection,
    staleTime: 10000,
  });
}

export function useQdrantSearch(connectionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QdrantSearchInput) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchQdrant(connectionId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qdrant-points', connectionId] });
    },
  });
}

export function useQdrantRecommend(connectionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecommendInput) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.recommendQdrant(connectionId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qdrant-points', connectionId] });
    },
  });
}

export function useQdrantStats(connectionId: string | null, collection: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.QDRANT_STATS(connectionId!, collection!),
    queryFn: () => api.getQdrantStats(connectionId!, collection!),
    enabled: !!connectionId && !!collection,
    staleTime: 10000,
  });
}
