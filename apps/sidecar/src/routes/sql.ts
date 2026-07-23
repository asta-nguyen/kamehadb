import { zValidator } from '@hono/zod-validator';
import { isQuerySafe, KIND, isPasswordRequired, type SqlAdapter } from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { createMongoDbAdapter, createSqlAdapter } from '../adapters/factory.js';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { createSqlSchemaRouter } from './sql-schema.js';
import { createSqlVectorPgRouter } from './sql-vector-pg.js';
import { createSqlVectorSqliteRouter } from './sql-vector-sqlite.js';
import { handleError } from '../lib/route-utils.js';
import { log } from '../lib/logger.js';

export const sqlRouter = new Hono();

// Module-level adapter cache to avoid creating + destroying connection pools per request
const adapterCache = new Map<number, SqlAdapter>();

/** Evict a cached adapter (e.g. when connection profile is updated). */
export function invalidateAdapterCache(connectionId: number): void {
  const adapter = adapterCache.get(connectionId);
  if (adapter) {
    adapterCache.delete(connectionId);
    adapter.close().catch(() => {});
  }
}

export async function getSqlAdapter(connectionId: number) {
  const cached = adapterCache.get(connectionId);
  if (cached) return cached;

  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind === KIND.MONGODB) {
    throw new Error('Use /mongo endpoint for MongoDB connections');
  }
  if (profile.kind === KIND.TIGERBEETLE) {
    throw new Error('TigerBeetle is not a SQL database');
  }

  const password = metadataStore.getProfilePassword(connectionId);
  if (!password && isPasswordRequired(profile.kind)) {
    throw new Error('Password not saved. Open connection settings and save with password.');
  }

  const adapter = createSqlAdapter(profile, password);
  if (!adapter) {
    log.warn({ connectionId, kind: profile.kind }, 'Unsupported connection kind for SQL adapter');
    const fallback = {
      testConnection: () => Promise.resolve({ success: false, message: `Unsupported for ${profile.kind}` }),
      listDatabases: () => Promise.resolve([]),
      listSchemas: () => Promise.resolve([]),
      listTables: () => Promise.resolve([]),
      getTableColumns: () => Promise.resolve([]),
      getTableIndexes: () => Promise.resolve([]),
      getCompletions: () => Promise.resolve([]),
      previewRows: () => Promise.reject(new Error('Not supported')),
      runQuery: () => Promise.reject(new Error('Not supported')),
      close: () => Promise.resolve(),
    };
    adapterCache.set(connectionId, fallback);
    return fallback;
  }
  adapterCache.set(connectionId, adapter);
  return adapter;
}

async function getMongoAdapter(connectionId: number) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind !== KIND.MONGODB) {
    throw new Error('Use /sql endpoint for non-MongoDB connections');
  }

  return createMongoDbAdapter(profile);
}

sqlRouter.route('/:connectionId', createSqlSchemaRouter({ getSqlAdapter, handleError }));
sqlRouter.route('/:connectionId', createSqlVectorPgRouter({ handleError }));
sqlRouter.route('/:connectionId', createSqlVectorSqliteRouter({ handleError }));

// Databases
sqlRouter.get('/:connectionId/databases', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const cacheKey = `sql:${connectionId}:databases`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    const databases = await adapter.listDatabases();
    setCache(cacheKey, databases);
    return c.json(databases);
  } catch (err) {
    return handleError(c, err, 'listDatabases');
  }
});

// Schemas
sqlRouter.get('/:connectionId/schemas', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const cacheKey = `sql:${connectionId}:schemas`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    const schemas = await adapter.listSchemas();
    setCache(cacheKey, schemas);
    return c.json(schemas);
  } catch (err) {
    return handleError(c, err, 'listSchemas');
  }
});

// Tables
sqlRouter.get('/:connectionId/tables', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:tables:${schema}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    const tables = await adapter.listTables(schema || undefined);
    setCache(cacheKey, tables);
    return c.json(tables);
  } catch (err) {
    return handleError(c, err, 'listTables');
  }
});

// Table columns
sqlRouter.get('/:connectionId/tables/:tableId/columns', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:columns:${tableId}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    const columns = await adapter.getTableColumns(tableId);
    setCache(cacheKey, columns);
    return c.json(columns);
  } catch (err) {
    return handleError(c, err, 'getTableColumns');
  }
});

// Table indexes
sqlRouter.get('/:connectionId/tables/:tableId/indexes', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:indexes:${tableId}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    const indexes = await adapter.getTableIndexes(tableId);
    setCache(cacheKey, indexes);
    return c.json(indexes);
  } catch (err) {
    return handleError(c, err, 'getTableIndexes');
  }
});

