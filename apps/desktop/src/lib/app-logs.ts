import { invokeTauri, isTauriRuntime } from '@/lib/tauri';

export type AppLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type AppLogSource = 'frontend' | 'tauri' | 'sidecar';

export interface AppLogEntry {
  readonly timestampMs: number;
  readonly level: string;
  readonly source: string;
  readonly message: string;
  readonly scope?: string | null;
  readonly details?: string | null;
  readonly stack?: string | null;
  readonly url?: string | null;
}

export interface FrontendLogInput {
  readonly timestampMs?: number;
  readonly level: AppLogLevel;
  readonly message: string;
  readonly scope?: string;
  readonly details?: string;
  readonly stack?: string;
  readonly url?: string;
}

export interface AppLogsSnapshot {
  readonly entries: AppLogEntry[];
  readonly logDir: string;
}

export async function appendFrontendLog(entry: FrontendLogInput): Promise<void> {
  if (!isTauriRuntime()) return;
  await invokeTauri<void>('append_frontend_log', { entry });
}

export async function readAppLogs(limit = 300): Promise<AppLogsSnapshot> {
  if (!isTauriRuntime()) {
    return { entries: [], logDir: 'Logs are only available in the built app' };
  }
  return invokeTauri<AppLogsSnapshot>('read_app_logs', { limit });
}

export async function clearAppLogs(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invokeTauri<void>('clear_app_logs');
}

export function formatLogTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}
