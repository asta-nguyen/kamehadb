import { api } from '@/lib/api';
import { SCHEMA_CACHE_TIME } from '@/lib/constants';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { AISettings } from '@kamehadb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useAISettings() {
  return useQuery({
    queryKey: QUERY_KEYS.AI_SETTINGS,
    queryFn: () => api.getAISettings(),
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useSaveAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AISettings) => api.saveAISettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AI_SETTINGS });
    },
  });
}
