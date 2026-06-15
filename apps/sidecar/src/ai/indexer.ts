import { listProfiles, getAISettings } from '../db/metadata-store.js';
import { getSqlAdapter } from '../routes/sql.js';
import { buildSchemaIndex } from './qdrant-store.js';

export async function indexAllConnections(): Promise<void> {
  const settings = getAISettings();
  const activeConfig = settings.providers[settings.activeProvider];
  if (!activeConfig?.enabled) {
    console.log('[AI Indexer] No active provider configured, skipping schema indexing');
    return;
  }

  const profiles = listProfiles();
  const sqlProfiles = profiles.filter((p) => p.kind !== 'redis' && p.kind !== 'mongodb' && p.kind !== 'tigerbeetle');

  if (sqlProfiles.length === 0) {
    console.log('[AI Indexer] No SQL connections to index');
    return;
  }

  console.log(`[AI Indexer] Indexing schemas for ${sqlProfiles.length} SQL connection(s)...`);

  for (const profile of sqlProfiles) {
    try {
      const adapter = await getSqlAdapter(profile.id);
      const count = await buildSchemaIndex(adapter, profile.id, settings.activeProvider, activeConfig, false);
      if (count > 0) {
        console.log(`[AI Indexer] Indexed ${count} table(s) for "${profile.name}"`);
      } else {
        console.log(`[AI Indexer] Schema unchanged for "${profile.name}"`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND') || errMsg.includes('fetch failed')) {
        console.warn(`[AI Indexer] Skipping "${profile.name}" — provider unavailable (${errMsg})`);
      } else {
        console.error(`[AI Indexer] Failed to index "${profile.name}":`, err);
      }
    }
  }

  console.log('[AI Indexer] Schema indexing complete');
}
