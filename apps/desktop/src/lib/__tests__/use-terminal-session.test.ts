import { describe, expect, it } from 'vitest';

import { canStartTerminalSession } from '@/hooks/use-terminal-session';

describe('canStartTerminalSession', () => {
  it('blocks overlapping start attempts while a start request is still in flight', () => {
    expect(canStartTerminalSession('idle', true)).toBe(false);
  });

  it('blocks starts for active sessions', () => {
    expect(canStartTerminalSession('starting', false)).toBe(false);
    expect(canStartTerminalSession('running', false)).toBe(false);
  });

  it('allows a fresh start from idle, exited, or failed states', () => {
    expect(canStartTerminalSession('idle', false)).toBe(true);
    expect(canStartTerminalSession('exited', false)).toBe(true);
    expect(canStartTerminalSession('error', false)).toBe(true);
  });
});
