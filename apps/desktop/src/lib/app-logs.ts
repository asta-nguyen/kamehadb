import { invokeTauri, isTauriRuntime } from '@/lib/tauri';

const FRONTEND_LOG_STORAGE_KEY = 'kamehadb_frontend_logs';
const MAX_LOCAL_LOGS = 200;

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

function appendLocalFrontendLog(entry: FrontendLogInput): void {
  try {
    const current = readLocalFrontendLogs();
    current.unshift({
      timestampMs: entry.timestampMs ?? Date.now(),
      level: entry.level,
      source: 'frontend',
      message: entry.message,
      scope: entry.scope ?? null,
      details: entry.details ?? null,
      stack: entry.stack ?? null,
      url: entry.url ?? null,
    });
    localStorage.setItem(FRONTEND_LOG_STORAGE_KEY, JSON.stringify(current.slice(0, MAX_LOCAL_LOGS)));
  } catch {
    // Ignore logging failures to avoid recursive error loops in the UI.
  }
}

function readLocalFrontendLogs(): AppLogEntry[] {
  try {
    const raw = localStorage.getItem(FRONTEND_LOG_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AppLogEntry[];
  } catch {
    return [];
  }
}

export async function appendFrontendLog(entry: FrontendLogInput): Promise<void> {
  appendLocalFrontendLog(entry);
  if (!isTauriRuntime()) return;
  await invokeTauri<void>('append_frontend_log', { entry });
}

export async function readAppLogs(limit = 300): Promise<AppLogsSnapshot> {
  if (!isTauriRuntime()) {
    return { entries: readLocalFrontendLogs().slice(0, limit), logDir: 'Browser localStorage' };
  }
  return invokeTauri<AppLogsSnapshot>('read_app_logs', { limit });
}

export function formatLogTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}
