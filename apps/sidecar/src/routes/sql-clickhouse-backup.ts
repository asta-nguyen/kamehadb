import { zValidator } from '@hono/zod-validator';
import { KIND } from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { httpError, handleError } from '../lib/route-utils.js';
import { getSqlAdapter } from './sql.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

function getClickHouseProfile(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw httpError('Connection not found', 404);
  if (profile.kind !== KIND.CLICKHOUSE) {
    throw httpError('Backup and restore are only available for ClickHouse connections', 400);
  }
  return profile;
}

export function createSqlClickHouseBackupRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  /**
   * POST /clickhouse-backup/backup
   *
   * Runs `BACKUP DATABASE <db> TO File('<outputPath>')` via the ClickHouse HTTP client.
   * ClickHouse writes the archive to the server's local file system (requires the File
   * storage type to be enabled in config, which is the default for local installs).
   */
  router.post(
    '/clickhouse-backup/backup',
    zValidator(
      'json',
      z.object({
        outputPath: z.string().min(1),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId')!;
      const { outputPath } = c.req.valid('json');

      try {
        const profile = getClickHouseProfile(connectionId);
        const database = profile.database || 'default';
        const adapter = await getSqlAdapter(connectionId);
        // Run the BACKUP command — result is discarded (ClickHouse returns metadata)
        await adapter.runQuery({
          query: `BACKUP DATABASE \`${database.replaceAll('`', '``')}\` TO File('${outputPath.replaceAll("'", "\\'")}') SETTINGS async=false`,
        });
        return c.json({ path: outputPath, database });
      } catch (err) {
        return options.handleError(c, err, 'clickhouseBackup');
      }
    },
  );

  /**
   * POST /clickhouse-backup/restore
   *
   * Runs `RESTORE DATABASE <db> FROM File('<inputPath>')` via the ClickHouse HTTP client.
   */
  router.post(
    '/clickhouse-backup/restore',
    zValidator(
      'json',
      z.object({
        inputPath: z.string().min(1),
        targetDatabase: z.string().min(1),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId')!;
      const { inputPath, targetDatabase } = c.req.valid('json');

      try {
        getClickHouseProfile(connectionId);
        const adapter = await getSqlAdapter(connectionId);
        await adapter.runQuery({
          query: `RESTORE DATABASE \`${targetDatabase.replaceAll('`', '``')}\` FROM File('${inputPath.replaceAll("'", "\\'")}') SETTINGS async=false`,
        });
        return c.json({ database: targetDatabase });
      } catch (err) {
        return options.handleError(c, err, 'clickhouseRestore');
      }
    },
  );

  return router;
}
