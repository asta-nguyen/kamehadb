import Database from 'better-sqlite3';
import {
  type ConnectionProfile,
  isFileDatabaseKind,
  KIND,
  type FileDatabaseBackupRequest,
  type FileDatabaseMaintenanceResult,
  type FileDatabaseRestoreRequest,
} from '@kamehadb/shared';
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { SQLITE_RELATED_SUFFIXES, DUCKDB_RELATED_SUFFIXES, ADAPTER_TIMEOUTS } from './constants.js';

type SupportedFileDatabaseProfile = ConnectionProfile & {
  readonly kind: typeof KIND.SQLITE | typeof KIND.DUCKDB;
  readonly filePath: string;
};

export class FileDatabaseMaintenanceError extends Error {
  readonly code: 'not-file-database' | 'missing-file-path' | 'missing-source-file' | 'same-path';

  constructor(code: 'not-file-database' | 'missing-file-path' | 'missing-source-file' | 'same-path', message: string) {
    super(message);
    this.name = 'FileDatabaseMaintenanceError';
    this.code = code;
  }
}

// Narrow a saved profile to the file-backed engines because backup and restore
// need a concrete on-disk path, not a server connection string.
export function requireFileDatabaseProfile(profile: ConnectionProfile): SupportedFileDatabaseProfile {
  if (!isFileDatabaseKind(profile.kind)) {
    throw new FileDatabaseMaintenanceError(
      'not-file-database',
      'Backup and restore are only available for SQLite and DuckDB connections',
    );
  }
  if (!profile.filePath) {
    throw new FileDatabaseMaintenanceError(
      'missing-file-path',
      'The saved connection does not include a database file',
    );
  }
  return {
    ...profile,
    kind: profile.kind,
    filePath: profile.filePath,
  };
}

// SQLite and DuckDB keep extra sidecar files for write-ahead logs, so restore
// must either copy them with the main file or remove stale leftovers.
function relatedSuffixes(kind: SupportedFileDatabaseProfile['kind']): readonly string[] {
  return kind === KIND.SQLITE ? SQLITE_RELATED_SUFFIXES : DUCKDB_RELATED_SUFFIXES;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function copyRelatedFiles(
  sourcePath: string,
  targetPath: string,
  suffixes: readonly string[],
): Promise<string[]> {
  const copiedPaths: string[] = [];

  for (const suffix of suffixes) {
    const relatedSourcePath = `${sourcePath}${suffix}`;
    if (!(await pathExists(relatedSourcePath))) {
      continue;
    }

    const relatedTargetPath = `${targetPath}${suffix}`;
    await copyFile(relatedSourcePath, relatedTargetPath);
    copiedPaths.push(relatedTargetPath);
  }

  return copiedPaths;
}

async function removeRelatedFiles(targetPath: string, suffixes: readonly string[]): Promise<void> {
  await Promise.all(suffixes.map((suffix) => rm(`${targetPath}${suffix}`, { force: true })));
}

function ensureDistinctPaths(sourcePath: string, targetPath: string): void {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) {
    throw new FileDatabaseMaintenanceError('same-path', 'Choose a different file path for backup or restore');
  }
}

function escapeSqliteLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

async function backupSqliteDatabase(
  sourcePath: string,
  request: FileDatabaseBackupRequest,
): Promise<FileDatabaseMaintenanceResult> {
  await ensureParentDirectory(request.outputPath);
  await rm(request.outputPath, { force: true });
  await removeRelatedFiles(request.outputPath, SQLITE_RELATED_SUFFIXES);

  // VACUUM INTO creates a consistent single-file snapshot even when the
  // source database normally uses WAL mode, which avoids shipping log files.
  const db = new Database(sourcePath);
  try {
    db.pragma(`busy_timeout = ${ADAPTER_TIMEOUTS.BUSY}`);
    db.exec(`VACUUM INTO '${escapeSqliteLiteral(request.outputPath)}'`);
  } finally {
    db.close();
  }

  return { path: request.outputPath, relatedPaths: [] };
}

async function backupByCopy(
  profile: SupportedFileDatabaseProfile,
  request: FileDatabaseBackupRequest,
): Promise<FileDatabaseMaintenanceResult> {
  await ensureParentDirectory(request.outputPath);
  await copyFile(profile.filePath, request.outputPath);
  const copiedRelatedPaths = await copyRelatedFiles(
    profile.filePath,
    request.outputPath,
    relatedSuffixes(profile.kind),
  );
  return { path: request.outputPath, relatedPaths: [...copiedRelatedPaths] };
}

export async function backupFileDatabase(
  profile: ConnectionProfile,
  request: FileDatabaseBackupRequest,
): Promise<FileDatabaseMaintenanceResult> {
  const fileDatabaseProfile = requireFileDatabaseProfile(profile);

  if (!(await pathExists(fileDatabaseProfile.filePath))) {
    throw new FileDatabaseMaintenanceError('missing-source-file', 'The configured database file was not found');
  }
  ensureDistinctPaths(fileDatabaseProfile.filePath, request.outputPath);

  if (fileDatabaseProfile.kind === KIND.SQLITE) {
    return backupSqliteDatabase(fileDatabaseProfile.filePath, request);
  }

  return backupByCopy(fileDatabaseProfile, request);
}

export async function restoreFileDatabase(
  profile: ConnectionProfile,
  request: FileDatabaseRestoreRequest,
): Promise<FileDatabaseMaintenanceResult> {
  const fileDatabaseProfile = requireFileDatabaseProfile(profile);

  if (!(await pathExists(request.inputPath))) {
    throw new FileDatabaseMaintenanceError('missing-source-file', 'The selected backup file was not found');
  }
  ensureDistinctPaths(request.inputPath, fileDatabaseProfile.filePath);

  await ensureParentDirectory(fileDatabaseProfile.filePath);
  await copyFile(request.inputPath, fileDatabaseProfile.filePath);

  const suffixes = relatedSuffixes(fileDatabaseProfile.kind);
  const copiedRelatedPaths = await copyRelatedFiles(request.inputPath, fileDatabaseProfile.filePath, suffixes);
  if (copiedRelatedPaths.length === 0) {
    await removeRelatedFiles(fileDatabaseProfile.filePath, suffixes);
  }

  return { path: fileDatabaseProfile.filePath, relatedPaths: [...copiedRelatedPaths] };
}
