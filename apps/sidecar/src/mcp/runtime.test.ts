import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { KIND, MCP_MANAGED_ACCOUNT_STATE } from '@kamehadb/shared';
import {
  closeMetadataStore,
  createMcpManagedAccount,
  createProfile,
  initMetadataStore,
  saveMcpManagedCredential,
  setMcpManagedAccountState,
  setProfileMcpEnabled,
} from '../db/metadata-store.js';
import { prepareMcpAccount } from './account-provisioner.js';
import { McpRuntime } from './runtime.js';

const tempDirs: string[] = [];
const runtimes: McpRuntime[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kamehadb-mcp-runtime-'));
  tempDirs.push(dir);
  return dir;
}

function seedSqlite(filePath: string): void {
  const db = new Database(filePath);
  db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)');
  db.exec("INSERT INTO items (id, label) VALUES (1, 'one'), (2, 'two'), (3, 'three')");
  db.close();
}

function setup(enableProfile = true): { runtime: McpRuntime; profileId: string; filePath: string } {
  const dir = tempDir();
  const filePath = join(dir, 'data.db');
  seedSqlite(filePath);
  initMetadataStore(join(dir, 'kamehadb.db'));
  const profile = createProfile({ name: 'local', kind: 'sqlite', filePath });
  if (enableProfile) setProfileMcpEnabled(profile.id, true);
  const runtime = new McpRuntime();
  runtimes.push(runtime);
  return { runtime, profileId: profile.id, filePath };
}

function connectClient(runtime: McpRuntime, token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(runtime.endpoint()), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'kamehadb-test', version: '1.0.0' });
  return client.connect(transport).then(() => client);
}

afterEach(async () => {
  while (runtimes.length > 0) {
    await runtimes.pop()!.close();
  }
  closeMetadataStore();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('MCP runtime auth and routing', () => {
  it('restores encrypted ready credentials after a sidecar restart but leaves legacy rows unavailable', () => {
    const dir = tempDir();
    const dbPath = join(dir, 'kamehadb.db');
    initMetadataStore(dbPath);
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, host: 'localhost', database: 'app' });
    const accountRef = randomUUID();
    createMcpManagedAccount(profile.id, accountRef);
    saveMcpManagedCredential(profile.id, prepareMcpAccount(profile, accountRef));
    setMcpManagedAccountState(profile.id, MCP_MANAGED_ACCOUNT_STATE.READY);
    setProfileMcpEnabled(profile.id, true);

    const legacy = createProfile({ name: 'legacy', kind: KIND.POSTGRES, host: 'localhost', database: 'app' });
    createMcpManagedAccount(legacy.id, randomUUID());
    setMcpManagedAccountState(legacy.id, MCP_MANAGED_ACCOUNT_STATE.READY);
    setProfileMcpEnabled(legacy.id, true);

    closeMetadataStore();
    initMetadataStore(dbPath);
    const runtime = new McpRuntime();
    runtimes.push(runtime);

    expect(runtime.adapterManager.canServe({ ...profile, mcpEnabled: true })).toBe(true);
    expect(runtime.adapterManager.canServe({ ...legacy, mcpEnabled: true })).toBe(false);
  });

  it('rejects missing tokens, unknown paths, and non-POST methods', async () => {
    const { runtime } = setup();
    await runtime.updatePort(0);

    const unauthorized = await fetch(runtime.endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(unauthorized.status).toBe(401);

    const notFound = await fetch(runtime.endpoint().replace('/mcp', '/nope'), { method: 'POST' });
    expect(notFound.status).toBe(404);

    const wrongMethod = await fetch(runtime.endpoint(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${runtime.getToken()}` },
    });
    expect(wrongMethod.status).toBe(405);
  });

  it('binds only loopback and lists exactly the read-only tools', async () => {
    const { runtime } = setup();
    await runtime.updatePort(0);
    expect(runtime.getStatus().status).toBe('listening');
    expect(runtime.endpoint()).toContain('127.0.0.1');

    const client = await connectClient(runtime, runtime.getToken());
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
        [
          'list_mcp_profiles',
          'mongo_aggregate',
          'mongo_find',
          'mongo_list_collections',
          'mongo_list_databases',
          'sql_describe_table',
          'sql_list_databases',
          'sql_list_schemas',
          'sql_list_tables',
          'sql_query',
        ].sort(),
      );
    } finally {
      await client.close();
    }
  });

  it('runs a bounded read-only query through a SQLite profile', async () => {
    const { runtime, profileId } = setup();
    await runtime.updatePort(0);

    const client = await connectClient(runtime, runtime.getToken());
    try {
      const result = await client.callTool({
        name: 'sql_query',
        arguments: { connection_id: profileId, sql: 'SELECT * FROM items ORDER BY id', max_rows: 2 },
      });
      const payload = JSON.parse((result.content as { type: string; text: string }[])[0].text) as {
        rows: unknown[][];
        truncated: boolean;
      };
      expect(payload.rows).toHaveLength(2);
      expect(payload.rows).toEqual([
        [1, 'one'],
        [2, 'two'],
      ]);
      expect(payload.truncated).toBe(true);

      const writeAttempt = await client.callTool({
        name: 'sql_query',
        arguments: { connection_id: profileId, sql: 'DELETE FROM items' },
      });
      expect(writeAttempt.isError).toBe(true);
      expect((writeAttempt.content as { text: string }[])[0].text).toContain('READ_ONLY_QUERY_REQUIRED');
    } finally {
      await client.close();
    }
  });

  it('denies a profile that is not enabled for MCP', async () => {
    const { runtime, profileId } = setup(false);
    await runtime.updatePort(0);

    const client = await connectClient(runtime, runtime.getToken());
    try {
      const result = await client.callTool({
        name: 'sql_list_tables',
        arguments: { connection_id: profileId },
      });
      expect(result.isError).toBe(true);
      expect((result.content as { text: string }[])[0].text).toContain('PROFILE_NOT_ENABLED');
    } finally {
      await client.close();
    }
  });
});

describe('MCP runtime token rotation and port handling', () => {
  it('rejects the previous token after rotation', async () => {
    const { runtime } = setup();
    await runtime.updatePort(0);
    const oldToken = runtime.getToken();

    const newToken = runtime.rotateToken();
    expect(newToken).not.toBe(oldToken);

    const rejected = await fetch(runtime.endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oldToken}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(rejected.status).toBe(401);
  });

  it('marks MCP unavailable on a port conflict and recovers with retry', async () => {
    const { runtime } = setup();
    const occupier: Server = createServer();
    await new Promise<void>((resolve) => occupier.listen(0, '127.0.0.1', resolve));
    const address = occupier.address();
    if (!address || typeof address !== 'object') throw new Error('no port');
    const occupiedPort = address.port;

    await runtime.updatePort(occupiedPort);
    expect(runtime.getStatus().status).toBe('unavailable');
    expect(runtime.getStatus().message).toContain(`port ${occupiedPort} is in use`);

    await new Promise<void>((resolve) => occupier.close(() => resolve()));
    await runtime.retry();
    expect(runtime.getStatus().status).toBe('listening');
  });
});
