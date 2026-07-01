import { KIND, type ConnectionProfile } from '@kamehadb/shared';
import { createSqlServerAdapter } from '../adapters/sqlserver.js';
import * as metadataStore from '../db/metadata-store.js';
import { SQLSERVER_MAINTENANCE_TIMEOUT_MS } from './constants.js';
import { log } from './logger.js';

export type SqlServerBackupRequest = {
  readonly outputPath: string;
};

export type SqlServerRestoreRequest = {
  readonly inputPath: string;
  readonly targetDatabase: string;
};

export type SqlServerMaintenanceResult = {
  readonly success: boolean;
  readonly message: string;
};

function escapeIdentifier(id: string): string {
  return '[' + id.replace(/\]/g, ']]') + ']';
}

export async function backupSqlServerDatabase(
  profile: ConnectionProfile,
  request: SqlServerBackupRequest,
): Promise<SqlServerMaintenanceResult> {
  if (profile.kind !== KIND.SQLSERVER) {
    return { success: false, message: 'Backup is only available for SQL Server connections' };
  }

  const database = profile.database ?? '';
  if (!database) {
    return { success: false, message: 'Database name is required for backup' };
  }

  const adapter = createSqlServerAdapter(
    {
      host: profile.host,
      port: profile.port,
      database: profile.database,
      username: profile.username,
      password: metadataStore.getProfilePassword(profile.id) ?? undefined,
    },
    { requestTimeoutMs: SQLSERVER_MAINTENANCE_TIMEOUT_MS },
  );
  const sql = `BACKUP DATABASE ${escapeIdentifier(database)} TO DISK = '${request.outputPath.replace(/'/g, "''")}' WITH FORMAT, INIT, SKIP`;

  log.info({ connectionId: profile.id, database, outputPath: request.outputPath }, 'Starting SQL Server backup');

  try {
    await adapter.runQuery({ query: sql });
    return { success: true, message: `Backup of ${database} completed successfully` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ connectionId: profile.id, err: message }, 'SQL Server backup failed');
    return { success: false, message: `Backup failed: ${message}` };
  } finally {
    await adapter.close().catch(() => undefined);
  }
}

export async function restoreSqlServerDatabase(
  profile: ConnectionProfile,
  request: SqlServerRestoreRequest,
): Promise<SqlServerMaintenanceResult> {
  if (profile.kind !== KIND.SQLSERVER) {
    return { success: false, message: 'Restore is only available for SQL Server connections' };
  }

  const targetDatabase = request.targetDatabase.trim();
  if (!targetDatabase) {
    return { success: false, message: 'Target database is required for restore' };
  }

  const adapter = createSqlServerAdapter(
    {
      host: profile.host,
      port: profile.port,
      database: profile.database,
      username: profile.username,
      password: metadataStore.getProfilePassword(profile.id) ?? undefined,
    },
    { requestTimeoutMs: SQLSERVER_MAINTENANCE_TIMEOUT_MS },
  );

  log.info({ connectionId: profile.id, targetDatabase, inputPath: request.inputPath }, 'Starting SQL Server restore');

  const restoreSql = `RESTORE DATABASE ${escapeIdentifier(targetDatabase)} FROM DISK = '${request.inputPath.replace(/'/g, "''")}' WITH REPLACE`;

  try {
    await adapter.runQuery({ query: restoreSql });
    return { success: true, message: `Restore of ${targetDatabase} completed successfully` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ connectionId: profile.id, err: message }, 'SQL Server restore failed');
    return { success: false, message: `Restore failed: ${message}` };
  } finally {
    await adapter.close().catch(() => undefined);
  }
}
