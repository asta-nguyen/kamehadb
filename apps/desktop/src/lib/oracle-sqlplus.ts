import { invokeTauri } from '@/lib/tauri';
import type { TerminalSessionStarted } from '@/lib/terminal-session';

export type StartOracleSqlplusRequest = {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
};

export async function startOracleSqlplusSession(
  request: StartOracleSqlplusRequest,
): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_oracle_sqlplus_session', { request });
}
