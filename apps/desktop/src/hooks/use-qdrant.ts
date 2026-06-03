import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { QdrantSearchInput, RecommendInput } from '@kamehadb/shared';

export function useQdrantCollections(connectionId: string | null) {
  return useQuery({
    queryKey: ['qdrant-collections', connectionId],
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
    queryKey: ['qdrant-points', connectionId, collection, offset ?? null, filter ?? null, limit],
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
  return useMutation({
    mutationFn: (input: QdrantSearchInput) => api.searchQdrant(connectionId!, input),
  });
}

export function useQdrantRecommend(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: RecommendInput) => api.recommendQdrant(connectionId!, input),
  });
}

export function useQdrantStats(connectionId: string | null, collection: string | null) {
  return useQuery({
    queryKey: ['qdrant-stats', connectionId, collection],
    queryFn: () => api.getQdrantStats(connectionId!, collection!),
    enabled: !!connectionId && !!collection,
    staleTime: 10000,
  });
}
