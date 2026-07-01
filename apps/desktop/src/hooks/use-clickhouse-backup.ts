import { api } from '@/lib/api';
import { useMutation } from '@tanstack/react-query';

export function useClickHouseBackup(connectionId: string) {
  return useMutation({
    mutationFn: (input: { outputPath: string }) => api.backupClickHouseDatabase(connectionId, input),
  });
}

export function useClickHouseRestore(connectionId: string) {
  return useMutation({
    mutationFn: (input: { inputPath: string; targetDatabase: string }) =>
      api.restoreClickHouseDatabase(connectionId, input),
  });
}
