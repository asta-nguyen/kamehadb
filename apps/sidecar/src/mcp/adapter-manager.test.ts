import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeMetadataStore, createProfile, initMetadataStore, setProfileMcpEnabled } from '../db/metadata-store.js';
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
});
