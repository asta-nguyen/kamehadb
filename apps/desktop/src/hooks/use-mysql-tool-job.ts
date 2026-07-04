import { useCallback } from 'react';
import {
  cancelMysqlToolJob,
  MYSQL_TOOL_EVENT,
  type MysqlBackupRequest,
  type MysqlRestoreRequest,
  type MysqlToolEvent,
  type MysqlToolKind,
  startMysqlBackup,
  startMysqlRestore,
} from '@/lib/mysql-maintenance';
import { useTauriToolJob } from '@/hooks/use-tauri-tool-job';

export function useMysqlToolJob() {
  const { state, start, cancel, reset } = useTauriToolJob<MysqlToolKind, MysqlToolEvent>({
    cancelJob: cancelMysqlToolJob,
    eventName: MYSQL_TOOL_EVENT,
    logScope: 'mysql-tool-job',
  });

  const startBackup = useCallback(
    async (request: MysqlBackupRequest) => start('backup', () => startMysqlBackup(request)),
    [start],
  );

  const startRestore = useCallback(
    async (request: MysqlRestoreRequest) => start('restore', () => startMysqlRestore(request)),
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
