import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useClickHouseVectorCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.CLICKHOUSE_VEC_CAPABILITIES(connectionId),
    queryFn: () => api.getClickHouseVectorCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: 30000,
    retry: 1,
  });
}

export function useClickHouseVectorSearch(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: {
      table: string;
      column: string;
      vector: number[];
      metric?: 'cosine' | 'l2' | 'inner_product';
      limit?: number;
    }) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchClickHouseVector(connectionId, input);
    },
  });
}

export function useClickhouseVecSample(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: { table: string; column: string }) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.sampleClickhouseVec(connectionId, input);
    },
  });
}

export function useClickhouseVecVectorsSample(
  connectionId: string | null,
  input: { table: string; column: string; limit: number } | null,
) {
  return useQuery({
    queryKey: ['clickhouse-vec-vectors-sample', connectionId, input],
    queryFn: () => {
      if (!connectionId || !input) throw new Error('Missing vector sample input');
      return api.sampleClickhouseVecVectors(connectionId, input);
    },
    enabled: !!connectionId && !!input,
    staleTime: 30000,
    retry: 1,
  });
}
