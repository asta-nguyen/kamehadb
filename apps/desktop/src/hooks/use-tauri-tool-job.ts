import { useCallback, useEffect, useRef, useState } from 'react';
import { appendFrontendLog } from '@/lib/app-logs';
import { listenTauri } from '@/lib/tauri';

type ToolJobStatus = 'idle' | 'running' | 'finished' | 'failed' | 'cancelled';

type ToolJobEvent<TKind extends string> =
  | {
      readonly jobId: string;
      readonly kind: TKind;
      readonly type: 'started';
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: TKind;
      readonly type: 'log';
      readonly stream: 'stdout' | 'stderr';
      readonly line: string;
    }
  | {
      readonly jobId: string;
      readonly kind: TKind;
      readonly type: 'finished';
      readonly exitCode: number;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: TKind;
      readonly type: 'failed';
      readonly exitCode: number | null;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: TKind;
      readonly type: 'cancelled';
      readonly message: string;
    };

type ToolJobLog = {
  readonly stream: 'stdout' | 'stderr';
  readonly line: string;
};

type ToolJobState<TKind extends string> = {
  readonly jobId: string | null;
  readonly kind: TKind | null;
  readonly status: ToolJobStatus;
  readonly message: string | null;
  readonly exitCode: number | null;
  readonly logs: readonly ToolJobLog[];
};

const MAX_PENDING_EVENTS = 200;
const MAX_LOG_LINES = 200;

export function useTauriToolJob<TKind extends string, TEvent extends ToolJobEvent<TKind>>({
  eventName,
  logScope,
  startScope,
  cancelJob,
}: {
  readonly eventName: string;
  readonly logScope: string;
  readonly startScope: string;
  readonly cancelJob: (jobId: string) => Promise<void>;
}) {
  const initialStateRef = useRef<ToolJobState<TKind>>({
    jobId: null,
    kind: null,
    status: 'idle',
    message: null,
    exitCode: null,
    logs: [],
  });
  const initialState = initialStateRef.current;
  const [state, setState] = useState<ToolJobState<TKind>>(initialState);
  const jobIdRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<readonly TEvent[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const startGenRef = useRef(0);

  const stopListening = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  useEffect(() => stopListening, [stopListening]);

  const handleEvent = useCallback(
    (event: TEvent) => {
      if (!jobIdRef.current) {
        pendingEventsRef.current = [...pendingEventsRef.current.slice(-(MAX_PENDING_EVENTS - 1)), event];
        return;
      }
      if (event.jobId !== jobIdRef.current) return;

      if (event.type === 'log') {
        setState((current) => ({
          ...current,
          logs: [...current.logs.slice(-(MAX_LOG_LINES - 1)), { stream: event.stream, line: event.line }],
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

      busyRef.current = false;
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
      kind: TKind,
      run: () => Promise<{
        readonly jobId: string;
      }>,
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      startGenRef.current += 1;
      const gen = startGenRef.current;
      stopListening();
      jobIdRef.current = null;
      pendingEventsRef.current = [];

      let unlisten: () => void;
      try {
        unlisten = await listenTauri<TEvent>(eventName, handleEvent);
      } catch (error) {
        busyRef.current = false;
        setState({
          ...initialState,
          kind,
          status: 'failed',
          message: error instanceof Error ? error.message : `Failed to listen for ${kind} events`,
          exitCode: null,
        });
        void appendFrontendLog({
          level: 'error',
          scope: logScope,
          message: `Failed to listen for ${kind} events: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : String(error),
        });
        return;
      }

      unlistenRef.current = unlisten;
      setState({ ...initialState, kind, status: 'running', message: `Starting ${kind}...` });

      try {
        const result = await run();
        if (gen !== startGenRef.current) return;
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
          ...initialState,
          kind,
          status: 'failed',
          message: error instanceof Error ? error.message : `Failed to start ${kind}`,
          exitCode: null,
        });
        void appendFrontendLog({
          level: 'error',
          scope: startScope,
          message: `Failed to start ${kind}: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : String(error),
        });
      }
    },
    [eventName, handleEvent, initialState, logScope, startScope, stopListening],
  );

  const cancel = useCallback(async () => {
    if (!jobIdRef.current || state.status !== 'running') return;
    try {
      await cancelJob(jobIdRef.current);
    } catch (error) {
      void appendFrontendLog({
        level: 'error',
        scope: logScope,
        message: `Cancel failed: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : String(error),
      });
    }
  }, [cancelJob, logScope, state.status]);

  const reset = useCallback(() => {
    busyRef.current = false;
    startGenRef.current += 1;
    jobIdRef.current = null;
    pendingEventsRef.current = [];
    stopListening();
    setState(initialState);
  }, [initialState, stopListening]);

  return {
    state,
    start,
    cancel,
    reset,
  };
}
