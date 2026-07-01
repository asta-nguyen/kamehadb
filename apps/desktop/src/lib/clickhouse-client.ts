import { invokeTauri } from '@/lib/tauri';
import type { TerminalSessionStarted } from '@/lib/terminal-session';

export type StartClickhouseClientRequest = {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
};

export async function startClickhouseClientSession(
  request: StartClickhouseClientRequest,
): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_clickhouse_client_session', { request });
}
