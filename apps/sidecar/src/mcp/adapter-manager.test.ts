import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeMetadataStore,
  createMcpManagedAccount,
  createProfile,
  initMetadataStore,
  setMcpManagedAccountState,
  setProfileMcpEnabled,
} from '../db/metadata-store.js';
import { MCP_MANAGED_ACCOUNT_STATE } from '@kamehadb/shared';
import { McpAdapterManager } from './adapter-manager.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kamehadb-mcp-manager-'));
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

describe('McpAdapterManager concurrency', () => {
  it('rejects calls above the per-profile cap with a retryable BUSY error', async () => {
    const dir = tempDir();
    const filePath = join(dir, 'data.db');
    const seed = new Database(filePath);
    seed.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    seed.close();

    initMetadataStore(join(dir, 'kamehadb.db'));
    const profile = createProfile({ name: 'local', kind: 'sqlite', filePath });
    setProfileMcpEnabled(profile.id, true);

    const manager = new McpAdapterManager();
    const releases: (() => void)[] = [];
    const hold = () => new Promise<void>((resolve) => releases.push(resolve));

    try {
      const running = Array.from({ length: 4 }, () => manager.withConnection(profile.id, () => hold()));
      // Give the four in-flight calls time to register before the fifth arrives.
      await new Promise((resolve) => setTimeout(resolve, 50));

      await expect(manager.withConnection(profile.id, async () => 'ok')).rejects.toMatchObject({ code: 'BUSY' });

      for (const release of releases) release();
      await Promise.all(running);
    } finally {
      await manager.closeAll();
    }
  });

  it('rejects server profiles without a hydrated managed credential instead of using the profile password', async () => {
    const dir = tempDir();
    initMetadataStore(join(dir, 'kamehadb.db'));
    const profile = createProfile({
      name: 'server',
      kind: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'app',
      username: 'admin',
      password: 'admin-secret',
    });
    createMcpManagedAccount(profile.id, randomUUID());
    setMcpManagedAccountState(profile.id, MCP_MANAGED_ACCOUNT_STATE.READY);
    setProfileMcpEnabled(profile.id, true);

    const manager = new McpAdapterManager();
    await expect(manager.withConnection(profile.id, async () => 'query')).rejects.toMatchObject({
      code: 'MANAGED_CREDENTIAL_UNAVAILABLE',
    });
    expect(manager.canServe({ ...profile, mcpEnabled: true })).toBe(false);
    await manager.closeAll();
  });
});
