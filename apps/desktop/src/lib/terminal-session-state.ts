export type TerminalSessionKind = 'postgresPsql';

export type TerminalSessionStatus = 'idle' | 'starting' | 'running' | 'exited' | 'error';

export type TerminalSessionState = {
  readonly sessionId: string | null;
  readonly kind: TerminalSessionKind | null;
  readonly status: TerminalSessionStatus;
  readonly message: string | null;
  readonly exitCode: number | null;
};

export type TerminalSessionEvent =
  | {
      readonly type: 'started';
      readonly sessionId: string;
      readonly kind: TerminalSessionKind;
      readonly message: string;
    }
  | {
      readonly type: 'data';
      readonly sessionId: string;
      readonly kind: TerminalSessionKind;
      readonly data: number[];
    }
  | {
      readonly type: 'exit';
      readonly sessionId: string;
      readonly kind: TerminalSessionKind;
      readonly exitCode: number;
      readonly message: string;
    }
  | {
      readonly type: 'error';
      readonly sessionId: string;
      readonly kind: TerminalSessionKind;
      readonly message: string;
    };

export const INITIAL_TERMINAL_SESSION_STATE: TerminalSessionState = {
  sessionId: null,
  kind: null,
  status: 'idle',
  message: null,
  exitCode: null,
};

export function markTerminalSessionStopped(current: TerminalSessionState): TerminalSessionState {
  if (current.status !== 'running' && current.status !== 'starting') {
    return current;
  }

  return {
    ...current,
    sessionId: null,
    status: 'exited',
    message: 'Terminal session stopped',
    exitCode: null,
  };
}

export function reduceTerminalSessionEvent(
  current: TerminalSessionState,
  event: TerminalSessionEvent,
): TerminalSessionState {
  if (event.type === 'data') {
    return current;
  }

  if (event.type === 'started') {
    return {
      sessionId: event.sessionId,
      kind: event.kind,
      status: 'running',
      message: event.message,
      exitCode: null,
    };
  }

  if (event.type === 'exit') {
    return {
      sessionId: event.sessionId,
      kind: event.kind,
      status: 'exited',
      message: event.message,
      exitCode: event.exitCode,
    };
  }

  return {
    sessionId: event.sessionId,
    kind: event.kind,
    status: 'error',
    message: event.message,
    exitCode: null,
  };
}
