import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SaveQueryHistorySchema, UpdateQueryHistorySchema } from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';

export const queryHistoryRouter = new Hono();

// Save a query execution
queryHistoryRouter.post('/:connectionId', zValidator('json', SaveQueryHistorySchema), async (c) => {
  const connectionId = c.req.param('connectionId');
  const input = c.req.valid('json');
  const entry = metadataStore.saveQueryHistory(connectionId, input);
  return c.json(entry, 201);
});

// List query history
queryHistoryRouter.get('/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const limit = Number(c.req.query('limit')) || 50;
  const favoritesOnly = c.req.query('favorites') === 'true';
  const entries = metadataStore.getQueryHistory(connectionId, limit, favoritesOnly);
  return c.json(entries);
});

// Update a query history entry (favorite toggle, rename)
queryHistoryRouter.patch('/:connectionId/:id', zValidator('json', UpdateQueryHistorySchema), async (c) => {
  const id = c.req.param('id');
  const input = c.req.valid('json');
  metadataStore.updateQueryHistory(id, input);
  return c.body(null, 204);
});

// Delete a query history entry
queryHistoryRouter.delete('/:connectionId/:id', async (c) => {
  const id = c.req.param('id');
  metadataStore.deleteQueryHistory(id);
  return c.body(null, 204);
});
