import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { STATS_CACHE_TIME } from '@/lib/constants';
import type { SqliteVecSearchInput } from '@kamehadb/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useSqliteVecCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SQLITE_VEC_CAPABILITIES(connectionId),
    queryFn: () => api.getSqliteVecCapabilities(connectionId!),
    enabled: !!connectionId,
    staleTime: STATS_CACHE_TIME,
    retry: 1,
  });
}

export function useSqliteVecSearch(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: SqliteVecSearchInput) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.searchSqliteVec(connectionId, input);
    },
  });
}

export function useSqliteVecSample(connectionId: string | null) {
  return useMutation({
    mutationFn: (input: { table: string; column: string }) => {
      if (!connectionId) return Promise.reject(new Error('No connectionId'));
      return api.sampleSqliteVec(connectionId, input);
    },
  });
}

export function useSqliteVecVectorsSample(
  connectionId: string | null,
  input: { table: string; column: string; limit: number } | null,
) {
  return useQuery({
    queryKey: ['sqlite-vec-vectors-sample', connectionId, input],
    queryFn: () => {
      if (!connectionId || !input) throw new Error('Missing input');
      return api.sampleSqliteVecVectors(connectionId, input);
    },
    enabled: !!connectionId && !!input,
    staleTime: STATS_CACHE_TIME,
    retry: 1,
  });
}
