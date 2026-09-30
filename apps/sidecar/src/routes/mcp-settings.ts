import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UpdateMcpPortSchema } from '@kamehadb/shared';
import type { McpRuntime } from '../mcp/runtime.js';

// Management API for the MCP listener. Mounted on the internal sidecar listener
// under its global sidecar-token middleware, so it is never reachable from the
// public MCP listener.
export function createMcpSettingsRouter(runtime: McpRuntime): Hono {
  const router = new Hono();

  router.get('/settings', (c) => c.json(runtime.settingsResponse()));

  router.patch('/settings', zValidator('json', UpdateMcpPortSchema), async (c) => {
    const { port } = c.req.valid('json');
    await runtime.updatePort(port);
    return c.json(runtime.settingsResponse());
  });

  router.post('/settings/retry', async (c) => {
    await runtime.retry();
    return c.json(runtime.settingsResponse());
  });

  router.post('/settings/rotate-token', (c) => {
    runtime.rotateToken();
    return c.json(runtime.settingsResponse());
  });

  return router;
}
