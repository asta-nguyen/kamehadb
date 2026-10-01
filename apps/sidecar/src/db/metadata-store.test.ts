import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
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
  getDb,
  initMetadataStore,
  listMcpManagedAccounts,
  listProfiles,
  loadMcpManagedCredential,
  rotateMcpToken,
  saveMcpManagedCredential,
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
  it('stores the opaque principal reference and lifecycle state', () => {
    initMetadataStore(freshDbPath());
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, database: 'app' });

    const record = createMcpManagedAccount(profile.id, 'opaque-account-reference');

    expect(record).toEqual({
      profileId: profile.id,
      accountRef: 'opaque-account-reference',
      state: MCP_MANAGED_ACCOUNT_STATE.PREPARED,
    });
    expect(listMcpManagedAccounts()).toEqual([record]);
    expect(clearMcpManagedAccount(profile.id)).toBe(true);
    expect(getMcpManagedAccount(profile.id)).toBeNull();
  });

  it('encrypts credentials in SQLite and restores them after reopening', () => {
    const dbPath = freshDbPath();
    initMetadataStore(dbPath);
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, database: 'app' });
    const credential = { kind: KIND.POSTGRES, username: 'kdbmcp_account', password: 'generated-secret' } as const;
    createMcpManagedAccount(profile.id, 'opaque-account-reference');
    saveMcpManagedCredential(profile.id, credential);

    const stored = getDb()
      .prepare('SELECT credential_ciphertext FROM mcp_managed_accounts WHERE profile_id = ?')
      .get(profile.id) as { credential_ciphertext: string };
    expect(stored.credential_ciphertext).not.toContain(credential.password);
    expect(readFileSync(`${dbPath}.mcp.key`)).toHaveLength(32);

    closeMetadataStore();
    initMetadataStore(dbPath);
    expect(loadMcpManagedCredential(profile.id)).toEqual(credential);
  });

  it('fails closed when ciphertext is altered or the local key is missing', () => {
    const dbPath = freshDbPath();
    initMetadataStore(dbPath);
    const profile = createProfile({ name: 'server', kind: KIND.POSTGRES, database: 'app' });
    createMcpManagedAccount(profile.id, 'opaque-account-reference');
    saveMcpManagedCredential(profile.id, { kind: KIND.POSTGRES, username: 'mcp', password: 'secret' });
    const original = getDb()
      .prepare('SELECT credential_ciphertext FROM mcp_managed_accounts WHERE profile_id = ?')
      .get(profile.id) as { credential_ciphertext: string };
    const finalCharacter = original.credential_ciphertext.at(-1);
    const altered = `${original.credential_ciphertext.slice(0, -1)}${finalCharacter === 'A' ? 'B' : 'A'}`;
    getDb()
      .prepare('UPDATE mcp_managed_accounts SET credential_ciphertext = ? WHERE profile_id = ?')
      .run(altered, profile.id);
    expect(() => loadMcpManagedCredential(profile.id)).toThrow('Stored MCP credential could not be decrypted');

    getDb()
      .prepare('UPDATE mcp_managed_accounts SET credential_ciphertext = ? WHERE profile_id = ?')
      .run(original.credential_ciphertext, profile.id);
    unlinkSync(`${dbPath}.mcp.key`);
    expect(() => loadMcpManagedCredential(profile.id)).toThrow('Stored MCP credential could not be decrypted');
    const second = createProfile({ name: 'second', kind: KIND.POSTGRES, database: 'app' });
    createMcpManagedAccount(second.id, 'second-reference');
    expect(() =>
      saveMcpManagedCredential(second.id, { kind: KIND.POSTGRES, username: 'mcp', password: 'secret' }),
    ).toThrow('Local MCP credential key is unavailable');
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
    createMcpManagedAccount(profile.id, 'opaque-account-reference');
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
