import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type {
  ColumnInfo,
  ConnectionProfile,
  IndexInfo,
  KeyPage,
  QueryResult,
  TableCompletions,
} from '@kamehadb/shared';
import { sidecarGet, sidecarPost, SidecarError } from './client.js';
import { mapSidecarError } from './errors.js';
import { jsonResult, textResult, truncateRows } from './format.js';

const SERVER_INFO = { name: 'kamehadb', version: '0.1.0' } as const;

async function checkSidecarHealth(): Promise<void> {
  try {
    await sidecarGet<{ status: string }>('/health');
  } catch (err) {
    if (err instanceof SidecarError && err.code === 'CONNECTION_ERROR') {
      process.stderr.write(
        `[mcp] WARNING: KamehaDB sidecar is not reachable. Start it with: pnpm dev:sidecar\n` +
          `[mcp] Subsequent tool calls will return a connection error until the sidecar is up.\n`,
      );
      return;
    }
    process.stderr.write(`[mcp] Health check returned: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

async function safeCall(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return mapSidecarError(err);
  }
}

const server = new McpServer(SERVER_INFO);

// 1. list_connections ----------------------------------------------------------------
server.registerTool(
  'list_connections',
  {
    description:
      'List saved KamehaDB connections. Returns id, name, kind, host, port, database. Call this first to find a connectionId.',
  },
  async () =>
    safeCall(async () => {
      const profiles = await sidecarGet<ConnectionProfile[]>('/connections');
      return jsonResult(
        profiles.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          host: p.host,
          port: p.port,
          database: p.database,
          readonly: p.readonly,
        })),
      );
    }),
);

// 2. get_schema_summary --------------------------------------------------------------
server.registerTool(
  'get_schema_summary',
  {
    description:
      'Get a condensed tables-and-columns view for a SQL connection. Pass a schema name (e.g. "public") for Postgres; omit for SQLite/MySQL.',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id (from list_connections).'),
      schema: z.string().optional().describe('Schema name. Defaults to connection default.'),
    },
  },
  async ({ connectionId, schema }) =>
    safeCall(async () => {
      const qs = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      const result = await sidecarGet<{ tables: TableCompletions[] }>(
        `/sql/${encodeURIComponent(connectionId)}/completions${qs}`,
      );
      return jsonResult({
        connectionId,
        schema: schema ?? null,
        tables: result.tables.map((t) => ({
          name: t.name,
          schema: t.schema ?? null,
          columns: t.columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            primaryKey: c.primaryKey,
            foreignKey: c.foreignKey ?? null,
          })),
        })),
      });
    }),
);

// 3. describe_table ------------------------------------------------------------------
server.registerTool(
  'describe_table',
  {
    description:
      'Describe a single table: columns, primary keys, foreign keys, and indexes. For Postgres, tableId is "schema.table" (e.g. "public.users"); for MySQL/SQLite it is just the table name.',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id.'),
      tableId: z.string().describe('Table identifier, schema-qualified for Postgres.'),
    },
  },
  async ({ connectionId, tableId }) =>
    safeCall(async () => {
      const base = `/sql/${encodeURIComponent(connectionId)}/tables/${encodeURIComponent(tableId)}`;
      const [columns, indexes] = await Promise.all([
        sidecarGet<ColumnInfo[]>(`${base}/columns`),
        sidecarGet<IndexInfo[]>(`${base}/indexes`),
      ]);
      return jsonResult({ tableId, columns, indexes });
    }),
);

// 4. search_schema -------------------------------------------------------------------
server.registerTool(
  'search_schema',
  {
    description:
      'Substring search across table and column names in a SQL connection. Case-insensitive. Returns matching tables with their columns.',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id.'),
      query: z.string().min(1).describe('Substring to search for in table or column names.'),
      schema: z.string().optional().describe('Schema name. Defaults to connection default.'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max tables to return.'),
    },
  },
  async ({ connectionId, query, schema, limit }) =>
    safeCall(async () => {
      const qs = schema ? `?schema=${encodeURIComponent(schema)}` : '';
      const result = await sidecarGet<{ tables: TableCompletions[] }>(
        `/sql/${encodeURIComponent(connectionId)}/completions${qs}`,
      );
      const needle = query.toLowerCase();
      const matched: Array<{ name: string; schema: string | null; matchedColumns: string[] }> = [];
      for (const t of result.tables) {
        const tableHit = t.name.toLowerCase().includes(needle);
        const matchedColumns = tableHit
          ? []
          : t.columns.filter((c) => c.name.toLowerCase().includes(needle)).map((c) => c.name);
        if (tableHit || matchedColumns.length > 0) {
          matched.push({ name: t.name, schema: t.schema ?? null, matchedColumns });
          if (matched.length >= limit) break;
        }
      }
      return jsonResult({ connectionId, query, schema: schema ?? null, matches: matched });
    }),
);

// 5. run_readonly_query --------------------------------------------------------------
server.registerTool(
  'run_readonly_query',
  {
    description:
      'Run a SELECT, WITH, or SHOW statement on a SQL connection. INSERT/UPDATE/DELETE/DROP/ALTER are rejected by the server. Add LIMIT for large results.',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id.'),
      query: z.string().min(1).describe('SQL query (SELECT/CTE/SHOW).'),
      params: z.array(z.unknown()).optional().describe('Bind parameters.'),
    },
  },
  async ({ connectionId, query, params }) =>
    safeCall(async () => {
      const raw = await sidecarPost<QueryResult>(`/sql/${encodeURIComponent(connectionId)}/query`, { query, params });
      const truncation = truncateRows(raw.rows);
      return jsonResult({
        connectionId,
        columns: raw.columns,
        rowCount: raw.rowCount,
        durationMs: raw.durationMs,
        truncated: raw.truncated || truncation.truncated,
        totalRows: truncation.totalRows,
        keptRows: truncation.keptRows,
        rows: truncation.rows,
      });
    }),
);

// 6. explain_query -------------------------------------------------------------------
server.registerTool(
  'explain_query',
  {
    description:
      'Run EXPLAIN on a SELECT to see the query plan. Use before optimizing slow queries. Read-only; mutations rejected.',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id.'),
      query: z.string().min(1).describe('SELECT query to explain.'),
    },
  },
  async ({ connectionId, query }) =>
    safeCall(async () => {
      const raw = await sidecarPost<QueryResult>(`/sql/${encodeURIComponent(connectionId)}/query`, {
        query: `EXPLAIN ${query}`,
      });
      const truncation = truncateRows(raw.rows);
      return jsonResult({
        connectionId,
        originalQuery: query,
        columns: raw.columns,
        rowCount: raw.rowCount,
        durationMs: raw.durationMs,
        truncated: raw.truncated || truncation.truncated,
        totalRows: truncation.totalRows,
        keptRows: truncation.keptRows,
        rows: truncation.rows,
      });
    }),
);

// 7. scan_redis_keys -----------------------------------------------------------------
server.registerTool(
  'scan_redis_keys',
  {
    description:
      'Scan keys in a Redis connection (SCAN-based, not blocking KEYS). Use the returned cursor to paginate. Pattern supports glob (e.g. "user:*").',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id.'),
      pattern: z.string().default('*').describe('Glob pattern. Defaults to "*" (all keys).'),
      count: z.number().int().min(1).max(1000).default(100).describe('Hint for keys per page.'),
      cursor: z.number().int().min(0).default(0).describe('Pagination cursor. Start at 0.'),
    },
  },
  async ({ connectionId, pattern, count, cursor }) =>
    safeCall(async () => {
      const page = await sidecarPost<KeyPage>(`/redis/${encodeURIComponent(connectionId)}/keys`, {
        pattern,
        count,
        cursor,
      });
      return jsonResult({ connectionId, pattern, ...page });
    }),
);

// 8. find_mongo_documents ------------------------------------------------------------
server.registerTool(
  'find_mongo_documents',
  {
    description:
      'Find documents in a MongoDB collection. Filter is a MongoDB query object. Projection, sort, skip, limit supported.',
    inputSchema: {
      connectionId: z.string().describe('The KamehaDB connection id.'),
      collection: z.string().describe('Collection name.'),
      database: z.string().optional().describe('Database name. Defaults to connection default.'),
      filter: z.record(z.string(), z.unknown()).default({}).describe('MongoDB filter object.'),
      projection: z.record(z.string(), z.unknown()).optional().describe('Fields to include/exclude.'),
      sort: z
        .record(z.string(), z.union([z.literal(1), z.literal(-1)]))
        .optional()
        .describe('Sort spec.'),
      skip: z.number().int().min(0).default(0).describe('Documents to skip.'),
      limit: z.number().int().min(1).max(1000).default(50).describe('Max documents to return.'),
    },
  },
  async ({ connectionId, collection, database, filter, projection, sort, skip, limit }) =>
    safeCall(async () => {
      const result = await sidecarPost<{
        documents: Record<string, unknown>[];
        totalCount: number;
        hasMore: boolean;
        durationMs: number;
      }>(`/mongo/${encodeURIComponent(connectionId)}/find`, {
        collection,
        database,
        filter,
        projection,
        sort,
        skip,
        limit,
      });
      const truncation = truncateRows(result.documents);
      return jsonResult({
        connectionId,
        collection,
        database: database ?? null,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        durationMs: result.durationMs,
        truncated: truncation.truncated,
        keptDocuments: truncation.keptRows,
        documents: truncation.rows,
      });
    }),
);

async function main(): Promise<void> {
  await checkSidecarHealth();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[mcp] KamehaDB MCP server ready (stdio, ${SERVER_INFO.version})\n`);
}

main().catch((err) => {
  process.stderr.write(`[mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
