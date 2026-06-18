import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { PostgresVectorSampleInput, PostgresVectorSearchInput } from '@kamehadb/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

export function usePostgresVectorCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.POSTGRES_VECTOR_CAPABILITIES(connectionId),
    queryFn: () => api.getPostgresVectorCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: 30000,
    retry: 1,
  });
}

export function usePostgresVectorSearch(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: PostgresVectorSearchInput) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchPostgresVector(connectionId, input);
    },
  });
}

export function usePostgresVectorSample(connectionId: string | null, input: PostgresVectorSampleInput | null) {
  return useQuery({
    queryKey: QUERY_KEYS.POSTGRES_VECTOR_SAMPLE(connectionId, input),
    queryFn: () => {
      if (!connectionId || !input) throw new Error('Missing pgvector sample input');
      return api.getPostgresVectorSample(connectionId, input);
    },
    enabled: !!connectionId && !!input,
    staleTime: 30000,
    retry: 1,
  });
}
