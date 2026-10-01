import { describe, expect, it } from 'vitest';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { DEFAULT_PORTS, KIND, type ConnectionProfile } from '@kamehadb/shared';
import {
  expectedMcpUsername,
  isMcpManagedCredentialForProfile,
  prepareMcpAccount,
  provisionMcpAccount,
  revokeMcpAccount,
} from './account-provisioner.js';
import { randomUUID } from 'node:crypto';
import { createMcpSqlAdapter } from './adapters/factory.js';

const ACCOUNT_REF = '25efed27-9d9f-4c0e-9e42-73d09862d768';
const MARIADB_DOCKER_HOST_PORT = 3307;

describe('MCP managed account preparation', () => {
  it('derives stable engine-compatible SQL usernames and random passwords', () => {
    const profile = {
      id: 'profile',
      name: 'Postgres',
      kind: KIND.POSTGRES,
      database: 'app',
      mcpEnabled: false,
      createdAt: '',
      updatedAt: '',
    } as const;
    const first = prepareMcpAccount(profile, ACCOUNT_REF);
    const second = prepareMcpAccount(profile, ACCOUNT_REF);
    expect(first.kind).toBe(KIND.POSTGRES);
    if (first.kind === KIND.MONGODB || second.kind === KIND.MONGODB) throw new Error('Expected SQL credentials');
    expect(first.username).toBe(expectedMcpUsername(KIND.POSTGRES, ACCOUNT_REF));
    expect(first.username).toBe(second.username);
    expect(first.username.length).toBeLessThanOrEqual(31);
    expect(first.password).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.password).not.toBe(second.password);
  });

  it('rebuilds Mongo credentials for the same endpoint and selected database', () => {
    const profile = {
      id: 'profile',
      name: 'MongoDB',
      kind: KIND.MONGODB,
      database: 'app',
      connectionString: 'mongodb://admin:old-secret@localhost:27017/app?authSource=admin&tls=true',
      mcpEnabled: false,
      createdAt: '',
      updatedAt: '',
    } as const;
    const credential = prepareMcpAccount(profile, ACCOUNT_REF);
    expect(credential.kind).toBe(KIND.MONGODB);
    if (credential.kind !== KIND.MONGODB) throw new Error('Expected MongoDB credentials');
    const parsed = new URL(credential.connectionString);
    expect(parsed.host).toBe('localhost:27017');
    expect(parsed.username).toBe(expectedMcpUsername(KIND.MONGODB, ACCOUNT_REF));
    expect(parsed.searchParams.get('authSource')).toBe('app');
    expect(parsed.searchParams.get('tls')).toBe('true');
    expect(credential.connectionString).not.toContain('old-secret');
    expect(isMcpManagedCredentialForProfile(profile, ACCOUNT_REF, credential)).toBe(true);
  });

  it('preserves MongoDB multi-host authorities when preparing credentials', () => {
    const profile = {
      id: 'profile',
      name: 'MongoDB cluster',
      kind: KIND.MONGODB,
      database: 'app',
      connectionString: 'mongodb://admin:old-secret@mongo-a:27017,mongo-b:27017/app?authSource=admin',
      mcpEnabled: false,
      createdAt: '',
      updatedAt: '',
    } as const;
    const credential = prepareMcpAccount(profile, ACCOUNT_REF);
    expect(credential.kind).toBe(KIND.MONGODB);
    if (credential.kind !== KIND.MONGODB) throw new Error('Expected MongoDB credentials');
    expect(credential.connectionString).toContain('@mongo-a:27017,mongo-b:27017/');
    expect(isMcpManagedCredentialForProfile(profile, ACCOUNT_REF, credential)).toBe(true);
  });

  it('rejects a MongoDB managed URI whose endpoint options were changed', () => {
    const profile = {
      id: 'profile',
      name: 'MongoDB',
      kind: KIND.MONGODB,
      database: 'app',
      connectionString: 'mongodb://admin:old-secret@localhost:27017/app?authSource=admin&tls=true',
      mcpEnabled: false,
      createdAt: '',
      updatedAt: '',
    } as const;
    const credential = prepareMcpAccount(profile, ACCOUNT_REF);
    if (credential.kind !== KIND.MONGODB) throw new Error('Expected MongoDB credentials');
    credential.connectionString = credential.connectionString.replace('tls=true', 'tls=false');
    expect(isMcpManagedCredentialForProfile(profile, ACCOUNT_REF, credential)).toBe(false);
  });

  it('rejects SQLite because its MCP worker already opens the file read-only', () => {
    expect(() =>
      prepareMcpAccount(
        {
          id: 'profile',
          name: 'SQLite',
          kind: KIND.SQLITE,
          filePath: '/tmp/app.db',
          mcpEnabled: true,
          createdAt: '',
          updatedAt: '',
        },
        ACCOUNT_REF,
      ),
    ).toThrow(/managed MCP account/i);
  });
});

