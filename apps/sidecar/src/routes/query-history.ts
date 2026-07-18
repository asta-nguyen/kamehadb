import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SaveQueryHistorySchema, UpdateQueryHistorySchema } from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';

export const queryHistoryRouter = new Hono();

function isValidId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && Number.isSafeInteger(value);
}

// Save a query execution
queryHistoryRouter.post('/:connectionId', zValidator('json', SaveQueryHistorySchema), async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  if (!isValidId(connectionId)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid connection ID' }, 400);
  const input = c.req.valid('json');
  const entry = metadataStore.saveQueryHistory(connectionId, input);
  return c.json(entry, 201);
});

// List query history
queryHistoryRouter.get('/:connectionId', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  if (!isValidId(connectionId)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid connection ID' }, 400);
  const limit = Number(c.req.query('limit')) || 50;
  const favoritesOnly = c.req.query('favorites') === 'true';
  const entries = metadataStore.getQueryHistory(connectionId, limit, favoritesOnly);
  return c.json(entries);
});

// Update a query history entry (favorite toggle, rename)
queryHistoryRouter.patch('/:connectionId/:id', zValidator('json', UpdateQueryHistorySchema), async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  if (!isValidId(connectionId)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid connection ID' }, 400);
  const id = Number(c.req.param('id'));
  if (!isValidId(id)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid entry ID' }, 400);
  const input = c.req.valid('json');
  metadataStore.updateQueryHistory(id, input);
  return c.body(null, 204);
});

// Delete a query history entry
queryHistoryRouter.delete('/:connectionId/:id', async (c) => {
  const connectionId = Number(c.req.param('connectionId'));
  if (!isValidId(connectionId)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid connection ID' }, 400);
  const id = Number(c.req.param('id'));
  if (!isValidId(id)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid entry ID' }, 400);
  metadataStore.deleteQueryHistory(id);
  return c.body(null, 204);
});
