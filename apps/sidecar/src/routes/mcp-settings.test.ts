import { Hono } from 'hono';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeMetadataStore, createProfile, initMetadataStore } from '../db/metadata-store.js';
import type { McpRuntime } from '../mcp/runtime.js';
import { createMcpSettingsRouter } from './mcp-settings.js';
import { connectionsRouter } from './connections.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kamehadb-mcp-routes-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  closeMetadataStore();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

// Minimal runtime stub: the management routes only touch these four methods.
function stubRuntime(): McpRuntime {
  let port = 13979;
  let token = 'start-token';
  return {
    settingsResponse: () => ({
      status: 'listening' as const,
      port,
      endpoint: `http://127.0.0.1:${port}/mcp`,
      token,
      enabledProfiles: [],
    }),
    updatePort: async (next: number) => {
      port = next;
    },
    retry: async () => undefined,
    rotateToken: () => {
      token = `rotated-${token}`;
      return token;
    },
  } as unknown as McpRuntime;
}

describe('MCP settings management routes', () => {
  it('returns settings with a token and rejects an invalid port', async () => {
    const app = new Hono();
    app.route('/mcp', createMcpSettingsRouter(stubRuntime()));

    const settings = await app.request('/mcp/settings');
    expect(settings.status).toBe(200);
    const body = (await settings.json()) as Record<string, unknown>;
    expect(body.token).toBe('start-token');
    expect(body).not.toHaveProperty('password');

    const invalid = await app.request('/mcp/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: 70000 }),
    });
    expect(invalid.status).toBe(400);

    const valid = await app.request('/mcp/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: 14000 }),
    });
    expect(valid.status).toBe(200);
    expect(((await valid.json()) as { port: number }).port).toBe(14000);
  });

  it('rotates the token and activates the new one', async () => {
    const app = new Hono();
    app.route('/mcp', createMcpSettingsRouter(stubRuntime()));

    const rotated = await app.request('/mcp/settings/rotate-token', { method: 'POST' });
    expect(rotated.status).toBe(200);
    expect(((await rotated.json()) as { token: string }).token).toBe('rotated-start-token');
  });
});

describe('profile MCP toggle route', () => {
  it('enables a supported profile and rejects an unsupported kind', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));

    const app = new Hono();
    app.route('/connections', connectionsRouter);

    const sqlite = createProfile({ name: 'local', kind: 'sqlite', filePath: join(dir, 'local.db') });
    const enabled = await app.request(`/connections/${sqlite.id}/mcp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(enabled.status).toBe(200);
    expect(((await enabled.json()) as { mcpEnabled: boolean }).mcpEnabled).toBe(true);

    const redis = createProfile({ name: 'cache', kind: 'redis', host: '127.0.0.1', port: 6379 });
    const rejected = await app.request(`/connections/${redis.id}/mcp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(rejected.status).toBe(400);
  });
});
