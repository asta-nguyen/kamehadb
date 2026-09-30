import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpMongoAdapter, createMcpSqlAdapter } from './adapters/factory.js';
import { createMongoAdapter } from '../adapters/mongodb.js';
import { createMysqlAdapter } from '../adapters/mysql.js';
import type { ConnectionProfile } from '@kamehadb/shared';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kamehadb-mcp-adapters-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

function seedSqlite(filePath: string, rows: number): void {
  const db = new Database(filePath);
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO users (id, name) VALUES (?, ?)');
  for (let i = 1; i <= rows; i++) insert.run(i, `user-${i}`);
  db.close();
}

describe('MCP SQLite bounded reader', () => {
  it('lists schema, describes a table, and bounds query rows with truncation', async () => {
    const dir = tempDir();
    const filePath = join(dir, 'data.db');
    seedSqlite(filePath, 5);

    const profile: ConnectionProfile = {
      id: 'sqlite-1',
      name: 'sqlite',
      kind: 'sqlite',
      filePath,
      mcpEnabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const adapter = createMcpSqlAdapter(profile);
    expect(adapter).not.toBeNull();
    if (!adapter) return;

    try {
      await expect(adapter.listTables()).resolves.toEqual([{ id: 'users', name: 'users' }]);

      const columns = await adapter.getTableColumns('users');
      expect(columns.map((column) => column.name)).toEqual(['id', 'name']);

      await expect(adapter.listTables('main')).resolves.toEqual([{ id: 'users', name: 'users' }]);
      await expect(adapter.listTables('other')).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
      await expect(adapter.getTableColumns('users', 'other')).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });

      const truncated = await adapter.runQueryBounded({ query: 'SELECT * FROM users ORDER BY id', maxRows: 2 });
      expect(truncated.rows).toHaveLength(2);
      expect(truncated.truncated).toBe(true);
      expect(truncated.columns.map((column) => column.name)).toEqual(['id', 'name']);
      expect(truncated.rows[0]).toEqual([1, 'user-1']);

      const duplicateColumns = await adapter.runQueryBounded({
        query: 'SELECT id AS duplicate, name AS duplicate FROM users ORDER BY id',
        maxRows: 1,
      });
      expect(duplicateColumns.columns.map((column) => column.name)).toEqual(['duplicate', 'duplicate']);
      expect(duplicateColumns.rows).toEqual([[1, 'user-1']]);
      expect(duplicateColumns.truncated).toBe(true);

      const complete = await adapter.runQueryBounded({ query: 'SELECT * FROM users ORDER BY id', maxRows: 10 });
      expect(complete.rows).toHaveLength(5);
      expect(complete.truncated).toBe(false);
    } finally {
      await adapter.close();
    }
  });

  it('cannot write because the worker opens the file read-only', async () => {
    const dir = tempDir();
    const filePath = join(dir, 'readonly.db');
    seedSqlite(filePath, 1);

    const profile: ConnectionProfile = {
      id: 'sqlite-2',
      name: 'sqlite',
      kind: 'sqlite',
      filePath,
      mcpEnabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const adapter = createMcpSqlAdapter(profile);
    if (!adapter) throw new Error('adapter not created');

    try {
      // RETURNING makes the statement a reader, so the failure comes from the
      // read-only file handle rather than from better-sqlite3's reader check.
      await expect(
        adapter.runQueryBounded({ query: "INSERT INTO users (id, name) VALUES (99, 'x') RETURNING id", maxRows: 10 }),
      ).rejects.toThrow(/readonly|read-only|attempt to write/i);
    } finally {
      await adapter.close();
    }
  });
});

describe('MCP MySQL timeout-hint rejection', () => {
  it('rejects a SET_VAR(max_execution_time=...) hint before connecting', async () => {
    const adapter = createMysqlAdapter({ database: 'd', username: 'u', password: 'p' });
    try {
      await expect(
        adapter.runQueryBounded({
          query: 'SELECT /*+ SET_VAR(max_execution_time=1) */ 1',
          maxRows: 10,
        }),
      ).rejects.toThrow(/SET_VAR/i);
    } finally {
      await adapter.close();
    }
  });
});

describe('MCP Mongo write-stage rejection', () => {
  it('rejects $out and $merge before connecting', async () => {
    const adapter = createMongoAdapter({ connectionString: 'mongodb://127.0.0.1:1/none' });
    try {
      await expect(
        adapter.aggregateBounded({ collection: 'c', pipeline: [{ $out: 'x' }], maxRows: 10 }),
      ).rejects.toThrow(/\$out/);
      await expect(
        adapter.aggregateBounded({ collection: 'c', pipeline: [{ $merge: 'x' }], maxRows: 10 }),
      ).rejects.toThrow(/\$merge/);
    } finally {
      await adapter.close();
    }
  });

  it('returns null from the MCP Mongo factory without a connection string', () => {
    expect(
      createMcpMongoAdapter({
        id: 'm',
        name: 'mongo',
        kind: 'mongodb',
        mcpEnabled: true,
        createdAt: '',
        updatedAt: '',
      }),
    ).toBeNull();
  });

  it('does not build server adapters without an explicit managed credential', async () => {
    const postgres: ConnectionProfile = {
      id: 'pg',
      name: 'postgres',
      kind: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'app',
      username: 'admin',
      mcpEnabled: true,
      createdAt: '',
      updatedAt: '',
    };
    expect(createMcpSqlAdapter(postgres)).toBeNull();
    const adapter = createMcpSqlAdapter(postgres, { kind: 'postgres', username: 'kdbmcp_test', password: 'secret' });
    expect(adapter).not.toBeNull();
    await adapter?.close();
  });

  it('lists and describes only the configured database', async () => {
    const profile: ConnectionProfile = {
      id: 'pg',
      name: 'postgres',
      kind: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'app',
      username: 'admin',
      mcpEnabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const adapter = createMcpSqlAdapter(profile, { kind: 'postgres', username: 'kdbmcp_test', password: 'secret' });
    if (!adapter) throw new Error('adapter not created');
    try {
      await expect(adapter.listDatabases()).resolves.toEqual([{ name: 'app' }]);
      await expect(adapter.listSchemas('other')).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    } finally {
      await adapter.close();
    }
  });
});
