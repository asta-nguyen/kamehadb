import { zValidator } from '@hono/zod-validator';
import { isQuerySafe } from '@kamehadb/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createMongoDbAdapter, createSqlAdapter } from '../adapters/factory.js';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';

export const sqlRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`[SQL] ${context}:`, message);
  return c.json({ error: 'INTERNAL_ERROR', message }, 500);
}

async function getSqlAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind === 'mongodb') {
    throw new Error('Use /mongo endpoint for MongoDB connections');
  }

  const password = metadataStore.getProfilePassword(connectionId);
  if (!password && profile.kind === 'postgres') {
    throw new Error('Password not saved. Open connection settings and save with password.');
  }

  const adapter = createSqlAdapter(profile, password);
  if (!adapter) {
    console.warn(`[SQL] Unsupported connection kind for ${connectionId}: ${profile.kind}`);
    return {
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
  }
  return adapter;
}

async function getMongoAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind !== 'mongodb') {
    throw new Error('Use /sql endpoint for non-MongoDB connections');
  }

  return createMongoDbAdapter(profile);
}

// Databases
sqlRouter.get('/:connectionId/databases', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `sql:${connectionId}:databases`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const databases = await adapter.listDatabases();
      setCache(cacheKey, databases);
      return c.json(databases);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listDatabases');
  }
});

// Schemas
sqlRouter.get('/:connectionId/schemas', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `sql:${connectionId}:schemas`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const schemas = await adapter.listSchemas();
      setCache(cacheKey, schemas);
      return c.json(schemas);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listSchemas');
  }
});

// Tables
sqlRouter.get('/:connectionId/tables', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:tables:${schema}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const tables = await adapter.listTables(schema || undefined);
      setCache(cacheKey, tables);
      return c.json(tables);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listTables');
  }
});

// Table columns
sqlRouter.get('/:connectionId/tables/:tableId/columns', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:columns:${tableId}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const columns = await adapter.getTableColumns(tableId);
      setCache(cacheKey, columns);
      return c.json(columns);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getTableColumns');
  }
});

// Table indexes
sqlRouter.get('/:connectionId/tables/:tableId/indexes', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:indexes:${tableId}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const indexes = await adapter.getTableIndexes(tableId);
      setCache(cacheKey, indexes);
      return c.json(indexes);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getTableIndexes');
  }
});

// Completions schema (all tables + columns for autocomplete)
sqlRouter.get('/:connectionId/completions', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:completions:${schema}`;
  const cached = getCached<{ tables: unknown[] }>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const tables = await adapter.getCompletions(schema || undefined);
      const result = { tables };
      setCache(cacheKey, result);
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'completions');
  }
});

// Schema search
sqlRouter.get('/:connectionId/search-schema', async (c) => {
  const connectionId = c.req.param('connectionId');
  const q = c.req.query('q');
  if (!q) return c.json([]);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
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
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'searchSchema');
  }
});

// Preview rows
sqlRouter.post(
  '/:connectionId/preview',
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
      const adapter = await getSqlAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.previewRows(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
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
      const connectionId = c.req.param('connectionId');
      const profile = metadataStore.getProfile(connectionId);
      if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);

      if (profile.readonly !== false) {
        const { query } = c.req.valid('json');
        const safety = isQuerySafe(query);
        if (!safety.safe) {
          return c.json(
            { error: 'FORBIDDEN', message: safety.reason ?? 'Query is not allowed in read-only mode' },
            403,
          );
        }
      }

      const password = metadataStore.getProfilePassword(connectionId);
      const adapter = await getSqlAdapter(connectionId);
      try {
        const result = await adapter.runQuery(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'runQuery');
    }
  },
);

// Table stats
sqlRouter.get('/:connectionId/tables/:tableId/stats', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:stats:${tableId}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('getTableStats' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Stats not available for this database type' }, 400);
      }
      const stats = await adapter.getTableStats!(tableId);
      setCache(cacheKey, stats);
      return c.json(stats);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getTableStats');
  }
});

// Index stats
sqlRouter.get('/:connectionId/tables/:tableId/index-stats', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:index-stats:${tableId}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('getIndexStats' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Index stats not available for this database type' }, 400);
      }
      const stats = await adapter.getIndexStats!(tableId);
      setCache(cacheKey, stats);
      return c.json(stats);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getIndexStats');
  }
});

// Database sizes
sqlRouter.get('/:connectionId/sizes', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:sizes:${schema}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('getDatabaseSizes' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Size info not available for this database type' }, 400);
      }
      const sizes = await adapter.getDatabaseSizes!(schema || undefined);
      setCache(cacheKey, sizes);
      return c.json(sizes);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getDatabaseSizes');
  }
});

// Active connections
sqlRouter.get('/:connectionId/connections', async (c) => {
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      if (!('getActiveConnections' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Connection info not available for this database type' }, 400);
      }
      const connections = await adapter.getActiveConnections!();
      return c.json(connections);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getActiveConnections');
  }
});
