import type { ConnectionProfile, SqlAdapter, RedisAdapter } from '@kamehadb/shared';
import { createPostgresAdapter } from './postgres.js';
import { createSqliteAdapter } from './sqlite.js';
import { createMysqlAdapter } from './mysql.js';
import { createMongoAdapter } from './mongodb.js';
import { createRedisAdapter } from './redis.js';

export function createSqlAdapter(profile: ConnectionProfile, _password?: string): SqlAdapter | null {
  switch (profile.kind) {
    case 'postgres':
      return createPostgresAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
        ssl: profile.ssl,
      });
    case 'mysql':
      return createMysqlAdapter({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: profile.username,
        password: _password,
      });
    case 'sqlite':
      if (!profile.filePath) throw new Error('SQLite file path is required');
      return createSqliteAdapter(profile.filePath);
    default:
      return null;
  }
}

export function createMongoDbAdapter(profile: ConnectionProfile) {
  if (profile.kind !== 'mongodb') {
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
  if (profile.kind !== 'redis') {
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
