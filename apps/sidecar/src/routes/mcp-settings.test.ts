import { Hono } from 'hono';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { KIND, MCP_MANAGED_ACCOUNT_STATE } from '@kamehadb/shared';
import {
  clearMcpManagedAccount,
  closeMetadataStore,
  createMcpManagedAccount,
  createProfile,
  getMcpManagedAccount,
  initMetadataStore,
  setProfileMcpEnabled,
} from '../db/metadata-store.js';
import type { McpRuntime } from '../mcp/runtime.js';
import { McpAdapterManager } from '../mcp/adapter-manager.js';
import { setMcpAdapterManager } from '../mcp/invalidation.js';
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
  const adapterManager = new McpAdapterManager();
  return {
    adapterManager,
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

  it('prepares generated credentials without returning the saved profile password', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const profile = createProfile({
      name: 'private postgres',
      kind: KIND.POSTGRES,
      host: '127.0.0.1',
      database: 'app',
      username: 'admin',
      password: 'admin-secret',
    });
    const app = new Hono();
    app.route('/mcp', createMcpSettingsRouter(stubRuntime()));

    const response = await app.request(`/mcp/profiles/${profile.id}/account/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keychainRef: randomUUID() }),
    });
    expect(response.status).toBe(201);
    const body = await response.text();
    expect(body).not.toContain('admin-secret');
    expect(body).toContain('kdbmcp_');
    expect(getMcpManagedAccount(profile.id)?.state).toBe(MCP_MANAGED_ACCOUNT_STATE.PREPARED);
  });

  it('discards a prepared account without touching the database', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const runtime = stubRuntime();
    const profile = createProfile({ name: 'private postgres', kind: KIND.POSTGRES, host: 'invalid', database: 'app' });
    createMcpManagedAccount(profile.id, randomUUID());
    const app = new Hono();
    app.route('/mcp', createMcpSettingsRouter(runtime));

    const response = await app.request(`/mcp/profiles/${profile.id}/account/revoke`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(getMcpManagedAccount(profile.id)).toBeNull();
    await runtime.adapterManager.closeAll();
  });

  it('waits for cached MCP adapters to close before clearing the managed account', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const runtime = stubRuntime();
    const profile = createProfile({ name: 'private postgres', kind: KIND.POSTGRES, host: 'invalid', database: 'app' });
    createMcpManagedAccount(profile.id, randomUUID());
    setProfileMcpEnabled(profile.id, true);
    let finishClose!: () => void;
    const closing = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    runtime.adapterManager.clearCredential = async () => closing;
    const app = new Hono();
    app.route('/mcp', createMcpSettingsRouter(runtime));

    const responsePromise = app.request(`/mcp/profiles/${profile.id}/account/revoke`, { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getMcpManagedAccount(profile.id)).not.toBeNull();
    finishClose();

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(getMcpManagedAccount(profile.id)).toBeNull();
    await runtime.adapterManager.closeAll();
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

    const redis = createProfile({ name: 'cache', kind: KIND.REDIS, host: '127.0.0.1' });
    const rejected = await app.request(`/connections/${redis.id}/mcp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(rejected.status).toBe(400);
  });

  it('does not return database credentials when toggling a MongoDB profile', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const profile = createProfile({
      name: 'private mongo',
      kind: KIND.MONGODB,
      connectionString: 'mongodb://mcp-user:top-secret@localhost:27017/private',
      password: 'top-secret',
    });

    const app = new Hono();
    app.route('/connections', connectionsRouter);
    const response = await app.request('/connections/' + profile.id + '/mcp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain('top-secret');
  });

  it('requires a ready account and hydrated credential before enabling a server profile', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const runtime = stubRuntime();
    setMcpAdapterManager(runtime.adapterManager);
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, host: 'localhost', database: 'app' });
    const app = new Hono();
    app.route('/connections', connectionsRouter);

    const response = await app.request(`/connections/${profile.id}/mcp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status).toBe(409);
    await runtime.adapterManager.closeAll();
  });

  it('blocks target, credential, and deletion changes until revoke', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const profile = createProfile({
      name: 'server',
      kind: KIND.POSTGRES,
      host: 'localhost',
      database: 'app',
      username: 'admin',
      password: 'secret',
    });
    createMcpManagedAccount(profile.id, randomUUID());
    const app = new Hono();
    app.route('/connections', connectionsRouter);

    for (const body of [{ database: 'other' }, { username: 'changed' }, { password: 'changed-secret' }]) {
      const response = await app.request(`/connections/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(409);
    }
    const deleted = await app.request(`/connections/${profile.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(409);
    clearMcpManagedAccount(profile.id);
  });
});
