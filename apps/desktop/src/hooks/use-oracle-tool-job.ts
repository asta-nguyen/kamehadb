import {
  cancelOracleToolJob,
  ORACLE_TOOL_EVENT,
  type OracleBackupRequest,
  type OracleRestoreRequest,
  type OracleToolEvent,
  type OracleToolKind,
  startOracleBackup,
  startOracleRestore,
} from '@/lib/oracle-maintenance';
import { useCallback } from 'react';
import { useTauriToolJob } from '@/hooks/use-tauri-tool-job';

export function useOracleToolJob() {
  const { state, start, cancel, reset } = useTauriToolJob<OracleToolKind, OracleToolEvent>({
    eventName: ORACLE_TOOL_EVENT,
    logScope: 'oracle-tool-job.listen',
    startScope: 'oracle-tool-job.start',
    cancelJob: cancelOracleToolJob,
  });

  const startBackup = useCallback(
    async (request: OracleBackupRequest) => start('backup', () => startOracleBackup(request)),
    [start],
  );

  const startRestore = useCallback(
    async (request: OracleRestoreRequest) => start('restore', () => startOracleRestore(request)),
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
