import { AppendFrontendLog, ClearAppLogs, ReadAppLogs } from '../../wailsjs/go/api/LogsService';
import type { logs } from '../../wailsjs/go/models';

export type AppLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type AppLogSource = 'frontend' | 'app' | 'tauri' | 'sidecar';

export type AppLogEntry = logs.Entry;
export type FrontendLogInput = logs.FrontendInput;
export type AppLogsSnapshot = logs.Snapshot;

export async function appendFrontendLog(entry: FrontendLogInput): Promise<void> {
  try {
    await AppendFrontendLog(entry);
  } catch (error) {
    // Best-effort logging must never break the caller — but keep a breadcrumb.
    console.warn('appendFrontendLog failed', error);
  }
}

export async function readAppLogs(limit = 300): Promise<AppLogsSnapshot> {
  return ReadAppLogs(limit);
}

export async function clearAppLogs(): Promise<void> {
  return ClearAppLogs();
}

export function formatLogTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}
