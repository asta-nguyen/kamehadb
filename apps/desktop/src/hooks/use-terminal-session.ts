import { useCallback, useEffect, useRef, useState } from 'react';

import type { TerminalSize, TerminalSessionStarted } from '@/lib/terminal-session';
import {
  resizeTerminalSession,
  stopTerminalSession,
  TERMINAL_SESSION_EVENT,
  writeTerminalSession,
} from '@/lib/terminal-session';
import {
  INITIAL_TERMINAL_SESSION_STATE,
  markTerminalSessionStopped,
  reduceTerminalSessionEvent,
  type TerminalSessionEvent,
  type TerminalSessionKind,
  type TerminalSessionState,
} from '@/lib/terminal-session-state';
import { listenTauri } from '@/lib/tauri';

export function canStartTerminalSession(status: TerminalSessionState['status'], startPending: boolean) {
  return !startPending && status !== 'starting' && status !== 'running';
}

type UseTerminalSessionOptions = {
  readonly kind: TerminalSessionKind;
  readonly onData: (data: Uint8Array) => void;
  readonly startSession: (size: TerminalSize) => Promise<TerminalSessionStarted>;
};

export function useTerminalSession({ kind, onData, startSession }: UseTerminalSessionOptions) {
  const [state, setState] = useState<TerminalSessionState>(INITIAL_TERMINAL_SESSION_STATE);
  const isMountedRef = useRef(true);
  const onDataRef = useRef(onData);
  const sessionIdRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<TerminalSessionEvent[]>([]);
  const pendingInputRef = useRef<string[]>([]);
  const pendingSizeRef = useRef<TerminalSize | null>(null);
  const startTokenRef = useRef(0);
  const startPendingRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  onDataRef.current = onData;

  const stopListening = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  const applyEvent = useCallback(
    (event: TerminalSessionEvent) => {
      if (!sessionIdRef.current) {
        pendingEventsRef.current.push(event);
        return;
      }
      if (event.sessionId !== sessionIdRef.current) return;

      if (event.type === 'data') {
        onDataRef.current(new Uint8Array(event.data));
        return;
      }

      setState((current) => reduceTerminalSessionEvent(current, event));
      if (event.type === 'exit' || event.type === 'error') {
        sessionIdRef.current = null;
        stopListening();
      }
    },
    [stopListening],
  );

  const stop = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    startTokenRef.current += 1;
    startPendingRef.current = false;
    pendingEventsRef.current = [];
    pendingInputRef.current = [];
    pendingSizeRef.current = null;
    stopListening();
    setState((current) => markTerminalSessionStopped(current));
    if (sessionId) {
      await stopTerminalSession(sessionId).catch(() => undefined);
    }
  }, [stopListening]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      void stop();
    };
  }, [stop]);

  const start = useCallback(
    async (size: TerminalSize) => {
      if (!canStartTerminalSession(state.status, startPendingRef.current)) return;

      const startToken = startTokenRef.current + 1;
      startTokenRef.current = startToken;
      startPendingRef.current = true;
      stopListening();
      sessionIdRef.current = null;
      pendingEventsRef.current = [];
      pendingInputRef.current = [];
      pendingSizeRef.current = size;

      try {
        const unlisten = await listenTauri<TerminalSessionEvent>(TERMINAL_SESSION_EVENT, applyEvent);
        if (!isMountedRef.current || startTokenRef.current !== startToken) {
          unlisten();
          return;
        }

        unlistenRef.current = unlisten;
        setState({
          sessionId: null,
          kind,
          status: 'starting',
          message: 'Starting terminal session...',
          exitCode: null,
        });

        const result = await startSession(size);
        if (!isMountedRef.current || startTokenRef.current !== startToken) {
          await stopTerminalSession(result.sessionId).catch(() => undefined);
          return;
        }

        sessionIdRef.current = result.sessionId;
        setState((current) => ({ ...current, sessionId: result.sessionId }));

        for (const event of pendingEventsRef.current) {
          applyEvent(event);
        }
        pendingEventsRef.current = [];

        if (pendingSizeRef.current) {
          await resizeTerminalSession(result.sessionId, pendingSizeRef.current).catch(() => undefined);
        }
        for (const chunk of pendingInputRef.current) {
          await writeTerminalSession(result.sessionId, chunk).catch(() => undefined);
        }
        pendingInputRef.current = [];
      } catch (error) {
        stopListening();
        sessionIdRef.current = null;
        pendingEventsRef.current = [];
        pendingInputRef.current = [];
        if (isMountedRef.current && startTokenRef.current === startToken) {
          setState({
            sessionId: null,
            kind,
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to start terminal session',
            exitCode: null,
          });
        }
      } finally {
        if (startTokenRef.current === startToken) {
          startPendingRef.current = false;
        }
      }
    },
    [applyEvent, kind, startSession, state.status, stopListening],
  );

  const write = useCallback(async (data: string) => {
    if (!data) return;
    if (!sessionIdRef.current) {
      pendingInputRef.current.push(data);
      return;
    }
    await writeTerminalSession(sessionIdRef.current, data);
  }, []);

  const resize = useCallback(async (size: TerminalSize) => {
    pendingSizeRef.current = size;
    if (!sessionIdRef.current) return;
    await resizeTerminalSession(sessionIdRef.current, size);
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    startTokenRef.current += 1;
    startPendingRef.current = false;
    pendingEventsRef.current = [];
    pendingInputRef.current = [];
    pendingSizeRef.current = null;
    stopListening();
    setState(INITIAL_TERMINAL_SESSION_STATE);
  }, [stopListening]);

  return {
    state,
    start,
    write,
    resize,
    stop,
    reset,
  };
}
