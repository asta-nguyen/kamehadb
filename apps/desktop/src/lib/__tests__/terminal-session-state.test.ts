import { describe, expect, it } from 'vitest';

import {
  INITIAL_TERMINAL_SESSION_STATE,
  markTerminalSessionStopped,
  reduceTerminalSessionEvent,
} from '../terminal-session-state';

describe('terminal session state', () => {
  it('moves into running state when the session starts', () => {
    expect(
      reduceTerminalSessionEvent(INITIAL_TERMINAL_SESSION_STATE, {
        type: 'started',
        sessionId: 'session-1',
        kind: 'postgresPsql',
        message: 'Connected',
      }),
    ).toEqual({
      sessionId: 'session-1',
      kind: 'postgresPsql',
      status: 'running',
      message: 'Connected',
      exitCode: null,
    });
  });

  it('keeps the session id while surfacing process exit details', () => {
    expect(
      reduceTerminalSessionEvent(
        {
          sessionId: 'session-1',
          kind: 'postgresPsql',
          status: 'running',
          message: 'Connected',
          exitCode: null,
        },
        {
          type: 'exit',
          sessionId: 'session-1',
          kind: 'postgresPsql',
          exitCode: 2,
          message: 'psql exited with code 2',
        },
      ),
    ).toEqual({
      sessionId: 'session-1',
      kind: 'postgresPsql',
      status: 'exited',
      message: 'psql exited with code 2',
      exitCode: 2,
    });
  });

  it('marks running sessions as exited when stopped', () => {
    expect(
      markTerminalSessionStopped({
        sessionId: 'session-1',
        kind: 'postgresPsql',
        status: 'running',
        message: 'Connected',
        exitCode: null,
      }),
    ).toEqual({
      sessionId: null,
      kind: 'postgresPsql',
      status: 'exited',
      message: 'Terminal session stopped',
      exitCode: null,
    });
  });
});
