import { invokeTauri } from '@/lib/tauri';
import type { TerminalSessionStarted } from '@/lib/terminal-session';

export type StartDuckdbCliRequest = {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
};

export async function startDuckdbCliSession(
  request: StartDuckdbCliRequest,
): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_duckdb_cli_session', { request });
}
