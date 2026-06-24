import type { ConnectionProfile, SqlAdapter, RedisAdapter, QdrantAdapter } from '@kamehadb/shared';
import { KIND } from '@kamehadb/shared';
import { createPostgresAdapter } from './postgres.js';
import { createSqliteAdapter } from './sqlite.js';
import { createMysqlAdapter } from './mysql.js';
import { createMongoAdapter } from './mongodb.js';
import { createRedisAdapter } from './redis.js';
import { createQdrantAdapter } from './qdrant.js';
import { createSqlServerAdapter } from './sqlserver.js';
import { createOracleAdapter } from './oracle.js';
import { createClickHouseAdapter } from './clickhouse.js';
import { createDuckDbAdapter } from './duckdb.js';
import { createTigerBeetleAdapter } from './tigerbeetle.js';

export function createSqlAdapter(profile: ConnectionProfile, _password?: string): SqlAdapter | null {
  switch (profile.kind) {
    case KIND.POSTGRES:
      return createPostgresAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
        ssl: profile.ssl,
      });
    case KIND.MYSQL:
    case KIND.MARIADB:
      return createMysqlAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
      });
    case KIND.SQLITE:
      if (!profile.filePath) throw new Error('SQLite file path is required');
      return createSqliteAdapter(profile.filePath);
    case KIND.SQLSERVER:
      return createSqlServerAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
      });
    case KIND.ORACLE:
      return createOracleAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
      });
    case KIND.CLICKHOUSE:
      return createClickHouseAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
      });
    case KIND.DUCKDB:
      if (!profile.filePath) throw new Error('DuckDB file path is required');
      return createDuckDbAdapter(profile.filePath);
    default:
      return null;
  }
}

export function createMongoDbAdapter(profile: ConnectionProfile) {
  if (profile.kind !== KIND.MONGODB) {
    throw new Error(`Expected mongodb, got ${profile.kind}`);
  }
  if (!profile.connectionString) {
    throw new Error('MongoDB connection string is required');
  }
  return createMongoAdapter({
    connectionString: profile.connectionString,
    database: profile.database,
  });
}

export function createRedisDbAdapter(
  profile: { kind: string; host?: string; port?: number; database?: string },
  _password?: string,
): RedisAdapter {
  if (profile.kind !== KIND.REDIS) {
    throw new Error(`Expected redis, got ${profile.kind}`);
  }
  const parsedDb = profile.database ? parseInt(profile.database, 10) : undefined;
  const database = parsedDb !== undefined && Number.isInteger(parsedDb) && parsedDb >= 0 ? parsedDb : undefined;
  return createRedisAdapter({
    host: profile.host,
    port: profile.port,
    password: _password,
    database,
  });
}

export function createTigerBeetleDbAdapter(
  profile: { kind: string; host?: string; port?: number; database?: string },
  _password?: string,
) {
  if (profile.kind !== KIND.TIGERBEETLE) {
    throw new Error(`Expected tigerbeetle, got ${profile.kind}`);
  }
  return createTigerBeetleAdapter({
    host: profile.host,
    port: profile.port,
    clusterId: profile.database || '0',
  });
}

export function createQdrantDbAdapter(profile: { kind: string; host?: string; port?: number }): QdrantAdapter {
  if (profile.kind !== KIND.QDRANT) {
    throw new Error(`Expected qdrant, got ${profile.kind}`);
  }
  return createQdrantAdapter({
    host: profile.host,
    port: profile.port,
  });
}
