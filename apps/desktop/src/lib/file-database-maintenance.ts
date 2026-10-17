import type {
  ConnectionProfile,
  FileDatabaseBackupRequest,
  FileDatabaseMaintenanceResult,
  FileDatabaseRestoreRequest,
} from '@kamehadb/shared';
import { isFileDatabaseKind } from '@kamehadb/shared';
import { PickSaveFile, PickOpenFile } from '../../wailsjs/go/main/App';

export { FileDatabaseMaintenanceError } from '@kamehadb/shared';

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

  const lastSep = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
  const directory = lastSep >= 0 ? sourcePath.slice(0, lastSep + 1) : '';
  const fileName = lastSep >= 0 ? sourcePath.slice(lastSep + 1) : sourcePath;
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extension = lastDot > 0 ? fileName.slice(lastDot) : '';
  return `${directory}${baseName}-backup-${date}${extension}`;
}

export async function pickFileDatabaseBackupDestination(connection: ConnectionProfile): Promise<string | null> {
  const selected = await PickSaveFile(defaultFileDatabaseBackupPath(connection), 'Backup database', []);
  return selected || null;
}

export async function pickFileDatabaseRestoreInput(connection: ConnectionProfile): Promise<string | null> {
  const sourcePath = connection.filePath?.trim();
  let extension: string | null = null;
  if (sourcePath) {
    const lastSep = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
    const fileName = lastSep >= 0 ? sourcePath.slice(lastSep + 1) : sourcePath;
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot > 0) extension = fileName.slice(lastDot + 1);
  }
  const selected = await PickOpenFile(
    'Restore database',
    extension ? [{ displayName: `${connection.kind} backups`, pattern: `*.${extension}` }] : [],
  );
  return selected || null;
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
