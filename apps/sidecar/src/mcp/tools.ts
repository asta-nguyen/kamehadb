import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isMcpSupportedKind, isQuerySafe } from '@kamehadb/shared';
import { listProfiles } from '../db/metadata-store.js';
import {
  MCP_DEFAULT_ROW_LIMIT,
  MCP_MAX_METADATA_ITEMS,
  MCP_MAX_MONGO_SKIP,
  MCP_MAX_ROW_LIMIT,
} from '../lib/constants.js';
import type { McpAdapterManager, McpConnection } from './adapter-manager.js';
import { MCP_ERROR_CODE, McpToolError, formatToolError, toMcpToolError } from './errors.js';
import type { McpMongoAdapter, McpSqlAdapter } from './types.js';

// Cap a metadata list at the MCP limit and report whether more items existed.
function capItems<T>(items: T[]): { items: T[]; truncated: boolean } {
  if (items.length <= MCP_MAX_METADATA_ITEMS) return { items, truncated: false };
  return { items: items.slice(0, MCP_MAX_METADATA_ITEMS), truncated: true };
}

function requireSql(connection: McpConnection): McpSqlAdapter {
  if (connection.kind !== 'sql') {
    throw new McpToolError(MCP_ERROR_CODE.INVALID_ARGUMENTS, 'This tool requires a SQL connection');
  }
  return connection.adapter;
}

function requireMongo(connection: McpConnection): McpMongoAdapter {
  if (connection.kind !== 'mongo') {
    throw new McpToolError(MCP_ERROR_CODE.INVALID_ARGUMENTS, 'This tool requires a MongoDB connection');
  }
  return connection.adapter;
}

const jsonResult = (payload: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
});

const errorResult = (err: unknown) => ({
  content: [{ type: 'text' as const, text: formatToolError(toMcpToolError(err)) }],
  isError: true,
});

const connectionId = z.string().min(1);
const maxRows = z.number().int().min(1).max(MCP_MAX_ROW_LIMIT).optional();

// Register the read-only MCP tool set. Every database tool takes an explicit
// connection id; there is no server-wide selected connection.
export function registerMcpTools(server: McpServer, manager: McpAdapterManager): void {
  server.registerTool(
    'list_mcp_profiles',
    {
      title: 'List MCP connections',
      description: 'List connection profiles enabled for read-only MCP access. Never returns credentials.',
      inputSchema: {},
    },
    async () => {
      try {
        const profiles = listProfiles().filter((profile) => profile.mcpEnabled && isMcpSupportedKind(profile.kind));
        return jsonResult({
          profiles: profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
            kind: profile.kind,
            database: profile.database,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'sql_list_databases',
    {
      title: 'List databases',
      description: 'List databases on an MCP-enabled SQL connection.',
      inputSchema: { connection_id: connectionId },
    },
    async ({ connection_id }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const capped = capItems(await requireSql(connection).listDatabases());
          return { databases: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'sql_list_schemas',
    {
      title: 'List schemas',
      description: 'List schemas on an MCP-enabled SQL connection.',
      inputSchema: { connection_id: connectionId, database: z.string().optional() },
    },
    async ({ connection_id, database }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const capped = capItems(await requireSql(connection).listSchemas(database));
          return { schemas: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'sql_list_tables',
    {
      title: 'List tables',
      description: 'List tables on an MCP-enabled SQL connection.',
      inputSchema: { connection_id: connectionId, database: z.string().optional(), schema: z.string().optional() },
    },
    async ({ connection_id, database, schema }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const capped = capItems(await requireSql(connection).listTables(schema ?? database));
          return { tables: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'sql_describe_table',
    {
      title: 'Describe table',
      description: 'Return column names and types for a table on an MCP-enabled SQL connection.',
      inputSchema: {
        connection_id: connectionId,
        table: z.string().min(1),
        database: z.string().optional(),
        schema: z.string().optional(),
      },
    },
    async ({ connection_id, table, schema }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const tableId = schema ? `${schema}.${table}` : table;
          const capped = capItems(await requireSql(connection).getTableColumns(tableId));
          return { columns: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'sql_query',
    {
      title: 'Run read-only SQL',
      description: 'Run one read-only SQL statement and return a bounded result.',
      inputSchema: { connection_id: connectionId, sql: z.string().min(1), max_rows: maxRows },
    },
    async ({ connection_id, sql, max_rows }) => {
      try {
        const safety = isQuerySafe(sql);
        if (!safety.safe) {
          throw new McpToolError(
            MCP_ERROR_CODE.READ_ONLY_QUERY_REQUIRED,
            safety.reason ?? 'Only read-only SQL is allowed',
          );
        }
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const result = await requireSql(connection).runQueryBounded({
            query: sql,
            maxRows: max_rows ?? MCP_DEFAULT_ROW_LIMIT,
          });
          return {
            columns: result.columns,
            rows: result.rows,
            duration_ms: result.durationMs,
            truncated: result.truncated,
          };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'mongo_list_databases',
    {
      title: 'List MongoDB databases',
      description: 'List databases on an MCP-enabled MongoDB connection.',
      inputSchema: { connection_id: connectionId },
    },
    async ({ connection_id }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const capped = capItems(await requireMongo(connection).listDatabases());
          return { databases: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'mongo_list_collections',
    {
      title: 'List MongoDB collections',
      description: 'List collections in a MongoDB database.',
      inputSchema: { connection_id: connectionId, database: z.string().min(1) },
    },
    async ({ connection_id, database }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const capped = capItems(await requireMongo(connection).listCollections(database));
          return { collections: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'mongo_find',
    {
      title: 'Find MongoDB documents',
      description: 'Find documents with a bounded result set.',
      inputSchema: {
        connection_id: connectionId,
        database: z.string().min(1),
        collection: z.string().min(1),
        filter: z.record(z.unknown()).optional(),
        projection: z.record(z.unknown()).optional(),
        sort: z.record(z.unknown()).optional(),
        skip: z.number().int().min(0).max(MCP_MAX_MONGO_SKIP).optional(),
        limit: maxRows,
      },
    },
    async ({ connection_id, database, collection, filter, projection, sort, skip, limit }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const result = await requireMongo(connection).findBounded({
            database,
            collection,
            filter,
            projection,
            sort,
            skip: skip ?? 0,
            limit: limit ?? MCP_DEFAULT_ROW_LIMIT,
          });
          return { documents: result.documents, duration_ms: result.durationMs, truncated: result.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'mongo_aggregate',
    {
      title: 'Aggregate MongoDB documents',
      description: 'Run a read-only aggregation pipeline. Writing stages are rejected.',
      inputSchema: {
        connection_id: connectionId,
        database: z.string().min(1),
        collection: z.string().min(1),
        pipeline: z.array(z.record(z.unknown())),
        max_rows: maxRows,
      },
    },
    async ({ connection_id, database, collection, pipeline, max_rows }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          const result = await requireMongo(connection).aggregateBounded({
            database,
            collection,
            pipeline,
            maxRows: max_rows ?? MCP_DEFAULT_ROW_LIMIT,
          });
          return { documents: result.documents, duration_ms: result.durationMs, truncated: result.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
