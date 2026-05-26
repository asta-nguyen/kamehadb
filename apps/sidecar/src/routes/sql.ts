import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createSqlAdapter, createMongoDbAdapter } from '../adapters/factory.js';

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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      const databases = await adapter.listDatabases();
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      const schemas = await adapter.listSchemas();
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      const schema = c.req.query('schema');
      const tables = await adapter.listTables(schema);
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      const columns = await adapter.getTableColumns(c.req.param('tableId'));
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      const indexes = await adapter.getTableIndexes(c.req.param('tableId'));
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      const schema = c.req.query('schema');
      const tables = await adapter.getCompletions(schema);
      return c.json({ tables });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'completions');
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      if (!('getTableStats' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Stats not available for this database type' }, 400);
      }
      const stats = await adapter.getTableStats!(c.req.param('tableId'));
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      if (!('getIndexStats' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Index stats not available for this database type' }, 400);
      }
      const stats = await adapter.getIndexStats!(c.req.param('tableId'));
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
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      if (!('getDatabaseSizes' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Size info not available for this database type' }, 400);
      }
      const schema = c.req.query('schema');
      const sizes = await adapter.getDatabaseSizes!(schema);
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
