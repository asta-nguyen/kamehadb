import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MCP_DEFAULT_PORT } from '../lib/constants.js';
import {
  closeMetadataStore,
  createProfile,
  getMcpSettings,
  initMetadataStore,
  listProfiles,
  rotateMcpToken,
  setProfileMcpEnabled,
  updateMcpPort,
} from './metadata-store.js';

const tempDirs: string[] = [];

function freshDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kamehadb-mcp-test-'));
  tempDirs.push(dir);
  return join(dir, 'kamehadb.db');
}

afterEach(() => {
  closeMetadataStore();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('MCP settings persistence', () => {
  it('seeds a default port and random token on first init', () => {
    initMetadataStore(freshDbPath());

    const settings = getMcpSettings();
    expect(settings.port).toBe(MCP_DEFAULT_PORT);
    expect(settings.token.length).toBeGreaterThanOrEqual(32);
  });

  it('persists a new port and rotated token across reopen', () => {
    const dbPath = freshDbPath();
    initMetadataStore(dbPath);
    const before = getMcpSettings();

    updateMcpPort(54321);
    const rotated = rotateMcpToken();
    expect(rotated).not.toBe(before.token);

    closeMetadataStore();
    initMetadataStore(dbPath);

    const after = getMcpSettings();
    expect(after.port).toBe(54321);
    expect(after.token).toBe(rotated);
  });
});

describe('profile MCP allowlist', () => {
  it('defaults new profiles to disabled and toggles them on', () => {
    initMetadataStore(freshDbPath());
    const profile = createProfile({ name: 'local', kind: 'sqlite', filePath: '/tmp/data.db' });
    expect(profile.mcpEnabled).toBe(false);

    const updated = setProfileMcpEnabled(profile.id, true);
    expect(updated?.mcpEnabled).toBe(true);
    expect(listProfiles().find((item) => item.id === profile.id)?.mcpEnabled).toBe(true);
  });

  it('returns null when toggling an unknown profile', () => {
    initMetadataStore(freshDbPath());
    expect(setProfileMcpEnabled('does-not-exist', true)).toBeNull();
  });
});

describe('migration from a pre-MCP metadata database', () => {
  it('adds mcp_enabled, keeps a legacy row disabled, and rebuilds legacy kind checks', () => {
    const dbPath = freshDbPath();
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE connection_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('postgres','sqlite','mysql')),
        host TEXT,
        port INTEGER,
        database TEXT,
        username TEXT,
        password TEXT,
        ssl INTEGER DEFAULT 0,
        file_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO connection_profiles (id, name, kind, database, created_at, updated_at)
      VALUES ('legacy-1', 'Legacy', 'postgres', 'kamehadb', datetime('now'), datetime('now'));
    `);
    legacy.close();

    initMetadataStore(dbPath);

    const columns = getColumns(dbPath, 'connection_profiles');
    expect(columns).toContain('mcp_enabled');

    const profiles = listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].mcpEnabled).toBe(false);
  });
});

function getColumns(dbPath: string, table: string): string[] {
  const raw = new Database(dbPath, { readonly: true });
  try {
    return (raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name);
  } finally {
    raw.close();
  }
}
