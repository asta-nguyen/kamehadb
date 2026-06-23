import type {
  ConnectionProfile,
  FileDatabaseBackupRequest,
  FileDatabaseMaintenanceResult,
  FileDatabaseRestoreRequest,
} from '@kamehadb/shared';
import { isFileDatabaseKind } from '@kamehadb/shared';
import { isTauriRuntime } from '@/lib/tauri';

class FileDatabaseMaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileDatabaseMaintenanceError';
  }
}

type FilePathParts = {
  readonly directory: string;
  readonly baseName: string;
  readonly extension: string;
};

function splitFilePath(filePath: string): FilePathParts {
  const lastSeparatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const directory = lastSeparatorIndex >= 0 ? filePath.slice(0, lastSeparatorIndex + 1) : '';
  const fileName = lastSeparatorIndex >= 0 ? filePath.slice(lastSeparatorIndex + 1) : filePath;
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return { directory, baseName: fileName, extension: '' };
  }

  return {
    directory,
    baseName: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex),
  };
}

// Gate the UI to the engines whose on-disk files can be backed up and restored
// directly, because server-backed engines need engine-specific tooling instead.
export function supportsFileDatabaseMaintenance(connection: ConnectionProfile): boolean {
  return (
    isFileDatabaseKind(connection.kind) && typeof connection.filePath === 'string' && connection.filePath.length > 0
  );
}

export function defaultFileDatabaseBackupPath(connection: ConnectionProfile): string {
  const sourcePath = connection.filePath?.trim();
  const date = new Date().toISOString().slice(0, 10);

  if (!sourcePath) {
    return `${connection.name || 'database'}-backup-${date}.db`;
  }

  const { directory, baseName, extension } = splitFilePath(sourcePath);
  return `${directory}${baseName}-backup-${date}${extension}`;
}

export async function pickFileDatabaseBackupDestination(connection: ConnectionProfile): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new FileDatabaseMaintenanceError('Backup is only available in the Tauri desktop app');
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const selected = await save({
    canCreateDirectories: true,
    defaultPath: defaultFileDatabaseBackupPath(connection),
  });
  return selected ?? null;
}

export async function pickFileDatabaseRestoreInput(connection: ConnectionProfile): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new FileDatabaseMaintenanceError('Restore is only available in the Tauri desktop app');
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const sourcePath = connection.filePath?.trim();
  const fileParts = sourcePath ? splitFilePath(sourcePath) : null;
  const extension = fileParts?.extension.startsWith('.') ? fileParts.extension.slice(1) : null;
  const selected = await open({
    directory: false,
    multiple: false,
    filters: extension ? [{ name: `${connection.kind} backups`, extensions: [extension] }] : undefined,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function backupFileDatabase(
  connectionId: string,
  request: FileDatabaseBackupRequest,
): Promise<FileDatabaseMaintenanceResult> {
  const { api } = await import('@/lib/api');
  return api.backupFileDatabase(connectionId, request);
}

export async function restoreFileDatabase(
  connectionId: string,
  request: FileDatabaseRestoreRequest,
): Promise<FileDatabaseMaintenanceResult> {
  const { api } = await import('@/lib/api');
  return api.restoreFileDatabase(connectionId, request);
}
