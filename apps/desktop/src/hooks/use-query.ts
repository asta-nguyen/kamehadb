import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { QueryResult } from '@kamehadb/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useRunQuery(connectionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ query, params }: { query: string; params?: unknown[] }): Promise<QueryResult> => {
      if (!connectionId) throw new Error('No active connection');
      return api.request<QueryResult>('POST', `/sql/${connectionId}/query`, { query, params });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TABLES(connectionId) });
    },
  });
}
