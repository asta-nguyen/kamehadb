import { useCallback, useEffect, useRef, useState } from 'react';

import { appendFrontendLog } from '@/lib/app-logs';
import { listenTauri } from '@/lib/tauri';

export type TauriToolJobLog = {
  readonly stream: 'stdout' | 'stderr';
  readonly line: string;
};

export type TauriToolJobStatus = 'idle' | 'running' | 'finished' | 'failed' | 'cancelled';

export type TauriToolJobState<TKind extends string> = {
  readonly jobId: string | null;
  readonly kind: TKind | null;
  readonly status: TauriToolJobStatus;
  readonly message: string | null;
  readonly exitCode: number | null;
  readonly logs: readonly TauriToolJobLog[];
};

export type TauriToolJobEvent<TKind extends string> =
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

type StartToolJobResult = {
  readonly jobId: string;
};

type UseTauriToolJobOptions = {
  readonly cancelJob: (jobId: string) => Promise<void>;
  readonly eventName: string;
  readonly logScope: string;
};

function initialToolJobState<TKind extends string>(): TauriToolJobState<TKind> {
  return {
    jobId: null,
    kind: null,
    status: 'idle',
    message: null,
    exitCode: null,
    logs: [],
  };
}

export function useTauriToolJob<TKind extends string, TEvent extends TauriToolJobEvent<TKind>>({
  cancelJob,
  eventName,
  logScope,
}: UseTauriToolJobOptions) {
  const [state, setState] = useState<TauriToolJobState<TKind>>(() => initialToolJobState<TKind>());
  const jobIdRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<TEvent[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);

  const stopListening = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  useEffect(() => stopListening, [stopListening]);

  const handleEvent = useCallback(
    (event: TEvent) => {
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
    async (kind: TKind, run: () => Promise<StartToolJobResult>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      stopListening();
      jobIdRef.current = null;
      pendingEventsRef.current = [];

      let unlisten: () => void;
      try {
        unlisten = await listenTauri<TEvent>(eventName, handleEvent);
      } catch (error) {
        busyRef.current = false;
        setState({
          ...initialToolJobState<TKind>(),
          kind,
          status: 'failed',
          message: error instanceof Error ? error.message : `Failed to listen for ${kind} events`,
          exitCode: null,
        });
        void appendFrontendLog({
          level: 'error',
          scope: `${logScope}.listen`,
          message: `Failed to listen for ${kind} events: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : String(error),
        });
        return;
      }

      unlistenRef.current = unlisten;
      setState({
        ...initialToolJobState<TKind>(),
        kind,
        status: 'running',
        message: `Starting ${kind}...`,
      });

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
          ...initialToolJobState<TKind>(),
          kind,
          status: 'failed',
          message: error instanceof Error ? error.message : `Failed to start ${kind}`,
          exitCode: null,
        });
        void appendFrontendLog({
          level: 'error',
          scope: `${logScope}.start`,
          message: `Failed to start ${kind}: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : String(error),
        });
      }
    },
    [eventName, handleEvent, logScope, stopListening],
  );

  const cancel = useCallback(async () => {
    if (!jobIdRef.current || state.status !== 'running') return;
    await cancelJob(jobIdRef.current);
  }, [cancelJob, state.status]);

  const reset = useCallback(() => {
    busyRef.current = false;
    jobIdRef.current = null;
    pendingEventsRef.current = [];
    stopListening();
    setState(initialToolJobState<TKind>());
  }, [stopListening]);

  return {
    state,
    start,
    cancel,
    reset,
  };
}
