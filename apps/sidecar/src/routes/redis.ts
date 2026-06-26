import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createRedisDbAdapter } from '../adapters/factory.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import type { RedisStats } from '@kamehadb/shared';
import { KIND } from '@kamehadb/shared';
import { handleError, httpError } from '../lib/route-utils.js';

export const redisRouter = new Hono();

async function getAdapter(connectionId: string, password?: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw httpError('Connection not found', 404);

  if (profile.kind !== KIND.REDIS) {
    throw httpError('This endpoint is for Redis connections only', 400);
  }

  return createRedisDbAdapter(profile, password);
}

// GET /redis/:connectionId/test
redisRouter.get('/:connectionId/test', async (c) => {
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

// POST /redis/:connectionId/keys
redisRouter.post(
  '/:connectionId/keys',
  zValidator(
    'json',
    z.object({
      pattern: z.string().optional(),
      count: z.number().int().positive().max(1000).optional(),
      cursor: z.number().int().nonnegative().optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.scanKeys(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close().catch(() => {});
      }
    } catch (err) {
      return handleError(c, err, 'scanKeys');
    }
  },
);

// POST /redis/:connectionId/keys/value
redisRouter.post(
  '/:connectionId/keys/value',
  zValidator(
    'json',
    z.object({
      key: z.string(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.getKey(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close().catch(() => {});
      }
    } catch (err) {
      return handleError(c, err, 'getKey');
    }
  },
);

// POST /redis/:connectionId/keys/ttl
redisRouter.post(
  '/:connectionId/keys/ttl',
  zValidator(
    'json',
    z.object({
      key: z.string(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const ttl = await adapter.getTtl(c.req.valid('json'));
        return c.json({ ttl });
      } finally {
        await adapter.close().catch(() => {});
      }
    } catch (err) {
      return handleError(c, err, 'getTtl');
    }
  },
);

// POST /redis/:connectionId/commands
redisRouter.post(
  '/:connectionId/commands',
  zValidator(
    'json',
    z.object({
      command: z
        .string()
        .min(1)
        .refine((s) => s.trim().length > 0, { message: 'command cannot be empty or whitespace' }),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.runCommand(c.req.valid('json').command);
        return c.json(result);
      } finally {
        await adapter.close().catch(() => {});
      }
    } catch (err) {
      return handleError(c, err, 'runCommand');
    }
  },
);

// GET /redis/:connectionId/stats
redisRouter.get('/:connectionId/stats', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `redis:${connectionId}:stats`;
  const cached = getCached<RedisStats>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getAdapter(connectionId);
    try {
      const result = await adapter.getStats();
      setCache(cacheKey, result);
      return c.json(result);
    } finally {
      await adapter.close().catch(() => {});
    }
  } catch (err) {
    return handleError(c, err, 'getStats');
  }
});
