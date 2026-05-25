import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AIChatMessage, AIChatResponse, AISettings, AIProvider } from "@kamehadb/shared";

export function useAISettings() {
  return useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.getAISettings(),
  });
}

export function useSaveAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AISettings) => api.saveAISettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
    },
  });
}

export function useAiChat(connectionId?: string | null) {
  return useMutation({
    mutationFn: async ({
      messages,
      provider,
      model,
    }: {
      messages: AIChatMessage[];
      provider?: string;
      model?: string;
    }): Promise<AIChatResponse> => {
      return api.aiChat({
        connectionId: connectionId ?? undefined,
        messages,
        provider: provider as AIProvider | undefined,
        model,
      });
    },
  });
}
