import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getCached, setCache } from '../lib/cache.js';
import * as metadataStore from '../db/metadata-store.js';
import { createMongoDbAdapter } from '../adapters/factory.js';

export const mongoRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  console.error(`[Mongo] ${context}:`, err instanceof Error ? err.stack || err.message : err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred' }, 500);
}

async function getAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind !== 'mongodb') {
    throw new Error('This endpoint is for MongoDB connections only');
  }

  return createMongoDbAdapter(profile);
}

// GET /mongo/:connectionId/collections
mongoRouter.get('/:connectionId/collections', async (c) => {
  const connectionId = c.req.param('connectionId');
  const database = c.req.query('database') || '';
  const cacheKey = `mongo:${connectionId}:collections:${database}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
    try {
      const collections = await adapter.listCollections(database || undefined);
      setCache(cacheKey, collections);
      return c.json(collections);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listCollections');
  }
});

// GET /mongo/:connectionId/databases
mongoRouter.get('/:connectionId/databases', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `mongo:${connectionId}:databases`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
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

// POST /mongo/:connectionId/find
mongoRouter.post(
  '/:connectionId/find',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      filter: z.record(z.unknown()).optional(),
      projection: z.record(z.unknown()).optional(),
      sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
      skip: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      search: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.findDocuments(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'findDocuments');
    }
  },
);

// POST /mongo/:connectionId/aggregate
mongoRouter.post(
  '/:connectionId/aggregate',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      pipeline: z.array(z.record(z.unknown())),
      limit: z.number().int().min(1).max(1000).optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.aggregate(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'aggregate');
    }
  },
);

// POST /mongo/:connectionId/delete
mongoRouter.post(
  '/:connectionId/delete',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      filter: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
        message: 'filter must not be empty',
      }),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const { collection, database, filter } = c.req.valid('json');
        const result = await adapter.deleteDocument(database || '', collection, filter);
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'deleteDocument');
    }
  },
);

// POST /mongo/:connectionId/update
mongoRouter.post(
  '/:connectionId/update',
  zValidator(
    'json',
    z.object({
      collection: z.string(),
      database: z.string().optional(),
      filter: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
        message: 'filter must not be empty',
      }),
      update: z.record(z.unknown()),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const { collection, database, filter, update } = c.req.valid('json');
        const result = await adapter.updateDocument(database || '', collection, filter, update);
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'updateDocument');
    }
  },
);

// GET /mongo/:connectionId/stats
mongoRouter.get('/:connectionId/stats', async (c) => {
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const database = c.req.query('database');
      const collection = c.req.query('collection');
      if (!database || !collection) {
        return c.json({ error: 'MISSING_PARAMS', message: 'database and collection are required' }, 400);
      }
      const result = await adapter.getCollectionStats(database, collection);
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getCollectionStats');
  }
});

// POST /mongo/:connectionId/command
mongoRouter.post(
  '/:connectionId/command',
  zValidator(
    'json',
    z.object({
      database: z.string().optional(),
      command: z.record(z.unknown()),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const { database, command } = c.req.valid('json');
        const result = await adapter.runCommand(database || '', command);
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'runCommand');
    }
  },
);

// GET /mongo/:connectionId/test
mongoRouter.get('/:connectionId/test', async (c) => {
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const result = await adapter.testConnection();
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'testConnection');
  }
});
