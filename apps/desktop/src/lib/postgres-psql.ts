import { invokeTauri } from '@/lib/tauri';
import type { TerminalSessionStarted } from '@/lib/terminal-session';

export type StartPostgresPsqlRequest = {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
};

export async function startPostgresPsqlSession(request: StartPostgresPsqlRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_postgres_psql_session', { request });
}
