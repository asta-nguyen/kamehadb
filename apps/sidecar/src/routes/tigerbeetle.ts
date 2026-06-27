import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createTigerBeetleDbAdapter } from '../adapters/factory.js';
import { KIND } from '@kamehadb/shared';
import { handleError, getNonSqlAdapter, withAdapter } from '../lib/route-utils.js';

export const tigerbeetleRouter = new Hono();

async function getAdapter(connectionId: string) {
  return getNonSqlAdapter(connectionId, KIND.TIGERBEETLE, createTigerBeetleDbAdapter);
}

// GET /tigerbeetle/:connectionId/accounts
tigerbeetleRouter.get('/:connectionId/accounts', async (c) => {
  const connectionId = c.req.param('connectionId');
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 1000);
  try {
    const accounts = await withAdapter(getAdapter, connectionId, (adapter) => adapter.queryAccounts(limit));
    return c.json({ accounts });
  } catch (err) {
    return handleError(c, err, 'listAccounts');
  }
});

// GET /tigerbeetle/:connectionId/accounts/:id
tigerbeetleRouter.get('/:connectionId/accounts/:id', async (c) => {
  const connectionId = c.req.param('connectionId');
  const id = c.req.param('id');
  try {
    return await withAdapter(getAdapter, connectionId, async (adapter) => {
      const accounts = await adapter.lookupAccounts([id]);
      if (accounts.length === 0) return c.json({ error: 'NOT_FOUND', message: 'Account not found' }, 404);
      return c.json(accounts[0]);
    });
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
    const results = await withAdapter(getAdapter, connectionId, (adapter) => adapter.createAccounts(accounts));
    return c.json({ results });
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
    const transfers = await withAdapter(getAdapter, connectionId, (adapter) =>
      adapter.getAccountTransfers(accountId, limit),
    );
    return c.json({ transfers });
  } catch (err) {
    return handleError(c, err, 'getAccountTransfers');
  }
});

// GET /tigerbeetle/:connectionId/balances/:accountId
tigerbeetleRouter.get('/:connectionId/balances/:accountId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const accountId = c.req.param('accountId');
  try {
    const balances = await withAdapter(getAdapter, connectionId, (adapter) => adapter.getAccountBalances(accountId));
    return c.json({ balances });
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
    const results = await withAdapter(getAdapter, connectionId, (adapter) => adapter.createTransfers(transfers));
    return c.json({ results });
  } catch (err) {
    return handleError(c, err, 'createTransfers');
  }
});
