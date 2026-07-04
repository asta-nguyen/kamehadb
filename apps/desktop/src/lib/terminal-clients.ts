import { invokeTauri } from '@/lib/tauri';
import type { TerminalSessionStarted } from '@/lib/terminal-session';

export type StartTerminalClientRequest = {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
};

export type ToolCheckResult = {
  readonly installed: boolean;
  readonly hint: string;
};

export function checkToolInstalled(program: string, hint: string): Promise<ToolCheckResult> {
  return invokeTauri<ToolCheckResult>('check_tool_installed', { program, hint });
}

export function startPostgresPsqlSession(request: StartTerminalClientRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_postgres_psql_session', { request });
}

export function startOracleSqlplusSession(request: StartTerminalClientRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_oracle_sqlplus_session', { request });
}

export function startDuckdbCliSession(request: StartTerminalClientRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_duckdb_cli_session', { request });
}

export function startClickhouseClientSession(request: StartTerminalClientRequest): Promise<TerminalSessionStarted> {
  return invokeTauri<TerminalSessionStarted>('start_clickhouse_client_session', { request });
}
