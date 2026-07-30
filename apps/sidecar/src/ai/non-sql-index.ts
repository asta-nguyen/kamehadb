import type { AIProvider, AIProviderConfig, MongoAdapter, QdrantAdapter, RedisAdapter } from '@kamehadb/shared';
import crypto from 'node:crypto';
import type { TigerBeetleAdapter } from '../adapters/tigerbeetle.js';
import { indexSchemaItems, type SchemaItem } from './vec-store.js';

function hashText(...parts: string[]): string {
  const h = crypto.createHash('sha256');
  for (const p of parts) {
    h.update(p);
    h.update('\x00');
  }
  return h.digest('hex');
}

/** Reduce a raw Redis key to a structural pattern so tenant-specific values
 * (user ids, emails, session tokens, uuids, hex ids) are not sent to the
 * embedding provider. Numeric runs, uuids, and long hex strings are replaced
 * with stable placeholders; the key's namespace separators are preserved so
 * the AI still learns the key-space shape. */
function keyToPattern(key: string): string {
  return key
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<uuid>')
    .replace(/[0-9a-fA-F]{16,}/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/<n>\.<n>\.<n>\.<n>/g, '<ip>')
    .replace(/[^\s:@/._-]+@[^\s:@/]+\.[^\s:@/]+/g, '<email>');
}

/** Index MongoDB collections as schema items. Each collection becomes one
 * item with its field names (inferred from a sample document), index list,
 * and document count. Iterates user databases only (skips admin/local/config). */
export async function buildMongoSchemaIndex(
  adapter: MongoAdapter,
  connectionId: string,
  provider: AIProvider,
  config: AIProviderConfig,
  force: boolean = false,
): Promise<number> {
  const databases = await adapter.listDatabases();
  const userDbs = databases.filter((db) => !['admin', 'local', 'config'].includes(db.name));
  const items: SchemaItem[] = [];

  for (const db of userDbs.slice(0, 20)) {
    const collections = await adapter.listCollections(db.name);
    for (const coll of collections.slice(0, 50)) {
      const stats = await adapter.getCollectionStats(db.name, coll.name).catch(() => null);
      let fieldLines = '(no sample document)';
      if (stats && stats.documentCount > 0) {
        const result = await adapter
          .findDocuments({ collection: coll.name, database: db.name, limit: 1 })
          .catch(() => null);
        if (result && result.documents.length > 0) {
          const sample = result.documents[0] as Record<string, unknown>;
          fieldLines = Object.keys(sample)
            .slice(0, 20)
            .map((k) => {
              const v = sample[k];
              const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
              return `- ${k}: ${type}`;
            })
            .join('\n');
        }
      }
      const indexLines = stats
        ? stats.indexes
            .slice(0, 10)
            .map((idx) => `- ${idx.name}${idx.unique ? ' (unique)' : ''}: ${JSON.stringify(idx.key)}`)
            .join('\n')
        : '(no indexes)';

      const enriched = [
        `MongoDB Collection: ${db.name}.${coll.name}`,
        `Type: ${coll.type}`,
        `Document count: ${stats?.documentCount.toLocaleString() ?? 'unknown'}`,
        '',
        'Fields (inferred from sample document):',
        fieldLines,
        '',
        'Indexes:',
        indexLines,
      ].join('\n');

      items.push({
        tableId: `${db.name}.${coll.name}`,
        enriched,
        hash: hashText(db.name, coll.name, coll.type, String(stats?.documentCount ?? ''), fieldLines, indexLines),
      });
    }
  }

  return indexSchemaItems(connectionId, items, provider, config, force);
}

/** Index Qdrant collections as schema items. Each collection becomes one item
 * with vector size, distance metric, and point count. */
export async function buildQdrantSchemaIndex(
  adapter: QdrantAdapter,
  connectionId: string,
  provider: AIProvider,
  config: AIProviderConfig,
  force: boolean = false,
): Promise<number> {
  const collections = await adapter.listCollections();
  const items: SchemaItem[] = collections.map((coll) => {
    const enriched = [
      `Qdrant Collection: ${coll.name}`,
      `Status: ${coll.status ?? 'unknown'}`,
      `Vector size: ${coll.vectorSize ?? 'unknown'}`,
      `Distance: ${coll.distance ?? 'unknown'}`,
      `Points: ${coll.pointsCount.toLocaleString()}`,
      '',
      'Use Qdrant REST API for search/recommend/scroll operations on this collection.',
    ].join('\n');

    return {
      tableId: coll.name,
      enriched,
      hash: hashText(coll.name, String(coll.vectorSize ?? ''), coll.distance ?? '', String(coll.pointsCount)),
    };
  });

  return indexSchemaItems(connectionId, items, provider, config, force);
}

/** Index Redis key types as schema items. Scans a bounded sample of keys,
 * groups by type, and creates one item per key-type group so the AI knows
 * what data structures live in this Redis instance. */
