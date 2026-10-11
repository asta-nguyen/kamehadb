import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearMcpCallHistory,
  closeMetadataStore,
  getDb,
  initMetadataStore,
  listMcpCallHistory,
  setMcpHistoryEnabled,
} from '../db/metadata-store.js';
import type { McpAdapterManager, McpConnection } from './adapter-manager.js';
import { MCP_ERROR_CODE } from './errors.js';
import { registerMcpTools } from './tools.js';
import type { McpMongoAdapter, McpSqlAdapter } from './types.js';

type ToolResult = { content: { type: string; text?: string }[]; isError?: boolean };
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const tempDirs: string[] = [];
let handlers: Map<string, ToolHandler>;

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kamehadb-mcp-tools-'));
  tempDirs.push(dir);
  return dir;
}

// Capture registered callbacks so their wrapper can be exercised without an MCP transport.
function setup(): void {
  initMetadataStore(join(tempDir(), 'metadata.db'));
  handlers = new Map();

  const sqlAdapter = {
    listDatabases: async () => ['app', 'audit'],
    listSchemas: async () => ['public'],
    listTables: async () => ['items', 'users', 'events'],
    getTableColumns: async () => [{ name: 'id' }, { name: 'label' }],
    runQueryBounded: async () => ({ columns: ['id'], rows: [[1], [2]], durationMs: 1, truncated: true }),
  } as unknown as McpSqlAdapter;
  const mongoAdapter = {
    listDatabases: async () => ['app', 'logs', 'admin'],
    listCollections: async () => ['items', 'users'],
    findBounded: async () => ({ documents: [{ id: 1 }, { id: 2 }], durationMs: 1, truncated: true }),
    aggregateBounded: async () => ({
      documents: [{ count: 1 }, { count: 2 }, { count: 3 }, { count: 4 }],
      durationMs: 1,
      truncated: false,
    }),
  } as unknown as McpMongoAdapter;
  const sqlConnection = { kind: 'sql', adapter: sqlAdapter, profile: { database: 'app' } } as McpConnection;
  const mongoConnection = { kind: 'mongo', adapter: mongoAdapter, profile: { database: 'app' } } as McpConnection;
  const manager = {
    canServe: () => true,
    withConnection: async (profileId: string, callback: (connection: McpConnection) => Promise<unknown>) =>
      callback(profileId === 'mongo-profile' ? mongoConnection : sqlConnection),
  } as unknown as McpAdapterManager;
  const server = {
    registerTool: (name: string, _config: unknown, callback: ToolHandler) => handlers.set(name, callback),
  } as unknown as McpServer;

  registerMcpTools(server, manager);
}

beforeEach(setup);

afterEach(() => {
  closeMetadataStore();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('MCP database tool history summaries', () => {
  it('counts the primary returned array and preserves each tool response', async () => {
    const calls = [
      ['sql_list_databases', { connection_id: 'sql-profile' }, 2],
      ['sql_list_schemas', { connection_id: 'sql-profile' }, 1],
      ['sql_list_tables', { connection_id: 'sql-profile' }, 3],
      ['sql_describe_table', { connection_id: 'sql-profile', table: 'items' }, 2],
      ['sql_query', { connection_id: 'sql-profile', sql: 'SELECT id FROM items' }, 2],
      ['mongo_list_databases', { connection_id: 'mongo-profile' }, 3],
      ['mongo_list_collections', { connection_id: 'mongo-profile', database: 'app' }, 2],
      ['mongo_find', { connection_id: 'mongo-profile', database: 'app', collection: 'items' }, 2],
      ['mongo_aggregate', { connection_id: 'mongo-profile', database: 'app', collection: 'items', pipeline: [] }, 4],
    ] as const;

    for (const [toolName, args, itemCount] of calls) {
      const result = await handlers.get(toolName)!(args);
      const entry = listMcpCallHistory().find((item) => item.toolName === toolName);
      expect(entry?.itemCount).toBe(itemCount);
      expect(entry?.input).toMatchObject(args);
      expect(entry).not.toHaveProperty('result');
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBeTruthy();
    }

    const sqlResult = await handlers.get('sql_query')!({ connection_id: 'sql-profile', sql: 'SELECT id FROM items' });
    expect(JSON.parse(sqlResult.content[0].text!)).toMatchObject({ rows: [[1], [2]], truncated: true });
    expect(listMcpCallHistory().find((entry) => entry.toolName === 'sql_query')?.truncated).toBe(true);
    expect(listMcpCallHistory().find((entry) => entry.toolName === 'mongo_aggregate')?.truncated).toBe(false);
  });

  it('stores stable error codes and excludes the local profile-list tool', async () => {
    await handlers.get('sql_query')!({ connection_id: 'sql-profile', sql: 'DELETE FROM items' });
    await handlers.get('list_mcp_profiles')!({});

    const [entry] = listMcpCallHistory();
    expect(entry).toMatchObject({
      toolName: 'sql_query',
      status: 'error',
      itemCount: null,
      truncated: false,
      errorCode: MCP_ERROR_CODE.READ_ONLY_QUERY_REQUIRED,
    });
    expect(listMcpCallHistory()).toHaveLength(1);
  });

  it('does not record calls when disabled and returns results when the history store fails', async () => {
    setMcpHistoryEnabled(false);
    await handlers.get('sql_query')!({ connection_id: 'sql-profile', sql: 'SELECT id FROM items' });
    expect(listMcpCallHistory()).toEqual([]);

    setMcpHistoryEnabled(true);
    getDb().exec('DROP TABLE mcp_call_history');
    const result = await handlers.get('sql_query')!({ connection_id: 'sql-profile', sql: 'SELECT id FROM items' });
    expect(JSON.parse(result.content[0].text!)).toMatchObject({ rows: [[1], [2]], truncated: true });
  });
});
