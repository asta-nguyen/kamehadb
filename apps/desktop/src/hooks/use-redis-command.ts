import { useMutation } from '@tanstack/react-query';
import { post } from '@/lib/api';
import type { RedisCommandResult } from '@kamehadb/shared';

export function useRedisCommand(connectionId: string | null) {
  return useMutation({
    mutationFn: async ({ command }: { command: string }): Promise<RedisCommandResult> => {
      if (!connectionId) throw new Error('No active connection');
      return post<RedisCommandResult>(`/redis/${connectionId}/command`, { command });
    },
  });
}
