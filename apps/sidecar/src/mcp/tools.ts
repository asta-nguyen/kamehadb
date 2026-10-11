import { z } from 'zod';
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShapeOutput, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { isMcpSupportedKind, isQuerySafe } from '@kamehadb/shared';
import { listProfiles, recordMcpCallHistory } from '../db/metadata-store.js';
import { log } from '../lib/logger.js';
import {
  MCP_DEFAULT_ROW_LIMIT,
  MCP_MAX_METADATA_ITEMS,
  MCP_MAX_MONGO_SKIP,
  MCP_MAX_ROW_LIMIT,
} from '../lib/constants.js';
import type { McpAdapterManager, McpConnection } from './adapter-manager.js';
import { MCP_ERROR_CODE, McpToolError, formatToolError, toMcpToolError } from './errors.js';
import type { McpMongoAdapter, McpSqlAdapter } from './types.js';

// Count each tool's primary item array without retaining its contents.
const MCP_TOOL_ITEM_FIELDS = {
  sql_list_databases: 'databases',
  sql_list_schemas: 'schemas',
  sql_list_tables: 'tables',
  sql_describe_table: 'columns',
  sql_query: 'rows',
  mongo_list_databases: 'databases',
  mongo_list_collections: 'collections',
  mongo_find: 'documents',
  mongo_aggregate: 'documents',
} as const;

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

// Keep tool arguments inside the database authorized for this managed account.
function assertDatabaseScope(configuredDatabase: string | undefined, requestedDatabase?: string): void {
  if (!configuredDatabase || (requestedDatabase && requestedDatabase !== configuredDatabase)) {
    throw new McpToolError(MCP_ERROR_CODE.INVALID_ARGUMENTS, 'MCP access is limited to the configured database');
  }
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
        const profiles = listProfiles().filter(
          (profile) => manager.canServe(profile) && isMcpSupportedKind(profile.kind),
        );
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

  const registerDatabaseTool = <Schema extends ZodRawShapeCompat>(
    name: keyof typeof MCP_TOOL_ITEM_FIELDS,
    config: { title: string; description: string; inputSchema: Schema },
    callback: ToolCallback<Schema>,
  ): void => {
    // The validated callback response is summarized after execution and passed through unchanged.
    const wrapped = async (args: ShapeOutput<Schema>, extra: Parameters<ToolCallback<Schema>>[1]) => {
      const startedAt = Date.now();
      const executedAt = new Date(startedAt).toISOString();
      const result = await callback(args, extra);
      const profileIdValue = (args as Record<string, unknown>).connection_id;
      if (typeof profileIdValue !== 'string') {
        log.warn({ toolName: name }, 'MCP call history could not be recorded');
        return result;
      }
      const profileId = profileIdValue;

      try {
        let itemCount: number | null = null;
        let truncated = false;
        let errorCode: string | undefined;
        if (result.isError) {
          const errorText = result.content.find((item) => item.type === 'text')?.text ?? '';
          errorCode = Object.values(MCP_ERROR_CODE).find((code) => errorText.startsWith(`${code}:`));
          if (!errorCode) throw new Error('MCP error code is missing');
        } else {
          const responseText = result.content.find((item) => item.type === 'text')?.text;
          if (!responseText) throw new Error('MCP result summary is missing');
          const payload: unknown = JSON.parse(responseText);
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('MCP result summary is not an object');
          }
          const record = payload as Record<string, unknown>;
          const items = record[MCP_TOOL_ITEM_FIELDS[name]];
          if (!Array.isArray(items) || typeof record.truncated !== 'boolean') {
            throw new Error('MCP result summary is incomplete');
          }
          itemCount = items.length;
          truncated = record.truncated;
        }

        recordMcpCallHistory({
          profileId,
          toolName: name,
          input: Object.fromEntries(Object.entries(args)),
          executedAt,
          status: result.isError ? 'error' : 'success',
          durationMs: Date.now() - startedAt,
          itemCount,
          truncated,
          ...(errorCode ? { errorCode } : {}),
        });
      } catch {
        log.warn({ profileId, toolName: name }, 'MCP call history could not be recorded');
      }

      return result;
    };
    server.registerTool<ZodRawShapeCompat, Schema>(name, config, wrapped as ToolCallback<Schema>);
  };

  registerDatabaseTool(
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

  registerDatabaseTool(
    'sql_list_schemas',
    {
      title: 'List schemas',
      description: 'List schemas on an MCP-enabled SQL connection.',
      inputSchema: { connection_id: connectionId, database: z.string().min(1).optional() },
    },
    async ({ connection_id, database }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          assertDatabaseScope(connection.profile.database, database);
          const capped = capItems(await requireSql(connection).listSchemas(database));
          return { schemas: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerDatabaseTool(
    'sql_list_tables',
    {
      title: 'List tables',
      description: 'List tables on an MCP-enabled SQL connection.',
      inputSchema: {
        connection_id: connectionId,
        database: z.string().min(1).optional(),
        schema: z.string().min(1).optional(),
      },
    },
    async ({ connection_id, database, schema }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          assertDatabaseScope(connection.profile.database, database);
          const capped = capItems(await requireSql(connection).listTables(database, schema));
          return { tables: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerDatabaseTool(
    'sql_describe_table',
    {
      title: 'Describe table',
      description: 'Return column names and types for a table on an MCP-enabled SQL connection.',
      inputSchema: {
        connection_id: connectionId,
        table: z.string().min(1),
        database: z.string().min(1).optional(),
        schema: z.string().min(1).optional(),
      },
    },
    async ({ connection_id, table, database, schema }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          assertDatabaseScope(connection.profile.database, database);
          const capped = capItems(await requireSql(connection).getTableColumns(table, database, schema));
          return { columns: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerDatabaseTool(
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

  registerDatabaseTool(
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

  registerDatabaseTool(
    'mongo_list_collections',
    {
      title: 'List MongoDB collections',
      description: 'List collections in a MongoDB database.',
      inputSchema: { connection_id: connectionId, database: z.string().min(1) },
    },
    async ({ connection_id, database }) => {
      try {
        const payload = await manager.withConnection(connection_id, async (connection) => {
          assertDatabaseScope(connection.profile.database, database);
          const capped = capItems(await requireMongo(connection).listCollections(database));
          return { collections: capped.items, truncated: capped.truncated };
        });
        return jsonResult(payload);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerDatabaseTool(
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
          assertDatabaseScope(connection.profile.database, database);
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

  registerDatabaseTool(
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
          assertDatabaseScope(connection.profile.database, database);
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
