import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { OracleVectorSearchInput } from '@kamehadb/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useOracleVectorCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.ORACLE_VEC_CAPABILITIES(connectionId),
    queryFn: () => api.getOracleVectorCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: 30000,
    retry: 1,
  });
}

export function useOracleVectorSearch(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: OracleVectorSearchInput) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchOracleVector(connectionId, input);
    },
  });
}

export function useOracleVecSample(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: { table: string; column: string }) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.sampleOracleVec(connectionId, input);
    },
  });
}

export function useOracleVecVectorsSample(
  connectionId: string | null,
  input: { table: string; column: string; limit: number } | null,
) {
  return useQuery({
    queryKey: ['oracle-vec-vectors-sample', connectionId, input],
    queryFn: () => {
      if (!connectionId || !input) throw new Error('Missing vector sample input');
      return api.sampleOracleVecVectors(connectionId, input);
    },
    enabled: !!connectionId && !!input,
    staleTime: 30000,
    retry: 1,
  });
}
