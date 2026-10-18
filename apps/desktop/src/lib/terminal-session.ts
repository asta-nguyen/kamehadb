import { EventsOn } from '../../wailsjs/runtime/runtime';
import { ResizeTerminalSession, StopTerminalSession, WriteTerminalSession } from '../../wailsjs/go/api/TerminalService';
import type { TerminalSessionEvent } from './terminal-session-state';

export const TERMINAL_SESSION_EVENT = 'terminal-session-event';

export type TerminalSize = {
  readonly cols: number;
  readonly rows: number;
};

export type TerminalSessionStarted = {
  readonly sessionId: string;
};

export function onTerminalSessionEvent(handler: (event: TerminalSessionEvent) => void): () => void {
  return EventsOn(TERMINAL_SESSION_EVENT, handler as (data: unknown) => void);
}

export async function writeTerminalSession(sessionId: string, data: string): Promise<void> {
  await WriteTerminalSession(sessionId, data);
}

export async function resizeTerminalSession(sessionId: string, size: TerminalSize): Promise<void> {
  await ResizeTerminalSession(sessionId, size);
}

export async function stopTerminalSession(sessionId: string): Promise<void> {
  await StopTerminalSession(sessionId);
}
