import { useMutation } from '@tanstack/react-query';
import { post } from '@/lib/api';

export function useMongoCommand(connectionId: string | null) {
  return useMutation({
    mutationFn: async ({
      database,
      command,
    }: {
      database: string;
      command: Record<string, unknown>;
    }): Promise<unknown> => {
      if (!connectionId) throw new Error('No active connection');
      return post<unknown>(`/mongo/${connectionId}/command`, { database, command });
    },
  });
}
