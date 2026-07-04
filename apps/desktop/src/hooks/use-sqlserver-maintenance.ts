import { appendFrontendLog } from '@/lib/app-logs';
import { invalidateConnectionQueries } from '@/lib/query-invalidation';
import { backupSqlServerDatabase, restoreSqlServerDatabase } from '@/lib/sqlserver-maintenance';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useSqlServerBackup(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: { readonly outputPath: string }) => backupSqlServerDatabase(connectionId, request),
    onSuccess: async () => {
      await invalidateConnectionQueries(queryClient, connectionId);
      toast.success('Backup completed');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Backup failed';
      toast.error(message);
      void appendFrontendLog({
        level: 'error',
        scope: 'sqlserver-backup',
        message: `Backup failed: ${message}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    },
  });
}

export function useSqlServerRestore(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: { readonly inputPath: string; readonly targetDatabase: string }) =>
      restoreSqlServerDatabase(connectionId, request),
    onSuccess: async () => {
      await invalidateConnectionQueries(queryClient, connectionId);
      toast.success('Restore completed');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Restore failed';
      toast.error(message);
      void appendFrontendLog({
        level: 'error',
        scope: 'sqlserver-restore',
        message: `Restore failed: ${message}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    },
  });
}
