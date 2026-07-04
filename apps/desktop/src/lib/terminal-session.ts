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

export type StartPostgresPsqlRequest = { readonly connectionId: string; readonly cols: number; readonly rows: number };
export async function startPostgresPsqlSession(request: StartPostgresPsqlRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_postgres_psql_session', { request });
}

export type StartSqlite3Request = { readonly connectionId: string; readonly cols: number; readonly rows: number };
export async function startSqlite3Session(request: StartSqlite3Request): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_sqlite3_session', { request });
}

export type StartSqlcmdRequest = { readonly connectionId: string; readonly cols: number; readonly rows: number };
export async function startSqlcmdSession(request: StartSqlcmdRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_sqlcmd_session', { request });
}

export type ToolInstallStatus = {
  readonly installed: boolean;
  readonly path: string | null;
  readonly hint: string;
};

// Proactively checks whether a CLI binary is on PATH before launching a
// terminal session, so the shell tab can show an install reminder overlay
// instead of failing inside the terminal. (Why: better UX than a spawn error.)
export async function checkToolInstalled(program: string): Promise<ToolInstallStatus> {
  return invokeTauri<ToolInstallStatus>('check_tool_installed', { program });
}
