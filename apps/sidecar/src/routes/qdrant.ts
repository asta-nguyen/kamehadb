import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createQdrantDbAdapter } from '../adapters/factory.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import type { QdrantStats } from '@kamehadb/shared';

export const qdrantRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  console.error(`[Qdrant] ${context}:`, err instanceof Error ? err.stack || err.message : err);
  const statusCode =
    err && typeof err === 'object' && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
  const message = err instanceof Error ? err.message : 'An internal error occurred';
  return c.json({ error: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message }, statusCode);
}

async function getAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw Object.assign(new Error('Connection not found'), { statusCode: 404 });

  if (profile.kind !== 'qdrant') {
    throw Object.assign(new Error('This endpoint is for Qdrant connections only'), { statusCode: 400 });
  }

  return createQdrantDbAdapter(profile);
}

// GET /qdrant/:connectionId/test
qdrantRouter.get('/:connectionId/test', async (c) => {
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const result = await adapter.testConnection();
      return c.json(result);
    } finally {
      await adapter.close().catch(() => {});
    }
  } catch (err) {
    return handleError(c, err, 'testConnection');
  }
});

// GET /qdrant/:connectionId/collections
qdrantRouter.get('/:connectionId/collections', async (c) => {
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const result = await adapter.listCollections();
      return c.json(result);
    } finally {
      await adapter.close().catch(() => {});
    }
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
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.scrollPoints(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close().catch(() => {});
      }
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
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.search(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close().catch(() => {});
      }
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
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.recommend(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close().catch(() => {});
      }
    } catch (err) {
      return handleError(c, err, 'recommend');
    }
  },
);

// GET /qdrant/:connectionId/stats?collection=
qdrantRouter.get('/:connectionId/stats', async (c) => {
  const connectionId = c.req.param('connectionId');
  const collection = c.req.query('collection');
  if (!collection) {
    return c.json({ error: 'BAD_REQUEST', message: 'collection query param is required' }, 400);
  }

  const profile = metadataStore.getProfile(connectionId);
  const cacheKey = `qdrant:${connectionId}:${profile?.updatedAt ?? '0'}:${collection}:stats`;
  const cached = getCached<QdrantStats>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
    try {
      const result = await adapter.getStats(collection);
      setCache(cacheKey, result);
      return c.json(result);
    } finally {
      await adapter.close().catch(() => {});
    }
  } catch (err) {
    return handleError(c, err, 'getStats');
  }
});
