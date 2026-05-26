import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createMongoDbAdapter } from '../adapters/factory.js';

export const mongoRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`[Mongo] ${context}:`, message);
  return c.json({ error: 'INTERNAL_ERROR', message }, 500);
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
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const database = c.req.query('database') || undefined;
      const collections = await adapter.listCollections(database);
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
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
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
      skip: z.number().optional(),
      limit: z.number().optional(),
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
      limit: z.number().optional(),
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
