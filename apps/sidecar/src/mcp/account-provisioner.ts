import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import mysql from 'mysql2/promise';
import sql from 'mssql';
import { MongoClient } from 'mongodb';
import { KIND, type ConnectionProfile, type McpManagedCredentialBundle } from '@kamehadb/shared';
import { MCP_QUERY_TIMEOUT_MS } from '../lib/constants.js';
import { log } from '../lib/logger.js';

const GENERATED_PASSWORD_BYTES = 32;
const SQL_USERNAME_HASH_LENGTH = 24;
const MYSQL_USERNAME_HASH_LENGTH = 25;
const MONGO_USERNAME_HASH_LENGTH = 24;
const MYSQL_ACCOUNT_HOST = '%';
const SQLSERVER_SYSTEM_DATABASE = 'master';
const POSTGRES_SYSTEM_SCHEMA_PREFIX = 'pg_';
const MONGO_UNAUTHORIZED_CODE = 13;
const MONGO_USER_NOT_FOUND_CODE = 11;
const MONGO_URI_PATTERN = /^(mongodb(?:\+srv)?:\/\/)([^/?#]*)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;

export class McpAccountOperationError extends Error {
  constructor(
    message: string,
    readonly cleanupFailed = false,
    readonly databaseCode?: string,
  ) {
    super(message);
    this.name = 'McpAccountOperationError';
  }
}

function requireDatabase(profile: ConnectionProfile): string {
  if (!profile.database) throw new McpAccountOperationError('Select a database before creating an MCP account');
  return profile.database;
}

function generatedUsername(kind: ConnectionProfile['kind'], accountRef: string): string {
  const digest = createHash('sha256').update(accountRef).digest('hex');
  const prefix = 'kdbmcp_';
  switch (kind) {
    case KIND.POSTGRES:
    case KIND.SQLSERVER:
      return prefix + digest.slice(0, SQL_USERNAME_HASH_LENGTH);
    case KIND.MYSQL:
    case KIND.MARIADB:
      return prefix + digest.slice(0, MYSQL_USERNAME_HASH_LENGTH);
    case KIND.MONGODB:
      return prefix + digest.slice(0, MONGO_USERNAME_HASH_LENGTH);
    default:
      throw new McpAccountOperationError('This database does not use a managed MCP account');
  }
}

export function expectedMcpUsername(kind: ConnectionProfile['kind'], accountRef: string): string {
  return generatedUsername(kind, accountRef);
}

function quotePgIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quotePgLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// Undo only the grants KamehaDB adds; DROP OWNED could delete user-owned objects
// and can remove the creator's ADMIN OPTION before DROP ROLE runs.
async function revokePostgresGrants(client: pg.Client, profile: ConnectionProfile, username: string): Promise<void> {
  const database = quotePgIdentifier(requireDatabase(profile));
  const role = quotePgIdentifier(username);
  await client.query(`REVOKE CONNECT ON DATABASE ${database} FROM ${role}`);
  const schemas = await client.query<{ nspname: string }>(
    `SELECT nspname FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname NOT LIKE $1`,
    [`${POSTGRES_SYSTEM_SCHEMA_PREFIX}%`],
  );
  for (const { nspname } of schemas.rows) {
    const schema = quotePgIdentifier(nspname);
    await client.query(`REVOKE USAGE ON SCHEMA ${schema} FROM ${role}`);
    await client.query(`REVOKE SELECT ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE SELECT ON TABLES FROM ${role}`);
  }
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const { code } = error;
  return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : undefined;
}

function quoteMysqlIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

function quoteMysqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteSqlServerIdentifier(value: string): string {
  return `[${value.replaceAll(']', ']]')}]`;
}

function quoteSqlServerLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

type ParsedMongoUri = {
  protocol: string;
  hosts: string;
  username: string;
  password: string;
  search: URLSearchParams;
};

// Preserve MongoDB multi-host authorities while separating userinfo from query options.
function parseMongoUri(uri: string): ParsedMongoUri {
  const match = MONGO_URI_PATTERN.exec(uri);
  if (!match) throw new McpAccountOperationError('MongoDB connection string could not be prepared safely');
  const authority = match[2] ?? '';
  const at = authority.lastIndexOf('@');
  const userInfo = at < 0 ? '' : authority.slice(0, at);
  const userSplit = userInfo.indexOf(':');
  let username = '';
  let password = '';
  try {
    username = userSplit < 0 ? decodeURIComponent(userInfo) : decodeURIComponent(userInfo.slice(0, userSplit));
    password = userSplit < 0 ? '' : decodeURIComponent(userInfo.slice(userSplit + 1));
  } catch {
    throw new McpAccountOperationError('MongoDB connection string could not be prepared safely');
  }
  return {
    protocol: match[1] ?? '',
    hosts: at < 0 ? authority : authority.slice(at + 1),
    username,
    password,
    search: new URLSearchParams((match[4] ?? '').replace(/^\?/, '')),
  };
}

function mongoUri(uri: string, username?: string, password?: string, authSource?: string): string {
  const match = MONGO_URI_PATTERN.exec(uri);
  if (!match) throw new McpAccountOperationError('MongoDB connection string could not be prepared safely');
  const parsed = parseMongoUri(uri);
  if (authSource) parsed.search.set('authSource', authSource);
  const userInfo =
    username === undefined ? '' : `${encodeURIComponent(username)}:${encodeURIComponent(password ?? '')}@`;
  const path = match[3] ?? '';
  const search = parsed.search.toString();
  return `${parsed.protocol}${userInfo}${parsed.hosts}${path}${search ? `?${search}` : ''}${match[5] ?? ''}`;
}

export function isMcpManagedCredentialForProfile(
  profile: ConnectionProfile,
  accountRef: string,
  credential: McpManagedCredentialBundle,
): boolean {
  if (credential.kind !== profile.kind) return false;
  if (credential.kind !== KIND.MONGODB) {
    return credential.username === generatedUsername(profile.kind, accountRef);
  }
  if (!profile.connectionString || !profile.database) return false;
  try {
    const actual = parseMongoUri(credential.connectionString);
    return (
      actual.username === generatedUsername(profile.kind, accountRef) &&
      actual.password.length > 0 &&
      mongoUri(profile.connectionString, actual.username, actual.password, profile.database) ===
        credential.connectionString
    );
  } catch {
    return false;
  }
}

export function prepareMcpAccount(profile: ConnectionProfile, accountRef: string): McpManagedCredentialBundle {
  if (profile.kind === KIND.MONGODB) {
    if (!profile.connectionString) throw new McpAccountOperationError('MongoDB connection string is required');
    const username = generatedUsername(profile.kind, accountRef);
    const password = randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url');
    return {
      kind: KIND.MONGODB,
      connectionString: mongoUri(profile.connectionString, username, password, requireDatabase(profile)),
    };
  }

  if (
    profile.kind === KIND.POSTGRES ||
    profile.kind === KIND.MYSQL ||
    profile.kind === KIND.MARIADB ||
    profile.kind === KIND.SQLSERVER
  ) {
    return {
      kind: profile.kind,
      username: generatedUsername(profile.kind, accountRef),
      password: randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url'),
    };
  }
  throw new McpAccountOperationError('This database does not use a managed MCP account');
}

function adminSqlProfile(
  profile: ConnectionProfile,
  password: string | undefined,
): {
  host: string;
  port: number | undefined;
  database: string;
  username: string;
  password: string;
} {
  const database = requireDatabase(profile);
  if (!profile.host || !profile.username || password === undefined) {
    throw new McpAccountOperationError('Saved database administrator credentials are incomplete');
  }
  return { host: profile.host, port: profile.port, database, username: profile.username, password };
}

function requireSqlCredential(
  profile: ConnectionProfile,
  credential: McpManagedCredentialBundle,
): Extract<McpManagedCredentialBundle, { username: string }> {
  if (credential.kind !== profile.kind || credential.kind === KIND.MONGODB) {
    throw new McpAccountOperationError('Generated account does not match the selected database');
  }
  return credential;
}

function mongoCredentialMatches(
  profile: ConnectionProfile,
  credential: McpManagedCredentialBundle,
): Extract<McpManagedCredentialBundle, { connectionString: string }> {
  if (profile.kind !== KIND.MONGODB || credential.kind !== KIND.MONGODB) {
    throw new McpAccountOperationError('Generated account does not match the selected database');
  }
  return credential;
}

async function verifyPostgresAccount(
  profile: ConnectionProfile,
  credential: Extract<McpManagedCredentialBundle, { username: string }>,
): Promise<void> {
  const config = adminSqlProfile(profile, credential.password);
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: credential.username,
    password: credential.password,
    ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: MCP_QUERY_TIMEOUT_MS,
  });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT current_user AS username,
        has_database_privilege(current_user, current_database(), 'CREATE') AS can_create
    `);
    const row = result.rows[0] as { username: string; can_create: boolean } | undefined;
    const schemaWrite = await client.query(`
      SELECT nspname FROM pg_namespace
      WHERE has_schema_privilege(current_user, oid, 'CREATE')
    `);
    if (
      row?.username !== credential.username ||
      row.can_create ||
      schemaWrite.rows.some((schema: { nspname: string }) => schema.nspname !== 'information_schema')
    ) {
      throw new McpAccountOperationError('PostgreSQL did not grant an effective read-only account');
    }
  } catch (error) {
    if (error instanceof McpAccountOperationError) throw error;
    throw new McpAccountOperationError('Generated PostgreSQL account could not be verified');
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function provisionPostgres(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  credential: Extract<McpManagedCredentialBundle, { username: string }>,
  beforeFirstWrite: () => void,
): Promise<void> {
  const config = adminSqlProfile(profile, adminPassword);
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: MCP_QUERY_TIMEOUT_MS,
  });
  let created = false;
  try {
    await client.connect();
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [credential.username]);
    if (existing.rowCount) throw new McpAccountOperationError('Generated PostgreSQL account name is already in use');
    beforeFirstWrite();
    created = true;
    await client.query(
      `CREATE ROLE ${quotePgIdentifier(credential.username)} LOGIN PASSWORD ${quotePgLiteral(credential.password)}`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${quotePgIdentifier(config.database)} TO ${quotePgIdentifier(credential.username)}`,
    );
    const schemas = await client.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname NOT LIKE $1`,
      [`${POSTGRES_SYSTEM_SCHEMA_PREFIX}%`],
    );
    for (const { nspname } of schemas.rows) {
      const schema = quotePgIdentifier(nspname);
      const role = quotePgIdentifier(credential.username);
      await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT ON TABLES TO ${role}`);
    }
    await verifyPostgresAccount(profile, credential);
  } catch {
    if (created) {
      try {
        const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [credential.username]);
        if (exists.rowCount) {
          await revokePostgresGrants(client, profile, credential.username);
          await client.query(`DROP ROLE ${quotePgIdentifier(credential.username)}`);
        }
      } catch {
        throw new McpAccountOperationError(
          'PostgreSQL setup failed and the partial account could not be removed',
          true,
        );
      }
    }
    throw new McpAccountOperationError('PostgreSQL could not create and verify the read-only account');
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function revokePostgres(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  username: string,
): Promise<void> {
  const config = adminSqlProfile(profile, adminPassword);
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: MCP_QUERY_TIMEOUT_MS,
  });
  try {
    await client.connect();
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [username]);
    if (exists.rowCount === 0) return;
    await revokePostgresGrants(client, profile, username);
    await client.query(`DROP ROLE ${quotePgIdentifier(username)}`);
  } catch (error) {
    throw new McpAccountOperationError(
      'PostgreSQL managed account could not be revoked',
      false,
      postgresErrorCode(error),
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function mysqlConfig(profile: ConnectionProfile, username: string, password: string, admin = false) {
  const database = requireDatabase(profile);
  if (!profile.host || (admin && !profile.username)) {
    throw new McpAccountOperationError('Saved database administrator credentials are incomplete');
  }
  return {
    host: profile.host,
    port: profile.port,
    database,
    user: admin ? profile.username! : username,
    password,
    connectTimeout: MCP_QUERY_TIMEOUT_MS,
  };
}

function mysqlAccount(username: string): string {
  return `${quoteMysqlLiteral(username)}@${quoteMysqlLiteral(MYSQL_ACCOUNT_HOST)}`;
}

async function verifyMysqlAccount(
  profile: ConnectionProfile,
  credential: Extract<McpManagedCredentialBundle, { username: string }>,
): Promise<void> {
  const connection = await mysql.createConnection(mysqlConfig(profile, credential.username, credential.password));
  try {
    const [rows] = await connection.query('SHOW GRANTS FOR CURRENT_USER');
    const grants = (rows as Record<string, unknown>[]).map((row) => String(Object.values(row)[0] ?? '').toUpperCase());
    const allowedDatabase = `ON ${quoteMysqlIdentifier(requireDatabase(profile))}.*`.toUpperCase();
    if (
      !grants.some((grant) => grant.includes('GRANT SELECT ') && grant.includes(allowedDatabase)) ||
      grants.some(
        (grant) => grant.includes('GRANT ') && !grant.includes('GRANT USAGE ') && !grant.includes('GRANT SELECT '),
      ) ||
      grants.some((grant) => grant.includes('GRANT SELECT ') && !grant.includes(allowedDatabase))
    ) {
      throw new McpAccountOperationError('MySQL did not grant an effective read-only account');
    }
  } catch (error) {
    if (error instanceof McpAccountOperationError) throw error;
    throw new McpAccountOperationError('Generated MySQL account could not be verified');
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function provisionMysql(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  credential: Extract<McpManagedCredentialBundle, { username: string }>,
  beforeFirstWrite: () => void,
): Promise<void> {
  const config = mysqlConfig(profile, credential.username, adminPassword ?? '', true);
  const connection = await mysql.createConnection(config);
  let created = false;
  try {
    const [existing] = await connection.query('SELECT 1 FROM mysql.user WHERE User = ? AND Host = ?', [
      credential.username,
      MYSQL_ACCOUNT_HOST,
    ]);
    if ((existing as unknown[]).length > 0) {
      throw new McpAccountOperationError('Generated MySQL account name is already in use');
    }
    beforeFirstWrite();
    created = true;
    await connection.query(
      `CREATE USER ${mysqlAccount(credential.username)} IDENTIFIED BY ${quoteMysqlLiteral(credential.password)}`,
    );
    await connection.query(
      `GRANT SELECT ON ${quoteMysqlIdentifier(config.database)}.* TO ${mysqlAccount(credential.username)}`,
    );
    await verifyMysqlAccount(profile, credential);
  } catch {
    if (created) {
      try {
        await connection.query(`DROP USER IF EXISTS ${mysqlAccount(credential.username)}`);
      } catch {
        throw new McpAccountOperationError('MySQL setup failed and the partial account could not be removed', true);
      }
    }
    throw new McpAccountOperationError('MySQL could not create and verify the read-only account');
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function revokeMysql(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  username: string,
): Promise<void> {
  const config = mysqlConfig(profile, username, adminPassword ?? '', true);
  const connection = await mysql.createConnection(config);
  try {
    await connection.query(`DROP USER IF EXISTS ${mysqlAccount(username)}`);
  } catch {
    throw new McpAccountOperationError('MySQL managed account could not be revoked');
  } finally {
    await connection.end().catch(() => undefined);
  }
}

function sqlServerConfig(profile: ConnectionProfile, password: string | undefined, database: string): sql.config {
  if (!profile.host || !profile.username || password === undefined) {
    throw new McpAccountOperationError('Saved database administrator credentials are incomplete');
  }
  return {
    server: profile.host,
    port: profile.port,
    database,
    user: profile.username,
    password,
    options: { encrypt: false, trustServerCertificate: true, connectTimeout: MCP_QUERY_TIMEOUT_MS },
    connectionTimeout: MCP_QUERY_TIMEOUT_MS,
    requestTimeout: MCP_QUERY_TIMEOUT_MS,
  };
}

async function verifySqlServerAccount(
  profile: ConnectionProfile,
  credential: Extract<McpManagedCredentialBundle, { username: string }>,
): Promise<void> {
  const pool = new sql.ConnectionPool(sqlServerConfig(profile, credential.password, requireDatabase(profile)));
  try {
    await pool.connect();
    const result = await pool.request().query(`
      SELECT SUSER_SNAME() AS username,
        IS_ROLEMEMBER('db_datareader') AS is_reader,
        IS_ROLEMEMBER('db_datawriter') AS is_writer,
        IS_ROLEMEMBER('db_owner') AS is_owner,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter_database,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete
    `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    const hasWritePermission = [
      'is_writer',
      'is_owner',
      'can_create_table',
      'can_alter_database',
      'can_insert',
      'can_update',
      'can_delete',
    ].some((key) => row?.[key] === true || row?.[key] === 1);
    if (
      row?.username !== credential.username ||
      !(row.is_reader === true || row.is_reader === 1) ||
      hasWritePermission
    ) {
      throw new McpAccountOperationError('SQL Server did not grant an effective read-only account');
    }
  } catch (error) {
    if (error instanceof McpAccountOperationError) throw error;
    throw new McpAccountOperationError('Generated SQL Server account could not be verified');
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function provisionSqlServer(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  credential: Extract<McpManagedCredentialBundle, { username: string }>,
  beforeFirstWrite: () => void,
): Promise<void> {
  const database = requireDatabase(profile);
  const masterPool = new sql.ConnectionPool(sqlServerConfig(profile, adminPassword, SQLSERVER_SYSTEM_DATABASE));
  let createdLogin = false;
  let createdUser = false;
  try {
    await masterPool.connect();
    const existing = await masterPool
      .request()
      .input('username', sql.NVarChar, credential.username)
      .query('SELECT 1 FROM sys.server_principals WHERE name = @username');
    if (existing.recordset.length > 0) {
      throw new McpAccountOperationError('Generated SQL Server account name is already in use');
    }
    beforeFirstWrite();
    createdLogin = true;
    await masterPool
      .request()
      .query(
        `CREATE LOGIN ${quoteSqlServerIdentifier(credential.username)} WITH PASSWORD = ${quoteSqlServerLiteral(credential.password)}, CHECK_POLICY = ON`,
      );
    const dbPool = new sql.ConnectionPool(sqlServerConfig(profile, adminPassword, database));
    try {
      await dbPool.connect();
      await dbPool
        .request()
        .query(
          `CREATE USER ${quoteSqlServerIdentifier(credential.username)} FOR LOGIN ${quoteSqlServerIdentifier(credential.username)}`,
        );
      createdUser = true;
      await dbPool
        .request()
        .query(`ALTER ROLE [db_datareader] ADD MEMBER ${quoteSqlServerIdentifier(credential.username)}`);
      await verifySqlServerAccount(profile, credential);
    } finally {
      await dbPool.close().catch(() => undefined);
    }
  } catch {
    if (createdLogin) {
      try {
        if (createdUser) {
          const dbPool = new sql.ConnectionPool(sqlServerConfig(profile, adminPassword, database));
          try {
            await dbPool.connect();
            await dbPool.request().query(`DROP USER IF EXISTS ${quoteSqlServerIdentifier(credential.username)}`);
          } finally {
            await dbPool.close().catch(() => undefined);
          }
        }
        await masterPool.request().query(`DROP LOGIN IF EXISTS ${quoteSqlServerIdentifier(credential.username)}`);
      } catch {
        throw new McpAccountOperationError(
          'SQL Server setup failed and the partial account could not be removed',
          true,
        );
      }
    }
    throw new McpAccountOperationError('SQL Server could not create and verify the read-only account');
  } finally {
    await masterPool.close().catch(() => undefined);
  }
}

async function revokeSqlServer(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  username: string,
): Promise<void> {
  const database = requireDatabase(profile);
  const dbPool = new sql.ConnectionPool(sqlServerConfig(profile, adminPassword, database));
  try {
    await dbPool.connect();
    await dbPool.request().query(`DROP USER IF EXISTS ${quoteSqlServerIdentifier(username)}`);
  } catch {
    throw new McpAccountOperationError('SQL Server managed account could not be revoked');
  } finally {
    await dbPool.close().catch(() => undefined);
  }
  const masterPool = new sql.ConnectionPool(sqlServerConfig(profile, adminPassword, SQLSERVER_SYSTEM_DATABASE));
  try {
    await masterPool.connect();
    await masterPool.request().query(`DROP LOGIN IF EXISTS ${quoteSqlServerIdentifier(username)}`);
  } catch {
    throw new McpAccountOperationError('SQL Server managed account could not be revoked');
  } finally {
    await masterPool.close().catch(() => undefined);
  }
}

function mongoErrorCode(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'code' in error ? Number((error as { code: unknown }).code) : undefined;
}

async function assertMongoAuthEnabled(profile: ConnectionProfile): Promise<void> {
  if (!profile.connectionString) throw new McpAccountOperationError('MongoDB connection string is required');
  const database = requireDatabase(profile);
  const client = new MongoClient(mongoUri(profile.connectionString));
  try {
    await client.connect();
    await client.db(database).command({ listCollections: 1 });
    throw new McpAccountOperationError('MongoDB permits unauthenticated reads; enable access control first');
  } catch (error) {
    if (error instanceof McpAccountOperationError) throw error;
    if (mongoErrorCode(error) !== MONGO_UNAUTHORIZED_CODE) {
      throw new McpAccountOperationError('MongoDB access-control probe was inconclusive; account setup was stopped');
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function verifyMongoAccount(
  profile: ConnectionProfile,
  credential: Extract<McpManagedCredentialBundle, { connectionString: string }>,
): Promise<void> {
  const client = new MongoClient(credential.connectionString, { serverSelectionTimeoutMS: MCP_QUERY_TIMEOUT_MS });
  try {
    await client.connect();
    const db = client.db(requireDatabase(profile));
    const status = await db.admin().command({ connectionStatus: 1, showPrivileges: true });
    const roles = status.authInfo?.authenticatedUserRoles as { role?: string; db?: string }[] | undefined;
    if (roles?.length !== 1 || roles[0]?.role !== 'read' || roles[0]?.db !== profile.database) {
      throw new McpAccountOperationError('MongoDB did not grant the selected database read role');
    }
    await db.command({ listCollections: 1 });
  } catch (error) {
    if (error instanceof McpAccountOperationError) throw error;
    throw new McpAccountOperationError('Generated MongoDB account could not be verified');
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function provisionMongo(
  profile: ConnectionProfile,
  accountRef: string,
  credential: Extract<McpManagedCredentialBundle, { connectionString: string }>,
  beforeFirstWrite: () => void,
): Promise<void> {
  await assertMongoAuthEnabled(profile);
  const username = generatedUsername(profile.kind, accountRef);
  const generated = parseMongoUri(credential.connectionString);
  if (generated.username !== username) {
    throw new McpAccountOperationError('Generated MongoDB account does not match its saved account reference');
  }
  const adminUri = profile.connectionString;
  if (!adminUri) throw new McpAccountOperationError('MongoDB connection string is required');
  const client = new MongoClient(adminUri, { serverSelectionTimeoutMS: MCP_QUERY_TIMEOUT_MS });
  let created = false;
  try {
    await client.connect();
    const existing = await client.db(requireDatabase(profile)).command({ usersInfo: username });
    if (Array.isArray(existing.users) && existing.users.length > 0) {
      throw new McpAccountOperationError('Generated MongoDB account name is already in use');
    }
    beforeFirstWrite();
    created = true;
    await client.db(requireDatabase(profile)).command({
      createUser: username,
      pwd: generated.password,
      roles: [{ role: 'read', db: profile.database }],
    });
    await verifyMongoAccount(profile, credential);
  } catch {
    if (created) {
      try {
        await client.db(requireDatabase(profile)).command({ dropUser: username });
      } catch {
        throw new McpAccountOperationError('MongoDB setup failed and the partial account could not be removed', true);
      }
    }
    throw new McpAccountOperationError('MongoDB could not create and verify the read-only account');
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function revokeMongo(profile: ConnectionProfile, username: string): Promise<void> {
  if (!profile.connectionString) throw new McpAccountOperationError('MongoDB connection string is required');
  const client = new MongoClient(profile.connectionString, { serverSelectionTimeoutMS: MCP_QUERY_TIMEOUT_MS });
  try {
    await client.connect();
    await client.db(requireDatabase(profile)).command({ dropUser: username });
  } catch (error) {
    if (mongoErrorCode(error) !== MONGO_USER_NOT_FOUND_CODE) {
      throw new McpAccountOperationError('MongoDB managed account could not be revoked');
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function provisionMcpAccount(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  accountRef: string,
  credential: McpManagedCredentialBundle,
  beforeFirstWrite: () => void,
): Promise<void> {
  if (profile.kind === KIND.MONGODB) {
    await provisionMongo(profile, accountRef, mongoCredentialMatches(profile, credential), beforeFirstWrite);
    return;
  }
  const sqlCredential = requireSqlCredential(profile, credential);
  switch (profile.kind) {
    case KIND.POSTGRES:
      await provisionPostgres(profile, adminPassword, sqlCredential, beforeFirstWrite);
      return;
    case KIND.MYSQL:
    case KIND.MARIADB:
      await provisionMysql(profile, adminPassword, sqlCredential, beforeFirstWrite);
      return;
    case KIND.SQLSERVER:
      await provisionSqlServer(profile, adminPassword, sqlCredential, beforeFirstWrite);
      return;
    default:
      throw new McpAccountOperationError('This database does not use a managed MCP account');
  }
}

export async function revokeMcpAccount(
  profile: ConnectionProfile,
  adminPassword: string | undefined,
  accountRef: string,
): Promise<void> {
  const username = generatedUsername(profile.kind, accountRef);
  switch (profile.kind) {
    case KIND.POSTGRES:
      await revokePostgres(profile, adminPassword, username);
      return;
    case KIND.MYSQL:
    case KIND.MARIADB:
      await revokeMysql(profile, adminPassword, username);
      return;
    case KIND.SQLSERVER:
      await revokeSqlServer(profile, adminPassword, username);
      return;
    case KIND.MONGODB:
      await revokeMongo(profile, username);
      return;
    default:
      throw new McpAccountOperationError('This database does not use a managed MCP account');
  }
}
