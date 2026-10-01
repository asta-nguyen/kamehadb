import { KIND, type ConnectionProfile } from '@kamehadb/shared';
import { MCP_QUERY_TIMEOUT_MS } from '../../lib/constants.js';
import { createPostgresAdapter } from '../../adapters/postgres.js';
import { createMysqlAdapter } from '../../adapters/mysql.js';
import { createSqlServerAdapter } from '../../adapters/sqlserver.js';
import { createMongoAdapter } from '../../adapters/mongodb.js';
import { createSqliteMcpAdapter } from './sqlite.js';
import { MCP_ERROR_CODE, McpToolError } from '../errors.js';
import type { McpMongoAdapter, McpSqlAdapter } from '../types.js';
import type { McpManagedCredential } from '../types.js';

// Account grants are scoped to the saved database, so metadata calls cannot select another one.
function assertDatabaseScope(database: string | undefined, configuredDatabase: string | undefined): void {
  if (!configuredDatabase || (database && database !== configuredDatabase)) {
    throw new McpToolError(MCP_ERROR_CODE.INVALID_ARGUMENTS, 'MCP access is limited to the configured database');
  }
}

function assertSqliteTarget(database?: string, schema?: string): void {
  if ((database && database !== 'main') || (schema && schema !== 'main')) {
    throw new McpToolError(MCP_ERROR_CODE.INVALID_ARGUMENTS, 'SQLite MCP metadata is limited to the main database');
  }
}

// MySQL and MariaDB use "schema" as a synonym for database.
function mysqlTargetDatabase(database?: string, schema?: string): string | undefined {
  if (database && schema && database !== schema) {
    throw new McpToolError(
      MCP_ERROR_CODE.INVALID_ARGUMENTS,
      'MySQL and MariaDB use the same name for database and schema',
    );
  }
  return database ?? schema;
}

// Build a dedicated, MCP-owned SQL adapter for a supported engine. Never routes
// through createSqlAdapter so the UI adapter cache and its writable connections
// are never reused. Returns null for engines MCP does not support.
export function createMcpSqlAdapter(
  profile: ConnectionProfile,
  credential?: McpManagedCredential,
): McpSqlAdapter | null {
  switch (profile.kind) {
    case KIND.POSTGRES: {
      if (!profile.database || !credential || credential.kind !== KIND.POSTGRES) return null;
      const connection = {
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: credential.username,
        password: credential.password,
        ssl: profile.ssl,
      };
      const adapter = createPostgresAdapter(connection, { timeoutMs: MCP_QUERY_TIMEOUT_MS });
      return {
        listDatabases: async () => [{ name: profile.database! }],
        listSchemas: async (database) => {
          assertDatabaseScope(database, profile.database);
          return adapter.listSchemas();
        },
        listTables: async (database, schema) => {
          assertDatabaseScope(database, profile.database);
          return adapter.listTables(schema);
        },
        getTableColumns: async (table, database, schema) => {
          assertDatabaseScope(database, profile.database);
          return adapter.getTableColumns(schema ? schema + '.' + table : table);
        },
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    case KIND.MYSQL:
    case KIND.MARIADB: {
      if (!profile.database || !credential || credential.kind !== profile.kind) return null;
      const connection = {
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: credential.username,
        password: credential.password,
      };
      const options = {
        timeoutMs: MCP_QUERY_TIMEOUT_MS,
        kind: profile.kind === KIND.MARIADB ? 'mariadb' : 'mysql',
      } as const;
      const adapter = createMysqlAdapter(connection, options);
      return {
        listDatabases: async () => [{ name: profile.database! }],
        listSchemas: async (database) => {
          assertDatabaseScope(database, profile.database);
          const schemas = await adapter.listSchemas();
          return schemas.filter((schema) => schema.name === profile.database);
        },
        listTables: async (database, schema) => {
          assertDatabaseScope(mysqlTargetDatabase(database, schema), profile.database);
          return adapter.listTables();
        },
        getTableColumns: async (table, database, schema) => {
          assertDatabaseScope(mysqlTargetDatabase(database, schema), profile.database);
          return adapter.getTableColumns(table);
        },
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    case KIND.SQLSERVER: {
      if (!profile.database || !credential || credential.kind !== KIND.SQLSERVER) return null;
      const connection = {
        host: profile.host,
        port: profile.port,
        database: profile.database,
        username: credential.username,
        password: credential.password,
      };
      const adapter = createSqlServerAdapter(connection, { timeoutMs: MCP_QUERY_TIMEOUT_MS });
      return {
        listDatabases: async () => [{ name: profile.database! }],
        listSchemas: async (database) => {
          assertDatabaseScope(database, profile.database);
          return adapter.listSchemas();
        },
        listTables: async (database, schema) => {
          assertDatabaseScope(database, profile.database);
          return adapter.listTables(schema);
        },
        getTableColumns: async (table, database, schema) => {
          assertDatabaseScope(database, profile.database);
          return adapter.getTableColumns(schema ? schema + '.' + table : table);
        },
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    case KIND.SQLITE: {
      if (!profile.filePath) return null;
      const adapter = createSqliteMcpAdapter(profile.filePath, MCP_QUERY_TIMEOUT_MS);
      return {
        listDatabases: () => adapter.listDatabases(),
        listSchemas: async (database) => {
          assertSqliteTarget(database);
          return adapter.listSchemas();
        },
        listTables: async (database, schema) => {
          assertSqliteTarget(database, schema);
          return adapter.listTables();
        },
        getTableColumns: async (table, database, schema) => {
          assertSqliteTarget(database, schema);
          return adapter.getTableColumns(table);
        },
        runQueryBounded: (input) => adapter.runQueryBounded(input),
        close: () => adapter.close(),
      };
    }
    default:
      return null;
  }
}

// Build the narrow read-only Mongo surface for MCP. Writing methods on the
// underlying adapter are intentionally not forwarded.
export function createMcpMongoAdapter(
  profile: ConnectionProfile,
  credential?: McpManagedCredential,
): McpMongoAdapter | null {
  if (profile.kind !== KIND.MONGODB || !profile.database || !credential || credential.kind !== KIND.MONGODB)
    return null;
  const adapter = createMongoAdapter({
    connectionString: credential.connectionString,
    database: profile.database,
  });
  return {
    listDatabases: async () => [{ name: profile.database! }],
    listCollections: (database) => {
      assertDatabaseScope(database, profile.database);
      return adapter.listCollections(database);
    },
    findBounded: (input) => {
      assertDatabaseScope(input.database, profile.database);
      return adapter.findBounded(input);
    },
    aggregateBounded: (input) => {
      assertDatabaseScope(input.database, profile.database);
      return adapter.aggregateBounded(input);
    },
    close: () => adapter.close(),
  };
}
