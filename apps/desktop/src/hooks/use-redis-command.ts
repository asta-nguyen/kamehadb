import { post } from '@/lib/api';
import type { RedisCommandResult } from '@kamehadb/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useRedisCommand(connectionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ command }: { command: string }): Promise<RedisCommandResult> => {
      if (!connectionId) throw new Error('No active connection');
      return post<RedisCommandResult>(`/redis/${connectionId}/command`, { command });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redis-keys', connectionId!] });
    },
  });
}
