import { useCallback, useEffect, useRef, useState } from 'react';
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
import { listenTauri } from '@/lib/tauri';
import { appendFrontendLog } from '@/lib/app-logs';

type OracleToolLog = {
  readonly stream: 'stdout' | 'stderr';
  readonly line: string;
};

type OracleToolStatus = 'idle' | 'running' | 'finished' | 'failed' | 'cancelled';

type OracleToolState = {
  readonly jobId: string | null;
  readonly kind: OracleToolKind | null;
  readonly status: OracleToolStatus;
  readonly message: string | null;
  readonly exitCode: number | null;
  readonly logs: readonly OracleToolLog[];
};

const INITIAL_STATE: OracleToolState = {
  jobId: null,
  kind: null,
  status: 'idle',
  message: null,
  exitCode: null,
  logs: [],
};

export function useOracleToolJob() {
  const [state, setState] = useState<OracleToolState>(INITIAL_STATE);
  const jobIdRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<OracleToolEvent[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);

  const stopListening = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  useEffect(() => stopListening, [stopListening]);

  const handleEvent = useCallback(
    (event: OracleToolEvent) => {
      if (!jobIdRef.current) {
        pendingEventsRef.current.push(event);
        return;
      }
      if (event.jobId !== jobIdRef.current) return;

      if (event.type === 'log') {
        setState((current) => ({
          ...current,
          logs: [...current.logs.slice(-199), { stream: event.stream, line: event.line }],
        }));
        return;
      }

      if (event.type === 'started') {
        setState((current) => ({
          ...current,
          kind: event.kind,
          status: 'running',
          message: event.message,
        }));
        return;
      }

      if (event.type === 'finished') {
        busyRef.current = false;
        setState((current) => ({
          ...current,
          status: 'finished',
          exitCode: event.exitCode,
          message: event.message,
        }));
        stopListening();
        return;
      }

      if (event.type === 'cancelled') {
        busyRef.current = false;
        setState((current) => ({
          ...current,
          status: 'cancelled',
          message: event.message,
        }));
        stopListening();
        return;
      }

      setState((current) => ({
        ...current,
        status: 'failed',
        exitCode: event.exitCode,
        message: event.message,
      }));
      busyRef.current = false;
      stopListening();
    },
    [stopListening],
  );

  const start = useCallback(
    async (
      kind: OracleToolKind,
      run: () => Promise<{
        readonly jobId: string;
      }>,
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      stopListening();
      jobIdRef.current = null;
      pendingEventsRef.current = [];

      let unlisten: () => void;
      try {
        unlisten = await listenTauri<OracleToolEvent>(ORACLE_TOOL_EVENT, handleEvent);
      } catch (error) {
        busyRef.current = false;
        setState({
          ...INITIAL_STATE,
          kind,
          status: 'failed',
          message: error instanceof Error ? error.message : `Failed to listen for ${kind} events`,
          exitCode: null,
        });
        void appendFrontendLog({
          level: 'error',
          scope: 'oracle-tool-job.listen',
          message: `Failed to listen for ${kind} events: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : String(error),
        });
        return;
      }

      unlistenRef.current = unlisten;
      setState({ ...INITIAL_STATE, kind, status: 'running', message: `Starting ${kind}...` });

      try {
        const result = await run();
        jobIdRef.current = result.jobId;
        setState((current) => ({ ...current, jobId: result.jobId }));
        for (const event of pendingEventsRef.current) {
          handleEvent(event);
        }
        pendingEventsRef.current = [];
      } catch (error) {
        busyRef.current = false;
        stopListening();
        jobIdRef.current = null;
        pendingEventsRef.current = [];
        setState({
          ...INITIAL_STATE,
          kind,
          status: 'failed',
          message: error instanceof Error ? error.message : `Failed to start ${kind}`,
          exitCode: null,
        });
        void appendFrontendLog({
          level: 'error',
          scope: 'oracle-tool-job.start',
          message: `Failed to start ${kind}: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : String(error),
        });
      }
    },
    [handleEvent, stopListening],
  );

  const startBackup = useCallback(
    async (request: OracleBackupRequest) => start('backup', () => startOracleBackup(request)),
    [start],
  );

  const startRestore = useCallback(
    async (request: OracleRestoreRequest) => start('restore', () => startOracleRestore(request)),
    [start],
  );

  const cancel = useCallback(async () => {
    if (!jobIdRef.current || state.status !== 'running') return;
    await cancelOracleToolJob(jobIdRef.current);
  }, [state.status]);

  const reset = useCallback(() => {
    busyRef.current = false;
    jobIdRef.current = null;
    pendingEventsRef.current = [];
    stopListening();
    setState(INITIAL_STATE);
  }, [stopListening]);

  return {
    state,
    startBackup,
    startRestore,
    cancel,
    reset,
  };
}
