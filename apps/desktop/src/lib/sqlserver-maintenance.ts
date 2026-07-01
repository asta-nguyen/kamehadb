import type { ConnectionProfile } from '@kamehadb/shared';
import { isTauriRuntime } from '@/lib/tauri';

export function isSqlServerMaintenanceSupported(connection: ConnectionProfile): boolean {
  return connection.kind === 'sqlserver';
}

export async function pickSqlServerBackupDestination(connection: ConnectionProfile): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error('Backup is only available in the Tauri desktop app');
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const date = new Date().toISOString().slice(0, 10);
  const dbName = connection.database || 'database';
  const selected = await save({
    canCreateDirectories: true,
    defaultPath: `${dbName}-backup-${date}.bak`,
    filters: [{ name: 'SQL Server backup', extensions: ['bak'] }],
  });
  return selected ?? null;
}

export async function pickSqlServerRestoreInput(): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error('Restore is only available in the Tauri desktop app');
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: 'SQL Server backup', extensions: ['bak'] }],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function backupSqlServerDatabase(
  connectionId: string,
  request: { readonly outputPath: string },
): Promise<{ readonly success: boolean; readonly message: string }> {
  const { api } = await import('@/lib/api');
  return api.backupSqlServerDatabase(connectionId, request);
}

export async function restoreSqlServerDatabase(
  connectionId: string,
  request: { readonly inputPath: string; readonly targetDatabase: string },
): Promise<{ readonly success: boolean; readonly message: string }> {
  const { api } = await import('@/lib/api');
  return api.restoreSqlServerDatabase(connectionId, request);
}
