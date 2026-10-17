import { api } from '@/lib/api';
import { useGUIRequests } from './use-gui-requests';
import { QUERY_KEYS } from '@/lib/query-keys';
import type { RedisCommandResult } from '@kamehadb/shared';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

type RedisCommandMutation = UseMutationResult<RedisCommandResult, Error, { command: string }> & { cancel: () => void };

export function useRedisCommand(connectionId: string | null): RedisCommandMutation {
  const queryClient = useQueryClient();
  const requests = useGUIRequests(connectionId);
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({ command }: { command: string }): Promise<RedisCommandResult> => {
      if (!connectionId) throw new Error('No active connection');
      return requests.run((signal) => api.runRedisCommand(connectionId, command, signal));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redis-keys', connectionId!] });
      queryClient.invalidateQueries({ queryKey: ['redis-key', connectionId!] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.REDIS_STATS(connectionId) });
    },
  });
  return { ...mutation, cancel: requests.cancel };
}
