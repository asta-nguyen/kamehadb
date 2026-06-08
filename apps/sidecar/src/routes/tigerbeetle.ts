import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as metadataStore from '../db/metadata-store.js';
import { createTigerBeetleDbAdapter } from '../adapters/factory.js';

export const tigerbeetleRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  console.error(`[TigerBeetle] ${context}:`, err instanceof Error ? err.stack || err.message : err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred' }, 500);
}

async function getAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');
  if (profile.kind !== 'tigerbeetle') {
    throw new Error('This endpoint is for TigerBeetle connections only');
  }
  return createTigerBeetleDbAdapter(profile);
}

// GET /tigerbeetle/:connectionId/accounts
tigerbeetleRouter.get('/:connectionId/accounts', async (c) => {
  const connectionId = c.req.param('connectionId');
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 1000);
  try {
    const adapter = await getAdapter(connectionId);
    try {
      const accounts = await adapter.queryAccounts(limit);
      return c.json({ accounts });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listAccounts');
  }
});

// GET /tigerbeetle/:connectionId/accounts/:id
tigerbeetleRouter.get('/:connectionId/accounts/:id', async (c) => {
  const connectionId = c.req.param('connectionId');
  const id = c.req.param('id');
  try {
    const adapter = await getAdapter(connectionId);
    try {
      const accounts = await adapter.lookupAccounts([id]);
      if (accounts.length === 0) return c.json({ error: 'NOT_FOUND', message: 'Account not found' }, 404);
      return c.json(accounts[0]);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'lookupAccount');
  }
});

// POST /tigerbeetle/:connectionId/accounts
const CreateAccountsSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string(),
      ledger: z.number().int().positive(),
      code: z.number().int().positive(),
      flags: z.number().int().optional(),
      userData128: z.string().optional(),
      userData64: z.string().optional(),
      userData32: z.number().int().optional(),
      reserved: z.number().int().optional(),
    }),
  ),
});

tigerbeetleRouter.post('/:connectionId/accounts', zValidator('json', CreateAccountsSchema), async (c) => {
  const connectionId = c.req.param('connectionId');
  const { accounts } = c.req.valid('json');
  try {
    const adapter = await getAdapter(connectionId);
    try {
      const results = await adapter.createAccounts(accounts);
      return c.json({ results });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'createAccounts');
  }
});

// GET /tigerbeetle/:connectionId/transfers/:accountId
tigerbeetleRouter.get('/:connectionId/transfers/:accountId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const accountId = c.req.param('accountId');
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 1000);
  try {
    const adapter = await getAdapter(connectionId);
    try {
      const transfers = await adapter.getAccountTransfers(accountId, limit);
      return c.json({ transfers });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getAccountTransfers');
  }
});

// GET /tigerbeetle/:connectionId/balances/:accountId
tigerbeetleRouter.get('/:connectionId/balances/:accountId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const accountId = c.req.param('accountId');
  try {
    const adapter = await getAdapter(connectionId);
    try {
      const balances = await adapter.getAccountBalances(accountId);
      return c.json({ balances });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getAccountBalances');
  }
});

// POST /tigerbeetle/:connectionId/transfers
const CreateTransfersSchema = z.object({
  transfers: z.array(
    z.object({
      id: z.string(),
      debitAccountId: z.string(),
      creditAccountId: z.string(),
      amount: z.string(),
      ledger: z.number().int().positive(),
      code: z.number().int().positive(),
      flags: z.number().int().optional(),
      pendingId: z.string().optional(),
      userData128: z.string().optional(),
      userData64: z.string().optional(),
      userData32: z.number().int().optional(),
      timeout: z.number().int().optional(),
    }),
  ),
});

tigerbeetleRouter.post('/:connectionId/transfers', zValidator('json', CreateTransfersSchema), async (c) => {
  const connectionId = c.req.param('connectionId');
  const { transfers } = c.req.valid('json');
  try {
    const adapter = await getAdapter(connectionId);
    try {
      const results = await adapter.createTransfers(transfers);
      return c.json({ results });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'createTransfers');
  }
});
