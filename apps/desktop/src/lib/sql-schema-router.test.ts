import { describe, expect, it } from 'vitest';
import { Hono } from '../../../sidecar/node_modules/hono';
import { createSqlSchemaRouter } from '../../../sidecar/src/routes/sql-schema.js';

describe('schema watcher start', () => {
  it('rejects a null JSON body as invalid JSON', async () => {
    const app = new Hono();
    app.route(
      '/:connectionId',
      createSqlSchemaRouter({
        getSqlAdapter: async () => {
          throw new Error('Adapter should not be loaded for an invalid request');
        },
        handleError: (context) => context.json({ error: 'INTERNAL_ERROR' }, 500),
      }),
    );

    const response = await app.request('/connection/schema/watcher/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'INVALID_JSON',
      message: 'Request body must be valid JSON',
    });
  });
});