export async function buildRedisSchemaIndex(
  adapter: RedisAdapter,
  connectionId: string,
  provider: AIProvider,
  config: AIProviderConfig,
  force: boolean = false,
): Promise<number> {
  const stats = await adapter.getStats().catch(() => null);
  const items: SchemaItem[] = [];

  // Scan a bounded sample of keys to learn the key-space shape. Store only
  // structural patterns (not raw keys) so tenant data such as user ids,
  // emails, or session tokens is never sent to the embedding provider.
  const seen = new Map<string, { count: number; patterns: Set<string> }>();
  let cursor = 0;
  const maxIterations = 20;
  for (let i = 0; i < maxIterations; i++) {
    const page = await adapter.scanKeys({ cursor, count: 200 }).catch(() => null);
    if (!page) break;
    for (const key of page.keys) {
      const entry = seen.get(key.type) ?? { count: 0, patterns: new Set<string>() };
      entry.count += 1;
      if (entry.patterns.size < 10) entry.patterns.add(keyToPattern(key.key));
      seen.set(key.type, entry);
    }
    cursor = page.cursor;
    if (page.done) break;
  }

  for (const [type, { count, patterns }] of seen) {
    const patternLines = [...patterns].map((p) => `- ${p}`);
    const enriched = [
      `Redis Key Type: ${type}`,
      `Total keys in DB: ${stats?.totalKeys.toLocaleString() ?? 'unknown'}`,
      `Expiring keys: ${stats?.expiringKeys.toLocaleString() ?? 'unknown'}`,
      `Used memory: ${stats ? `${(stats.usedMemory / 1024 / 1024).toFixed(1)} MB` : 'unknown'}`,
      `Sampled keys of this type: ${count.toLocaleString()}`,
      '',
      `Key patterns (${type}, dynamic segments masked):`,
      ...(patternLines.length > 0 ? patternLines : ['- (no patterns sampled)']),
      '',
      `Use Redis CLI commands for this data type: ${
        type === 'string'
          ? 'GET, SET, STRLEN'
          : type === 'hash'
            ? 'HGETALL, HGET, HSET'
            : type === 'list'
              ? 'LRANGE, LPUSH, RPUSH'
              : type === 'set'
                ? 'SMEMBERS, SADD, SISMEMBER'
                : type === 'zset'
                  ? 'ZRANGE, ZADD, ZSCORE'
                  : 'XLEN, XRANGE, XADD'
      }`,
    ].join('\n');

    items.push({
      tableId: `redis:${type}`,
      enriched,
      hash: hashText(type, String(count), [...patterns].join(','), String(stats?.totalKeys ?? '')),
    });
  }

  return indexSchemaItems(connectionId, items, provider, config, force);
}

/** Index TigerBeetle's fixed schema (accounts + transfers) as two schema
 * items. TigerBeetle has a fixed shape — no dynamic table discovery — so we
 * describe the two record types and their fields so the AI can reason about
 * them. Live account identifiers are intentionally NOT embedded; the fixed
 * schema is enough context and avoids exposing tenant data to the embedding
 * provider. */
export async function buildTigerBeetleSchemaIndex(
  adapter: TigerBeetleAdapter,
  connectionId: string,
  provider: AIProvider,
  config: AIProviderConfig,
  force: boolean = false,
): Promise<number> {
  // Probe whether any accounts exist so the indexer can skip embedding the
  // fixed schema for an empty cluster. The actual account ids are never
  // embedded — only the boolean presence is reflected in the hash.
  const hasAccounts = (await adapter.queryAccounts(1).catch(() => [])).length > 0;

  const accountItem: SchemaItem = {
    tableId: 'tigerbeetle:accounts',
    enriched: [
      'TigerBeetle Record Type: accounts',
      'Purpose: Stores financial accounts with double-entry balances',
      '',
      'Fields:',
      '- id (u128): Unique account identifier',
      '- debits_pending (u128): Pending debit amount',
      '- debits_posted (u128): Posted debit amount',
      '- credits_pending (u128): Pending credit amount',
      '- credits_posted (u128): Posted credit amount',
      '- userData128, userData64, userData32: User-defined metadata',
      '- ledger (u32): Ledger identifier',
      '- code (u16): User-defined code',
      '- flags (u16): Account flags',
      '- timestamp (u64): Creation timestamp',
      '',
      `Accounts present: ${hasAccounts ? 'yes' : 'no'}`,
      '',
      'Use TigerBeetle client API: lookup_accounts, query_accounts, get_account_balances.',
    ].join('\n'),
    hash: hashText('accounts', hasAccounts ? '1' : '0'),
  };

  const transferItem: SchemaItem = {
    tableId: 'tigerbeetle:transfers',
    enriched: [
      'TigerBeetle Record Type: transfers',
      'Purpose: Stores financial transfers between accounts (double-entry)',
      '',
      'Fields:',
      '- id (u128): Unique transfer identifier',
      '- debit_account_id (u128): Source account',
      '- credit_account_id (u128): Destination account',
      '- amount (u128): Transfer amount',
      '- pending_id (u128): Linked pending transfer id',
      '- userData128, userData64, userData32: User-defined metadata',
      '- timeout (u32): Pending timeout in seconds',
      '- ledger (u32): Ledger identifier',
      '- code (u16): User-defined code',
      '- flags (u16): Transfer flags',
      '- timestamp (u64): Creation timestamp',
      '',
      'Use TigerBeetle client API: lookup_transfers, get_account_transfers.',
    ].join('\n'),
    hash: hashText('transfers'),
  };

  return indexSchemaItems(connectionId, [accountItem, transferItem], provider, config, force);
}
