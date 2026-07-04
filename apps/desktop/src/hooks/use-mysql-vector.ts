import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { MysqlVectorSearchInput } from '@kamehadb/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useMysqlVectorCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.MYSQL_VEC_CAPABILITIES(connectionId),
    queryFn: () => api.getMysqlVectorCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: 30000,
    retry: 1,
  });
}

export function useMysqlVectorSearch(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: MysqlVectorSearchInput) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchMysqlVector(connectionId, input);
    },
  });
}

export function useMysqlVectorSample(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: { table: string; column: string }) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.sampleMysqlVector(connectionId, input);
    },
  });
}

export function useMysqlVecVectorsSample(
  connectionId: string | null,
  input: { table: string; column: string; limit: number } | null,
) {
  return useQuery({
    queryKey: ['mysql-vec-vectors-sample', connectionId, input],
    queryFn: () => {
      if (!connectionId || !input) throw new Error('Missing vector sample input');
      return api.sampleMysqlVecVectors(connectionId, input);
    },
    enabled: !!connectionId && !!input,
    staleTime: 30000,
    retry: 1,
  });
}
