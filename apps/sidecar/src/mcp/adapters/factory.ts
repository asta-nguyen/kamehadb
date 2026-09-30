import { KIND, type ConnectionProfile } from '@kamehadb/shared';
import { MCP_QUERY_TIMEOUT_MS } from '../../lib/constants.js';
import { createPostgresAdapter } from '../../adapters/postgres.js';
import { createMysqlAdapter } from '../../adapters/mysql.js';
import { createSqlServerAdapter } from '../../adapters/sqlserver.js';
import { createMongoAdapter } from '../../adapters/mongodb.js';
import { createSqliteMcpAdapter } from './sqlite.js';
import type { McpMongoAdapter, McpSqlAdapter } from '../types.js';

// Build a dedicated, MCP-owned SQL adapter for a supported engine. Never routes
// through createSqlAdapter so the UI adapter cache and its writable connections
// are never reused. Returns null for engines MCP does not support.
export function createMcpSqlAdapter(profile: ConnectionProfile, password?: string): McpSqlAdapter | null {
  switch (profile.kind) {
    case KIND.POSTGRES: {
      const adapter = createPostgresAdapter(
        {
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password,
          ssl: profile.ssl,
        },
        { timeoutMs: MCP_QUERY_TIMEOUT_MS },
      );
      return {
        listDatabases: () => adapter.listDatabases(),
        listSchemas: (database) => adapter.listSchemas(database),
        listTables: (schema) => adapter.listTables(schema),
        getTableColumns: (tableId) => adapter.getTableColumns(tableId),
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    case KIND.MYSQL:
    case KIND.MARIADB: {
      const adapter = createMysqlAdapter(
        {
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password,
        },
        { timeoutMs: MCP_QUERY_TIMEOUT_MS, kind: profile.kind === KIND.MARIADB ? 'mariadb' : 'mysql' },
      );
      return {
        listDatabases: () => adapter.listDatabases(),
        listSchemas: (database) => adapter.listSchemas(database),
        listTables: (schema) => adapter.listTables(schema),
        getTableColumns: (tableId) => adapter.getTableColumns(tableId),
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    case KIND.SQLSERVER: {
      const adapter = createSqlServerAdapter(
        {
          host: profile.host,
          port: profile.port,
          database: profile.database,
          username: profile.username,
          password,
        },
        { timeoutMs: MCP_QUERY_TIMEOUT_MS },
      );
      return {
        listDatabases: () => adapter.listDatabases(),
        listSchemas: (database) => adapter.listSchemas(database),
        listTables: (schema) => adapter.listTables(schema),
        getTableColumns: (tableId) => adapter.getTableColumns(tableId),
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    case KIND.SQLITE: {
      if (!profile.filePath) return null;
      return createSqliteMcpAdapter(profile.filePath, MCP_QUERY_TIMEOUT_MS);
    }
    default:
      return null;
  }
}

// Build the narrow read-only Mongo surface for MCP. Writing methods on the
// underlying adapter are intentionally not forwarded.
export function createMcpMongoAdapter(profile: ConnectionProfile): McpMongoAdapter | null {
  if (profile.kind !== KIND.MONGODB || !profile.connectionString) return null;
  const adapter = createMongoAdapter({
    connectionString: profile.connectionString,
    database: profile.database,
  });
  return {
    listDatabases: () => adapter.listDatabases(),
    listCollections: (database) => adapter.listCollections(database),
    findBounded: (input) => adapter.findBounded(input),
    aggregateBounded: (input) => adapter.aggregateBounded(input),
    close: () => adapter.close(),
  };
}
