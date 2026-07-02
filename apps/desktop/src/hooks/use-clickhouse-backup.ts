import { api } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invalidateConnectionQueries } from '@/hooks/use-file-database-maintenance';

export function useClickHouseBackup(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { outputPath: string }) => api.backupClickHouseDatabase(connectionId, input),
    onSuccess: async () => {
      await invalidateConnectionQueries(queryClient, connectionId);
      toast.success('Backup completed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Backup failed');
    },
  });
}

export function useClickHouseRestore(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { inputPath: string; targetDatabase: string }) =>
      api.restoreClickHouseDatabase(connectionId, input),
    onSuccess: async () => {
      await invalidateConnectionQueries(queryClient, connectionId);
      toast.success('Restore completed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Restore failed');
    },
  });
}
