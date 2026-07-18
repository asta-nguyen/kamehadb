import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createQdrantDbAdapter } from '../adapters/factory.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import type { QdrantStats } from '@kamehadb/shared';
import { KIND } from '@kamehadb/shared';
import { handleError, getNonSqlAdapter, withAdapter } from '../lib/route-utils.js';

export const qdrantRouter = new Hono();

async function getAdapter(connectionId: number) {
  return getNonSqlAdapter(connectionId, KIND.QDRANT, createQdrantDbAdapter);
}

// GET /qdrant/:connectionId/test
qdrantRouter.get('/:connectionId/test', async (c) => {
  try {
    const result = await withAdapter(getAdapter, Number(c.req.param('connectionId')), (adapter) =>
      adapter.testConnection(),
    );
    return c.json(result);
  } catch (err) {
    return handleError(c, err, 'testConnection');
  }
});

// GET /qdrant/:connectionId/collections
qdrantRouter.get('/:connectionId/collections', async (c) => {
  try {
    const result = await withAdapter(getAdapter, Number(c.req.param('connectionId')), (adapter) =>
      adapter.listCollections(),
    );
    return c.json(result);
  } catch (err) {
    return handleError(c, err, 'listCollections');
  }
});

// POST /qdrant/:connectionId/points
qdrantRouter.post(
  '/:connectionId/points',
  zValidator(
    'json',
    z.object({
      collection: z.string().min(1),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.union([z.string(), z.number()]).nullable().optional(),
      filter: z.record(z.unknown()).optional(),
      withPayload: z.boolean().optional(),
      withVector: z.boolean().optional(),
    }),
  ),
  async (c) => {
    try {
      const result = await withAdapter(getAdapter, Number(c.req.param('connectionId')), (adapter) =>
        adapter.scrollPoints(c.req.valid('json')),
      );
      return c.json(result);
    } catch (err) {
      return handleError(c, err, 'scrollPoints');
    }
  },
);

// POST /qdrant/:connectionId/search
qdrantRouter.post(
  '/:connectionId/search',
  zValidator(
    'json',
    z.object({
      collection: z.string().min(1),
      vector: z.array(z.number()).min(1),
      limit: z.number().int().positive().max(500).optional(),
      filter: z.record(z.unknown()).optional(),
      withPayload: z.boolean().optional(),
      withVector: z.boolean().optional(),
    }),
  ),
  async (c) => {
    try {
      const result = await withAdapter(getAdapter, Number(c.req.param('connectionId')), (adapter) =>
        adapter.search(c.req.valid('json')),
      );
      return c.json(result);
    } catch (err) {
      return handleError(c, err, 'search');
    }
  },
);

// POST /qdrant/:connectionId/recommend
qdrantRouter.post(
  '/:connectionId/recommend',
  zValidator(
    'json',
    z.object({
      collection: z.string().min(1),
      pointId: z.union([z.string(), z.number()]),
      limit: z.number().int().positive().max(500).optional(),
      filter: z.record(z.unknown()).optional(),
      withPayload: z.boolean().optional(),
      withVector: z.boolean().optional(),
    }),
  ),
  async (c) => {
    try {
      const result = await withAdapter(getAdapter, Number(c.req.param('connectionId')), (adapter) =>
        adapter.recommend(c.req.valid('json')),
      );
      return c.json(result);
    } catch (err) {
      return handleError(c, err, 'recommend');
    }
  },
);

// GET /qdrant/:connectionId/stats?collection=
qdrantRouter.get('/:connectionId/stats', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  const collection = c.req.query('collection');
  if (!collection) {
    return c.json({ error: 'BAD_REQUEST', message: 'collection query param is required' }, 400);
  }

  const profile = metadataStore.getProfile(connectionId);
  const cacheKey = `qdrant:${connectionId}:${profile?.updatedAt ?? '0'}:${collection}:stats`;
  const cached = getCached<QdrantStats>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const result = await withAdapter(getAdapter, connectionId, (adapter) => adapter.getStats(collection));
    setCache(cacheKey, result);
    return c.json(result);
  } catch (err) {
    return handleError(c, err, 'getStats');
  }
});
