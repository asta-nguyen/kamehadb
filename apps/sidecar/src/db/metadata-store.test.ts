import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KIND, MCP_MANAGED_ACCOUNT_STATE } from '@kamehadb/shared';
import { MCP_DEFAULT_PORT } from '../lib/constants.js';
import {
  clearMcpManagedAccount,
  closeMetadataStore,
  createMcpManagedAccount,
  createProfile,
  getMcpManagedAccount,
  getMcpSettings,
  initMetadataStore,
  listMcpManagedAccounts,
  listProfiles,
  rotateMcpToken,
  setMcpManagedAccountState,
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

describe('managed MCP account persistence', () => {
  it('stores only the Keychain reference and lifecycle state', () => {
    initMetadataStore(freshDbPath());
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, database: 'app' });

    const record = createMcpManagedAccount(profile.id, 'opaque-keychain-reference');

    expect(record).toEqual({
      profileId: profile.id,
      keychainRef: 'opaque-keychain-reference',
      state: MCP_MANAGED_ACCOUNT_STATE.PREPARED,
    });
    expect(listMcpManagedAccounts()).toEqual([record]);
    expect(clearMcpManagedAccount(profile.id)).toBe(true);
    expect(getMcpManagedAccount(profile.id)).toBeNull();
  });

  it('disables legacy server MCP profiles without managed credentials and preserves SQLite', () => {
    const dbPath = freshDbPath();
    initMetadataStore(dbPath);
    const postgres = createProfile({ name: 'server', kind: KIND.POSTGRES, database: 'app' });
    const sqlite = createProfile({ name: 'file', kind: KIND.SQLITE, filePath: '/tmp/app.db' });
    setProfileMcpEnabled(postgres.id, true);
    setProfileMcpEnabled(sqlite.id, true);

    closeMetadataStore();
    initMetadataStore(dbPath);

    const profiles = listProfiles();
    expect(profiles.find((profile) => profile.id === postgres.id)?.mcpEnabled).toBe(false);
    expect(profiles.find((profile) => profile.id === sqlite.id)?.mcpEnabled).toBe(true);
  });

  it('recovers interrupted provisioning and disables the profile after reopen', () => {
    const dbPath = freshDbPath();
    initMetadataStore(dbPath);
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, database: 'app' });
    createMcpManagedAccount(profile.id, 'opaque-keychain-reference');
    setMcpManagedAccountState(profile.id, MCP_MANAGED_ACCOUNT_STATE.PROVISIONING);
    setProfileMcpEnabled(profile.id, true);

    closeMetadataStore();
    initMetadataStore(dbPath);

    expect(getMcpManagedAccount(profile.id)?.state).toBe(MCP_MANAGED_ACCOUNT_STATE.RECOVERY_REQUIRED);
    expect(listProfiles().find((item) => item.id === profile.id)?.mcpEnabled).toBe(false);
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
