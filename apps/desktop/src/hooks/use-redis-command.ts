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
    // browseOwned marks this mutation safe for immediate settled GC in the
    // shared browse cache; the console re-reads results from mutateAsync.
    meta: { browseOwned: true },
    mutationFn: async ({ command }: { command: string }): Promise<RedisCommandResult> => {
      if (!connectionId) throw new Error('No active connection');
      return requests.run((signal) => api.runRedisCommand(connectionId, command, signal));
    },
    // Invalidate on settle, not only success: an ambiguous error may already
    // have mutated data, so browse caches must refresh either way.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['redis-keys', connectionId!] });
      queryClient.invalidateQueries({ queryKey: ['redis-key', connectionId!] });
      queryClient.invalidateQueries({ queryKey: ['redis-key-page', connectionId!] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.REDIS_STATS(connectionId) });
    },
  });
  return { ...mutation, cancel: requests.cancel };
}