const liveSqlCases = [
  { kind: KIND.POSTGRES, port: DEFAULT_PORTS[KIND.POSTGRES] },
  { kind: KIND.MYSQL, port: DEFAULT_PORTS[KIND.MYSQL] },
  { kind: KIND.MARIADB, port: MARIADB_DOCKER_HOST_PORT },
] as const;

describe.skipIf(process.env.KAMEHADB_RUN_MCP_LIVE_TESTS !== '1')('live MCP account grants', () => {
  it.each(liveSqlCases)('$kind provisions database-scoped reads and rejects table creation', async ({ kind, port }) => {
    const accountRef = randomUUID();
    const profile: ConnectionProfile = {
      id: `live-${kind}`,
      name: kind,
      kind,
      host: '127.0.0.1',
      port,
      database: 'kamehadb',
      username: kind === KIND.POSTGRES ? 'kameha' : 'root',
      mcpEnabled: false,
      createdAt: '',
      updatedAt: '',
    };
    const credential = prepareMcpAccount(profile, accountRef);
    if (credential.kind === KIND.MONGODB) throw new Error('Expected SQL credentials');
    let stateRecorded = false;
    try {
      await provisionMcpAccount(profile, 'kameha', accountRef, credential, () => {
        stateRecorded = true;
      });
      expect(stateRecorded).toBe(true);

      const adapter = createMcpSqlAdapter(profile, credential);
      if (!adapter) throw new Error('Managed SQL adapter not created');
      try {
        const result = await adapter.runQueryBounded({ query: 'SELECT 1 AS value', maxRows: 1 });
        expect(result.rows).toEqual([[1]]);
      } finally {
        await adapter.close();
      }

      const table = `mcp_probe_${accountRef.replaceAll('-', '')}`;
      let created = false;
      if (kind === KIND.POSTGRES) {
        const client = new pg.Client({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          user: credential.username,
          password: credential.password,
        });
        try {
          await client.connect();
          try {
            await client.query(`CREATE TABLE "${table}" (id integer)`);
            created = true;
          } catch {
            // The database must reject persistent DDL for the generated account.
          }
        } finally {
          if (created) await client.query(`DROP TABLE IF EXISTS "${table}"`).catch(() => undefined);
          await client.end().catch(() => undefined);
        }
      } else {
        const connection = await mysql.createConnection({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          user: credential.username,
          password: credential.password,
        });
        try {
          try {
            await connection.query(`CREATE TABLE \`${table}\` (id integer)`);
            created = true;
          } catch {
            // The database must reject persistent DDL for the generated account.
          }
        } finally {
          if (created) await connection.query(`DROP TABLE IF EXISTS \`${table}\``).catch(() => undefined);
          await connection.end();
        }
      }
      expect(created).toBe(false);
    } finally {
      await revokeMcpAccount(profile, 'kameha', accountRef);
    }
  });

  it('refuses the default unauthenticated MongoDB service before creating an account', async () => {
    const accountRef = randomUUID();
    const profile: ConnectionProfile = {
      id: 'live-mongodb',
      name: 'MongoDB',
      kind: KIND.MONGODB,
      database: 'admin',
      connectionString: 'mongodb://127.0.0.1:27017/admin',
      mcpEnabled: false,
      createdAt: '',
      updatedAt: '',
    };
    const credential = prepareMcpAccount(profile, accountRef);
    if (credential.kind !== KIND.MONGODB) throw new Error('Expected MongoDB credentials');
    let writeStarted = false;
    await expect(
      provisionMcpAccount(profile, undefined, accountRef, credential, () => {
        writeStarted = true;
      }),
    ).rejects.toThrow(/unauthenticated reads/i);
    expect(writeStarted).toBe(false);
  });
});
