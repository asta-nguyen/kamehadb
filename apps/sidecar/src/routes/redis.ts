import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createRedisDbAdapter } from '../adapters/factory.js';

export const redisRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  console.error(`[Redis] ${context}:`, err instanceof Error ? err.stack || err.message : err);
  const statusCode = err && typeof err === 'object' && 'statusCode' in err ? (err as any).statusCode : 500;
  const message = err instanceof Error ? err.message : 'An internal error occurred';
  return c.json({ error: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message }, statusCode);
}

async function getAdapter(connectionId: string, password?: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw Object.assign(new Error('Connection not found'), { statusCode: 404 });

  if (profile.kind !== 'redis') {
    throw Object.assign(new Error('This endpoint is for Redis connections only'), { statusCode: 400 });
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

// POST /redis/:connectionId/key
redisRouter.post(
  '/:connectionId/key',
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

// POST /redis/:connectionId/ttl
redisRouter.post(
  '/:connectionId/ttl',
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

// POST /redis/:connectionId/command
redisRouter.post(
  '/:connectionId/command',
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
  try {
    const adapter = await getAdapter(c.req.param('connectionId'));
    try {
      const result = await adapter.getStats();
      return c.json(result);
    } finally {
      await adapter.close().catch(() => {});
    }
  } catch (err) {
    return handleError(c, err, 'getStats');
  }
});
