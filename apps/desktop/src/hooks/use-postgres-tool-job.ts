import { useCallback, useEffect, useRef, useState } from 'react';
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
import { listenTauri } from '@/lib/tauri';

type PostgresToolLog = {
  readonly stream: 'stdout' | 'stderr';
  readonly line: string;
};

type PostgresToolStatus = 'idle' | 'running' | 'finished' | 'failed' | 'cancelled';

type PostgresToolState = {
  readonly jobId: string | null;
  readonly kind: PostgresToolKind | null;
  readonly status: PostgresToolStatus;
  readonly message: string | null;
  readonly exitCode: number | null;
  readonly logs: readonly PostgresToolLog[];
};

const INITIAL_STATE: PostgresToolState = {
  jobId: null,
  kind: null,
  status: 'idle',
  message: null,
  exitCode: null,
  logs: [],
};

export function usePostgresToolJob() {
  const [state, setState] = useState<PostgresToolState>(INITIAL_STATE);
  const jobIdRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<PostgresToolEvent[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  const stopListening = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  useEffect(() => stopListening, [stopListening]);

  const handleEvent = useCallback(
    (event: PostgresToolEvent) => {
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
      stopListening();
    },
    [stopListening],
  );

  const start = useCallback(
    async (
      kind: PostgresToolKind,
      run: () => Promise<{
        readonly jobId: string;
      }>,
    ) => {
      stopListening();
      jobIdRef.current = null;
      pendingEventsRef.current = [];
      const unlisten = await listenTauri<PostgresToolEvent>(POSTGRES_TOOL_EVENT, handleEvent);
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
      }
    },
    [handleEvent, stopListening],
  );

  const startBackup = useCallback(
    async (request: PostgresBackupRequest) => start('backup', () => startPostgresBackup(request)),
    [start],
  );

  const startRestore = useCallback(
    async (request: PostgresRestoreRequest) => start('restore', () => startPostgresRestore(request)),
    [start],
  );

  const cancel = useCallback(async () => {
    if (!jobIdRef.current || state.status !== 'running') return;
    await cancelPostgresToolJob(jobIdRef.current);
  }, [state.status]);

  const reset = useCallback(() => {
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
