import { useCallback } from 'react';
import {
  cancelPostgresToolJob,
  POSTGRES_TOOL_EVENT,
  type PostgresBackupRequest,
  type PostgresRestoreRequest,
  type PostgresToolEvent,
  type PostgresToolKind,
  startPostgresBackup,
  startPostgresRestore,
} from '@/lib/postgres-maintenance';
import { useTauriToolJob } from '@/hooks/use-tauri-tool-job';

export function usePostgresToolJob() {
  const { state, start, cancel, reset } = useTauriToolJob<PostgresToolKind, PostgresToolEvent>({
    cancelJob: cancelPostgresToolJob,
    eventName: POSTGRES_TOOL_EVENT,
    logScope: 'postgres-tool-job',
  });

  const startBackup = useCallback(
    async (request: PostgresBackupRequest) => start('backup', () => startPostgresBackup(request)),
    [start],
  );

  const startRestore = useCallback(
    async (request: PostgresRestoreRequest) => start('restore', () => startPostgresRestore(request)),
    [start],
  );

  return {
    state,
    startBackup,
    startRestore,
    cancel,
    reset,
  };
}