// Completions schema (all tables + columns for autocomplete)
sqlRouter.get('/:connectionId/autocomplete', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:completions:${schema}`;
  const cached = getCached<{ tables: unknown[] }>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    const tables = await adapter.getCompletions(schema || undefined);
    const result = { tables };
    setCache(cacheKey, result);
    return c.json(result);
  } catch (err) {
    return handleError(c, err, 'completions');
  }
});

// Schema search
sqlRouter.get('/:connectionId/schema/search', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const q = c.req.query('q');
  if (!q) return c.json([]);

  try {
    const adapter = await getSqlAdapter(connectionId);
    if (!('searchSchema' in adapter)) {
      return c.json({ error: 'NOT_SUPPORTED', message: 'Schema search not available for this database type' }, 400);
    }
    const schema = c.req.query('schema') || undefined;
    const rawLimit = c.req.query('limit');
    const parsed = rawLimit ? Number(rawLimit) : undefined;
    const limit =
      parsed !== undefined && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000 ? parsed : undefined;
    const results = await adapter.searchSchema!({ query: q, schema, limit });
    return c.json(results);
  } catch (err) {
    return handleError(c, err, 'searchSchema');
  }
});

// Preview rows
sqlRouter.post(
  '/:connectionId/rows',
  zValidator(
    'json',
    z.object({
      tableId: z.string(),
      schema: z.string().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
      search: z.string().optional(),
      sortColumn: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
      filters: z
        .array(
          z.object({
            column: z.string(),
            operator: z.string(),
            value: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getSqlAdapter(Number(c.req.param('connectionId')));
      const result = await adapter.previewRows(c.req.valid('json'));
      return c.json(result);
    } catch (err) {
      return handleError(c, err, 'previewRows');
    }
  },
);

// Run query
sqlRouter.post(
  '/:connectionId/query',
  zValidator(
    'json',
    z.object({
      query: z.string(),
      params: z.array(z.unknown()).optional(),
    }),
  ),
  async (c) => {
    try {
      const connectionId = Number(c.req.param('connectionId'));
      const profile = metadataStore.getProfile(connectionId);
      if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);

      const adapter = await getSqlAdapter(connectionId);
      const result = await adapter.runQuery(c.req.valid('json'));
      return c.json(result);
    } catch (err) {
      return handleError(c, err, 'runQuery');
    }
  },
);

// Table stats
sqlRouter.get('/:connectionId/tables/:tableId/stats', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:stats:${tableId}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    if (!('getTableStats' in adapter)) {
      return c.json({
        tableId,
        name: tableId.split('.').pop() || tableId,
        schema: tableId.includes('.') ? tableId.split('.')[0] : '',
        rowEstimate: 0,
        totalBytes: 0,
        indexesBytes: 0,
        toastBytes: 0,
        bloatBytes: 0,
        bloatPercent: 0,
        lastVacuum: null,
        lastAutovacuum: null,
        lastAnalyze: null,
        lastAutoanalyze: null,
        vacuumCount: 0,
        autovacuumCount: 0,
        nLiveTup: 0,
        nDeadTup: 0,
      });
    }
    const stats = await adapter.getTableStats!(tableId);
    setCache(cacheKey, stats);
    return c.json(stats);
  } catch (err) {
    return handleError(c, err, 'getTableStats');
  }
});

// Index stats
sqlRouter.get('/:connectionId/tables/:tableId/indexes/stats', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:index-stats:${tableId}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    if (!('getIndexStats' in adapter)) {
      return c.json([]);
    }
    const stats = await adapter.getIndexStats!(tableId);
    setCache(cacheKey, stats);
    return c.json(stats);
  } catch (err) {
    return handleError(c, err, 'getIndexStats');
  }
});

// Database sizes
sqlRouter.get('/:connectionId/database/sizes', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:sizes:${schema}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    if (!('getDatabaseSizes' in adapter)) {
      return c.json([]);
    }
    const sizes = await adapter.getDatabaseSizes!(schema || undefined);
    setCache(cacheKey, sizes);
    return c.json(sizes);
  } catch (err) {
    return handleError(c, err, 'getDatabaseSizes');
  }
});

// Active connections
sqlRouter.get('/:connectionId/sessions', async (c) => {
  try {
    const adapter = await getSqlAdapter(Number(c.req.param('connectionId')));
    if (!('getActiveConnections' in adapter)) {
      return c.json([]);
    }
    const connections = await adapter.getActiveConnections!();
    return c.json(connections);
  } catch (err) {
    return handleError(c, err, 'getActiveConnections');
  }
});
