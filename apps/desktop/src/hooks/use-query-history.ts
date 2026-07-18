import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { QueryHistoryEntry, SaveQueryHistoryInput, UpdateQueryHistoryInput } from '@kamehadb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useQueryHistory(connectionId: number | null, limit = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.QUERY_HISTORY(connectionId), { limit }],
    queryFn: () => api.request<QueryHistoryEntry[]>('GET', `/query-history/${connectionId}?limit=${limit}`),
    enabled: !!connectionId,
  });
}

export function useFavoriteQueries(connectionId: number | null) {
  return useQuery({
    queryKey: QUERY_KEYS.QUERY_HISTORY_FAVORITES(connectionId),
    queryFn: () => api.request<QueryHistoryEntry[]>('GET', `/query-history/${connectionId}?favorites=true`),
    enabled: !!connectionId,
  });
}

export function useSaveQueryHistory(connectionId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveQueryHistoryInput) =>
      api.request<QueryHistoryEntry>('POST', `/query-history/${connectionId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY(connectionId) });
    },
  });
}

export function useUpdateQueryHistory(connectionId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateQueryHistoryInput }) =>
      api.request<void>('PATCH', `/query-history/${connectionId}/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY(connectionId) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY_FAVORITES(connectionId) });
    },
  });
}

export function useDeleteQueryHistory(connectionId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.request<void>('DELETE', `/query-history/${connectionId}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY(connectionId) });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.QUERY_HISTORY_FAVORITES(connectionId) });
    },
  });
}
