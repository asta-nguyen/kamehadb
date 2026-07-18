import type { ConnectionProfile } from '@kamehadb/shared';
import { invokeTauri, isTauriRuntime } from '@/lib/tauri';

export const POSTGRES_TOOL_EVENT = 'postgres-tool-event';

export const POSTGRES_BACKUP_FORMATS = ['plain', 'custom', 'tar'] as const;
export type PostgresBackupFormat = (typeof POSTGRES_BACKUP_FORMATS)[number];

export type PostgresBackupScope =
  | { readonly kind: 'database' }
  | { readonly kind: 'schema'; readonly schema: string }
  | { readonly kind: 'table'; readonly schema: string; readonly table: string };

export type PostgresBackupRequest = {
  readonly connectionId: number;
  readonly outputPath: string;
  readonly format: PostgresBackupFormat;
  readonly scope: PostgresBackupScope;
};

export type PostgresRestoreRequest = {
  readonly connectionId: number;
  readonly inputPath: string;
  readonly targetDatabase: string;
  readonly clean: boolean;
};

export type PostgresToolKind = 'backup' | 'restore';

export type PostgresToolEvent =
  | {
      readonly jobId: string;
      readonly kind: PostgresToolKind;
      readonly type: 'started';
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: PostgresToolKind;
      readonly type: 'log';
      readonly stream: 'stdout' | 'stderr';
      readonly line: string;
    }
  | {
      readonly jobId: string;
      readonly kind: PostgresToolKind;
      readonly type: 'finished';
      readonly exitCode: number;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: PostgresToolKind;
      readonly type: 'failed';
      readonly exitCode: number | null;
      readonly message: string;
    }
  | {
      readonly jobId: string;
      readonly kind: PostgresToolKind;
      readonly type: 'cancelled';
      readonly message: string;
    };

type PostgresJobStart = {
  readonly jobId: string;
};

const BACKUP_EXTENSION: Record<PostgresBackupFormat, string> = {
  plain: 'sql',
  custom: 'dump',
  tar: 'tar',
};

export function defaultBackupPath(connection: ConnectionProfile, format: PostgresBackupFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  const baseName = (connection.database || connection.name || 'postgres-backup').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${baseName}-${date}.${BACKUP_EXTENSION[format]}`;
}

export async function pickBackupDestination(
  connection: ConnectionProfile,
  format: PostgresBackupFormat,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error('Backup is only available in the Tauri desktop app');
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const selected = await save({
    canCreateDirectories: true,
    defaultPath: defaultBackupPath(connection, format),
    filters: [
      {
        name: `PostgreSQL ${format} backup`,
        extensions: [BACKUP_EXTENSION[format]],
      },
    ],
  });
  return selected ?? null;
}

export async function pickRestoreInput(): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error('Restore is only available in the Tauri desktop app');
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    multiple: false,
    filters: [{ name: 'Supported PostgreSQL dumps', extensions: ['sql', 'dump', 'backup', 'tar', 'psql'] }],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function startPostgresBackup(request: PostgresBackupRequest): Promise<PostgresJobStart> {
  return invokeTauri<PostgresJobStart>('start_postgres_backup', { request });
}

export async function startPostgresRestore(request: PostgresRestoreRequest): Promise<PostgresJobStart> {
  return invokeTauri<PostgresJobStart>('start_postgres_restore', { request });
}

export async function cancelPostgresToolJob(jobId: string): Promise<void> {
  await invokeTauri('cancel_postgres_job', { jobId });
}
