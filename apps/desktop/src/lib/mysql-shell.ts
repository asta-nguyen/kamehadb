import { invokeTauri } from '@/lib/tauri';
import type { TerminalSessionStarted } from '@/lib/terminal-session';

export type StartMysqlShellRequest = {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
};

export async function startMysqlShellSession(request: StartMysqlShellRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_mysql_shell_session', { request });
}
