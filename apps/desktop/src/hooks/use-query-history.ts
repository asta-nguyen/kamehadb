import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { SaveQueryHistoryInput, UpdateQueryHistoryInput } from '@kamehadb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useQueryHistory(connectionId: string | null, limit = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.QUERY_HISTORY(connectionId), { limit }],
    queryFn: () => api.getQueryHistory(connectionId!, limit, false),
    enabled: !!connectionId,
  });
}

export function useFavoriteQueries(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.QUERY_HISTORY_FAVORITES(connectionId),
    queryFn: () => api.getQueryHistory(connectionId!, 50, true),
    enabled: !!connectionId,
  });
}

export function useSaveQueryHistory(connectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveQueryHistoryInput) => api.saveQueryHistory(connectionId!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY(connectionId) });
    },
  });
}

export function useUpdateQueryHistory(connectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQueryHistoryInput }) => api.updateQueryHistory(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY(connectionId) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY_FAVORITES(connectionId) });
    },
  });
}

export function useDeleteQueryHistory(connectionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteQueryHistory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY(connectionId) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY_FAVORITES(connectionId) });
    },
  });
}
