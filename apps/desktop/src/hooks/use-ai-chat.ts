import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AISettings } from '@kamehadb/shared';

export function useAISettings() {
  return useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api.getAISettings(),
  });
}

export function useSaveAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AISettings) => api.saveAISettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    },
  });
}

export function useChatHistory(connectionId: string | null, limit = 50, mongoDatabase?: string) {
  return useQuery({
    queryKey: ['chat-history', connectionId, mongoDatabase],
    queryFn: () => api.getChatHistory(connectionId!, limit, mongoDatabase),
    enabled: !!connectionId,
    staleTime: 0, // Always fresh for chat
  });
}

export function useClearChatHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, mongoDatabase }: { connectionId: string; mongoDatabase?: string }) =>
      api.clearChatHistory(connectionId, mongoDatabase),
    onSuccess: (_, { connectionId, mongoDatabase }) => {
      queryClient.setQueryData(['chat-history', connectionId, mongoDatabase], { messages: [] });
    },
  });
}

export function useClearSchemaCache() {
  return useMutation({
    mutationFn: ({ connectionId }: { connectionId: string }) => api.clearSchemaCache(connectionId),
  });
}
