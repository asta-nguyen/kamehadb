import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AIChatMessage, AIChatResponse, AISettings, AIProvider } from '@kamehadb/shared';

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

export function useAiChat(connectionId?: string | null) {
  return useMutation({
    mutationFn: async ({
      messages,
      latestMessage,
      provider,
      model,
      signal,
    }: {
      messages: AIChatMessage[];
      latestMessage?: AIChatMessage;
      provider?: string;
      model?: string;
      signal?: AbortSignal;
    }): Promise<AIChatResponse> => {
      return api.aiChat({
        connectionId: connectionId ?? undefined,
        messages,
        latestMessage,
        provider: provider as AIProvider | undefined,
        model,
        signal,
      });
    },
  });
}

export function useChatHistory(connectionId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['chat-history', connectionId],
    queryFn: () => api.getChatHistory(connectionId!, limit),
    enabled: !!connectionId,
    staleTime: 0, // Always fresh for chat
  });
}

export function useClearChatHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => api.clearChatHistory(connectionId),
    onSuccess: (_, connectionId) => {
      queryClient.setQueryData(['chat-history', connectionId], { messages: [] });
    },
  });
}

export function useClearSchemaCache() {
  return useMutation({
    mutationFn: (connectionId: string) => api.clearSchemaCache(connectionId),
  });
}
