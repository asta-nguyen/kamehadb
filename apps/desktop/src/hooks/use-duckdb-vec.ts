import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useDuckDbVectorCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.DUCKDB_VEC_CAPABILITIES(connectionId),
    queryFn: () => api.getDuckDbVectorCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: 30000,
    retry: 1,
  });
}

export function useDuckDbVectorSearch(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: {
      schema?: string;
      table: string;
      column: string;
      vector: number[];
      metric?: 'cosine' | 'l2' | 'inner_product';
      limit?: number;
    }) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchDuckDbVector(connectionId, input);
    },
  });
}
