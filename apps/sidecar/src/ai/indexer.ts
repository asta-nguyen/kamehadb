import { listProfiles, getAISettings } from '../db/metadata-store.js';
import { getSqlAdapter } from '../routes/sql.js';
import { buildSchemaIndex } from './vec-store.js';
import { isSqlKind } from '@kamehadb/shared';
import { log } from '../lib/logger.js';

export async function indexAllConnections(): Promise<void> {
  const settings = getAISettings();
  const activeConfig = settings.providers[settings.activeProvider];
  if (!activeConfig?.enabled) {
    log.info('[AI Indexer] No active provider configured, skipping schema indexing');
    return;
  }

  const profiles = listProfiles();
  const sqlProfiles = profiles.filter((p) => isSqlKind(p.kind));

  if (sqlProfiles.length === 0) {
    log.info('[AI Indexer] No SQL connections to index');
    return;
  }

  log.info({ count: sqlProfiles.length }, '[AI Indexer] Indexing schemas for SQL connections');

  for (const profile of sqlProfiles) {
    try {
      const adapter = await getSqlAdapter(profile.id);
      const count = await buildSchemaIndex(adapter, profile.id, settings.activeProvider, activeConfig, false);
      if (count > 0) {
        log.info({ profile: profile.name, tables: count }, '[AI Indexer] Indexed tables');
      } else {
        log.info({ profile: profile.name }, '[AI Indexer] Schema unchanged');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND') || errMsg.includes('fetch failed')) {
        log.warn({ profile: profile.name, err: errMsg }, '[AI Indexer] Skipping — provider unavailable');
      } else {
        log.error({ profile: profile.name, err }, '[AI Indexer] Failed to index');
      }
    }
  }

  log.info('[AI Indexer] Schema indexing complete');
}
