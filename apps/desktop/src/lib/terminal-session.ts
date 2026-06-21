import { invokeTauri } from '@/lib/tauri';

export const TERMINAL_SESSION_EVENT = 'terminal-session-event';

export type TerminalSize = {
  readonly cols: number;
  readonly rows: number;
};

export type TerminalSessionStarted = {
  readonly sessionId: string;
};

export async function writeTerminalSession(sessionId: string, data: string): Promise<void> {
  await invokeTauri('write_terminal_session', { sessionId, data });
}

export async function resizeTerminalSession(sessionId: string, size: TerminalSize): Promise<void> {
  await invokeTauri('resize_terminal_session', { sessionId, size });
}

export async function stopTerminalSession(sessionId: string): Promise<void> {
  await invokeTauri('stop_terminal_session', { sessionId });
}
