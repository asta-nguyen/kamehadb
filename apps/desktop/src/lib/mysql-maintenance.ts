import type { ConnectionProfile } from '@kamehadb/shared';
import { invokeTauri, isTauriRuntime } from '@/lib/tauri';

export const MYSQL_TOOL_EVENT = 'mysql-tool-event';

export const MYSQL_BACKUP_FORMATS = ['sql', 'xml'] as const;
export type MysqlBackupFormat = (typeof MYSQL_BACKUP_FORMATS)[number];

export type MysqlBackupScope = { readonly kind: 'database' } | { readonly kind: 'table'; readonly table: string };

export type MysqlBackupRequest = {
  readonly connectionId: string;
  readonly outputPath: string;
  readonly format: MysqlBackupFormat;
  readonly scope: MysqlBackupScope;
};

export type MysqlRestoreRequest = {
  readonly connectionId: string;
  readonly inputPath: string;
  readonly targetDatabase: string;
};

export type MysqlToolKind = 'backup' | 'restore';

export type MysqlToolEvent =
  | {
      readonly jobId: string;
      readonly kind: MysqlToolKind;
      readonly type: 'started';
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: MysqlToolKind;
      readonly type: 'log';
      readonly stream: 'stdout' | 'stderr';
      readonly line: string;
    }
  | {
      readonly jobId: string;
      readonly kind: MysqlToolKind;
      readonly type: 'finished';
      readonly exitCode: number;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: MysqlToolKind;
      readonly type: 'failed';
      readonly exitCode: number | null;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: MysqlToolKind;
      readonly type: 'cancelled';
      readonly message: string;
    };

type MysqlJobStart = {
  readonly jobId: string;
};

class MysqlMaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MysqlMaintenanceError';
  }
}

const BACKUP_EXTENSION: Record<MysqlBackupFormat, string> = {
  sql: 'sql',
  xml: 'xml',
};

export function defaultBackupPath(connection: ConnectionProfile, format: MysqlBackupFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const baseName = (connection.database || connection.name || 'mysql-backup').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${baseName}-${date}.${BACKUP_EXTENSION[format]}`;
}

export async function pickBackupDestination(
  connection: ConnectionProfile,
  format: MysqlBackupFormat,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new MysqlMaintenanceError('Backup is only available in the Tauri desktop app');
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const selected = await save({
    canCreateDirectories: true,
    defaultPath: defaultBackupPath(connection, format),
    filters: [
      {
        name: format === 'xml' ? 'MySQL/MariaDB XML dump' : 'MySQL/MariaDB SQL dump',
        extensions: [BACKUP_EXTENSION[format]],
      },
    ],
  });
  return selected ?? null;
}

export async function pickRestoreInput(): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new MysqlMaintenanceError('Restore is only available in the Tauri desktop app');
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: 'Supported SQL dumps', extensions: ['sql', 'backup', 'dump'] }],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function startMysqlBackup(request: MysqlBackupRequest): Promise<MysqlJobStart> {
  return invokeTauri<MysqlJobStart>('start_mysql_backup', { request });
}

export async function startMysqlRestore(request: MysqlRestoreRequest): Promise<MysqlJobStart> {
  return invokeTauri<MysqlJobStart>('start_mysql_restore', { request });
}

export async function cancelMysqlToolJob(jobId: string): Promise<void> {
  await invokeTauri('cancel_mysql_job', { jobId });
}
