import type { FileDatabaseBackupRequest, FileDatabaseRestoreRequest } from '@kamehadb/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backupFileDatabase, restoreFileDatabase } from '@/lib/file-database-maintenance';
import { QUERY_KEYS } from '@/lib/query-keys';
import { appendFrontendLog } from '@/lib/app-logs';

export function queryKeyIncludesConnectionId(queryKey: readonly unknown[], connectionId: string): boolean {
  return queryKey.some((part) => typeof part === 'string' && part === connectionId);
}

// Restore rewrites the database file outside React Query's awareness, so the
// cache must be invalidated by connection id rather than by a single query key.
export function invalidateConnectionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  connectionId: string,
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS }),
    queryClient.invalidateQueries({
      predicate: (query) => queryKeyIncludesConnectionId(query.queryKey, connectionId),
    }),
  ]).then(() => undefined);
}

export function useFileDatabaseBackup(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: FileDatabaseBackupRequest) => backupFileDatabase(connectionId, request),
    onSuccess: async () => {
      await invalidateConnectionQueries(queryClient, connectionId);
      toast.success('Backup completed');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Backup failed';
      toast.error(message);
      void appendFrontendLog({
        level: 'error',
        scope: 'file-database-backup',
        message: `Backup failed: ${message}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    },
  });
}

export function useFileDatabaseRestore(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: FileDatabaseRestoreRequest) => restoreFileDatabase(connectionId, request),
    onSuccess: async () => {
      await invalidateConnectionQueries(queryClient, connectionId);
      toast.success('Restore completed');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Restore failed';
      toast.error(message);
      void appendFrontendLog({
        level: 'error',
        scope: 'file-database-restore',
        message: `Restore failed: ${message}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    },
  });
}
