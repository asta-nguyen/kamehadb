import { listProfiles, getAISettings } from '../db/metadata-store.js';
import { getSqlAdapter } from '../routes/sql.js';
import { buildSchemaIndex } from './vec-store.js';
import {
  buildMongoSchemaIndex,
  buildQdrantSchemaIndex,
  buildRedisSchemaIndex,
  buildTigerBeetleSchemaIndex,
} from './non-sql-index.js';
import { log } from '../lib/logger.js';
import { KIND, isSqlKind, safeErrorMessage } from '@kamehadb/shared';
import type { AIProvider, AIProviderConfig, ConnectionProfile } from '@kamehadb/shared';
import {
  createMongoDbAdapter,
  createQdrantDbAdapter,
  createRedisDbAdapter,
  createTigerBeetleDbAdapter,
} from '../adapters/factory.js';
import { getProfilePassword } from '../db/metadata-store.js';

export async function indexAllConnections(): Promise<void> {
  const settings = getAISettings();
  const activeConfig = settings.providers[settings.activeProvider];
  if (!activeConfig?.enabled) {
    log.info('[AI Indexer] No active provider configured, skipping schema indexing');
    return;
  }

  const profiles = listProfiles();
  if (profiles.length === 0) {
    log.info('[AI Indexer] No connections to index');
    return;
  }

  log.info({ count: profiles.length }, '[AI Indexer] Indexing schemas for all connections');

  for (const profile of profiles) {
    try {
      const count = await indexConnection(profile, settings.activeProvider, activeConfig);
      if (count > 0) {
        log.info({ profile: profile.name, items: count }, '[AI Indexer] Indexed schema items');
      } else {
        log.info({ profile: profile.name }, '[AI Indexer] Schema unchanged or empty');
      }
    } catch (err) {
      const errMsg = safeErrorMessage(err, String(err));
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND') || errMsg.includes('fetch failed')) {
        log.warn({ profile: profile.name, err: errMsg }, '[AI Indexer] Skipping — provider unavailable');
      } else {
        log.error({ profile: profile.name, err }, '[AI Indexer] Failed to index');
      }
    }
  }

  log.info('[AI Indexer] Schema indexing complete');
}

/** Dispatch a single connection to the right schema indexer based on its kind.
 * SQL engines go through the SqlAdapter path; non-SQL engines each have a
 * dedicated builder that produces schema items for the vec0 store. */
async function indexConnection(
  profile: ConnectionProfile,
  provider: AIProvider,
  config: AIProviderConfig,
): Promise<number> {
  if (isSqlKind(profile.kind)) {
    const adapter = await getSqlAdapter(profile.id);
    return buildSchemaIndex(adapter, profile.id, provider, config, false);
  }

  switch (profile.kind) {
    case KIND.MONGODB: {
      const adapter = createMongoDbAdapter(profile);
      try {
        return await buildMongoSchemaIndex(adapter, profile.id, provider, config, false);
      } finally {
        await adapter.close().catch((err) => {
          log.warn({ profile: profile.name, err }, '[AI Indexer] Adapter close failed');
        });
      }
    }
    case KIND.QDRANT: {
      const adapter = createQdrantDbAdapter(profile);
      try {
        return await buildQdrantSchemaIndex(adapter, profile.id, provider, config, false);
      } finally {
        await adapter.close().catch((err) => {
          log.warn({ profile: profile.name, err }, '[AI Indexer] Adapter close failed');
        });
      }
    }
    case KIND.REDIS: {
      const password = getProfilePassword(profile.id);
      const adapter = createRedisDbAdapter(profile, password ?? undefined);
      try {
        return await buildRedisSchemaIndex(adapter, profile.id, provider, config, false);
      } finally {
        await adapter.close().catch((err) => {
          log.warn({ profile: profile.name, err }, '[AI Indexer] Adapter close failed');
        });
      }
    }
    case KIND.TIGERBEETLE: {
      const adapter = createTigerBeetleDbAdapter(profile);
      try {
        return await buildTigerBeetleSchemaIndex(adapter, profile.id, provider, config, false);
      } finally {
        await adapter.close().catch((err) => {
          log.warn({ profile: profile.name, err }, '[AI Indexer] Adapter close failed');
        });
      }
    }
    default:
      return 0;
  }
}
