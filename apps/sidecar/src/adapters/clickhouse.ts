import { createClient } from '@clickhouse/client';
import type {
  SqlAdapter,
  TestConnectionResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  PreviewRowsInput,
  QueryResult,
  RunQueryInput,
  QueryColumn,
  TableCompletions,
  TableStats,
} from '@kamehadb/shared';

// The @clickhouse/client's result.json() returns { data: [...], meta: [...], rows, statistics },
// not a bare array. We extract .data to get the row array.
interface ClickHouseResult<T> {
  data: T[];
  meta: { name: string; type: string }[];
}

export async function testClickHouseConnection(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): Promise<TestConnectionResult> {
  const client = createClient({
    host: `http://${connection.host || 'localhost'}:${connection.port || 8123}`,
    username: connection.username || 'default',
    password: connection.password ?? '',
    database: connection.database || 'default',
  });
  try {
    const result = await client.query({ query: 'SELECT version() AS version' });
    const json: ClickHouseResult<{ version: string }> = (await result.json()) as ClickHouseResult<{ version: string }>;
    return { success: true, serverVersion: json.data[0]?.version || '' };
  } finally {
    await client.close();
  }
}

export function createClickHouseAdapter(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): SqlAdapter {
  const client = createClient({
    host: `http://${connection.host || 'localhost'}:${connection.port || 8123}`,
    username: connection.username || 'default',
    password: connection.password ?? '',
    database: connection.database || 'default',
    clickhouse_settings: {
      wait_end_of_query: 1,
    },
  });

  function escapeId(id: string): string {
    return '`' + id.replace(/`/g, '\\`') + '`';
  }

  function escapeVal(val: string): string {
    return "'" + val.replace(/'/g, "\\'") + "'";
  }

  async function q<T>(query: string): Promise<T[]> {
    const result = await client.query({ query });
    const json: ClickHouseResult<T> = (await result.json()) as ClickHouseResult<T>;
    return json.data;
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const rows = await q<{ version: string }>('SELECT version() AS version');
      return { success: true, serverVersion: rows[0]?.version || '' };
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const rows = await q<{ name: string }>(
        "SELECT name FROM system.databases WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY name",
      );
      return rows.map((r) => ({ name: r.name }));
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      // ClickHouse uses databases as schemas
      const rows = await q<{ name: string }>('SELECT name FROM system.databases ORDER BY name');
      return rows.map((r) => ({ name: r.name }));
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      if (schema) {
        const rows = await q<{ name: string; database: string }>(
          `SELECT name, database FROM system.tables WHERE database = ${escapeVal(schema)} AND database NOT IN ('INFORMATION_SCHEMA', 'information_schema', 'system') AND engine NOT IN ('SystemTable', 'SystemLog') ORDER BY name`,
        );
        return rows.map((r) => ({
          id: `${r.database}.${r.name}`,
          name: r.name,
          schema: r.database,
        }));
      }
      // No schema specified — return tables from all non-system databases
      const rows = await q<{ name: string; database: string }>(
        `SELECT name, database FROM system.tables WHERE database NOT IN ('INFORMATION_SCHEMA', 'information_schema', 'system') AND engine NOT IN ('SystemTable', 'SystemLog') ORDER BY database, name`,
      );
      return rows.map((r) => ({
        id: `${r.database}.${r.name}`,
        name: r.name,
        schema: r.database,
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const parts = tableId.split('.');
      const db = parts.length > 1 ? parts[0] : connection.database || 'default';
      const table = parts.length > 1 ? parts[1] : tableId;
      const rows = await q<{
        name: string;
        type: string;
        default_kind: string;
        default_expression: string;
      }>(
        `SELECT name, type, default_kind, default_expression FROM system.columns WHERE database = '${db}' AND table = '${table}' ORDER BY position`,
      );
      return rows.map((r) => ({
        name: r.name,
        type: r.type,
        nullable: r.type.startsWith('Nullable('),
        default: r.default_kind === 'DEFAULT' ? r.default_expression : null,
        primaryKey: false,
      }));
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      // ClickHouse has data-skipping indexes stored in system.data_skipping_indices
      const parts = tableId.split('.');
      const db = parts.length > 1 ? parts[0] : connection.database || 'default';
      const table = parts.length > 1 ? parts[1] : tableId;
      const rows = await q<{ name: string; type: string; expr: string; granularity: number }>(
        `SELECT name, type, expr, granularity FROM system.data_skipping_indices WHERE database = ${escapeVal(db)} AND table = ${escapeVal(table)} ORDER BY name`,
      );
      return rows.map((r) => ({
        name: r.name,
        columns: [r.expr],
        unique: false,
        primary: false,
        type: r.type,
      }));
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const parts = tableId.split('.');
      const db = parts.length > 1 ? parts[0] : connection.database || 'default';
      const table = parts.length > 1 ? parts[1] : tableId;
      const rows = await q<{
        name: string;
        total_rows: string;
        total_bytes: string;
        metadata_modification_time: string;
      }>(
        `SELECT name, total_rows, total_bytes, metadata_modification_time
         FROM system.tables
         WHERE database = ${escapeVal(db)} AND name = ${escapeVal(table)}`,
      );
      const row = rows[0];
      const rowEstimate = row ? Number(row.total_rows) || 0 : 0;
      const totalBytes = row ? Number(row.total_bytes) || 0 : 0;

      return {
        tableId,
        name: table,
        schema: db,
        rowEstimate,
        totalBytes,
        indexesBytes: 0,
        toastBytes: 0,
        bloatBytes: 0,
        bloatPercent: 0,
        lastVacuum: null,
        lastAutovacuum: null,
        lastAnalyze: null,
        lastAutoanalyze: null,
        vacuumCount: 0,
        autovacuumCount: 0,
        nLiveTup: rowEstimate,
        nDeadTup: 0,
      };
    },

    async getCompletions(schema?: string): Promise<TableCompletions[]> {
      const db = schema || connection.database || 'default';
      const rows = await q<{
        table: string;
        name: string;
        type: string;
        default_kind: string;
        default_expression: string;
      }>(
        `SELECT c.table AS "table", c.name, c.type, c.default_kind, c.default_expression
         FROM system.columns c
         JOIN system.tables t ON c.database = t.database AND c.table = t.name
         WHERE c.database = '${db}' AND t.engine NOT IN ('SystemTable', 'SystemLog')
         ORDER BY c.table, c.position`,
      );
      const tableMap = new Map<string, TableCompletions>();
      for (const row of rows) {
        const name = row.table;
        if (!tableMap.has(name)) {
          tableMap.set(name, { name, schema: db, columns: [] });
        }
        tableMap.get(name)!.columns.push({
          name: row.name,
          type: row.type,
          nullable: row.type.startsWith('Nullable('),
          default: row.default_kind === 'DEFAULT' ? row.default_expression : null,
          primaryKey: false,
        });
      }
      return Array.from(tableMap.values());
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      const parts = input.tableId.split('.');
      const db = escapeId(parts.length > 1 ? parts[0] : connection.database || 'default');
      const table = escapeId(parts.length > 1 ? parts[1] : input.tableId);
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;

      let queryStr = `SELECT * FROM ${db}.${table}`;

      if (input.sortColumn) {
        queryStr += ` ORDER BY ${escapeId(input.sortColumn)} ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }
      queryStr += ` LIMIT ${limit} OFFSET ${offset}`;

      const start = performance.now();
      const rows = await q<Record<string, unknown>>(queryStr);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] =
        rows.length > 0 ? Object.keys(rows[0]).map((key) => ({ name: key, type: typeof rows[0][key] })) : [];

      return {
        columns,
        rows,
        rowCount: rows.length,
        durationMs: Math.round(durationMs),
        truncated: rows.length >= limit,
      };
    },

    async runQuery(input: RunQueryInput): Promise<QueryResult> {
      const start = performance.now();
      const rows = await q<Record<string, unknown>>(input.query);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] =
        rows.length > 0 ? Object.keys(rows[0]).map((key) => ({ name: key, type: typeof rows[0][key] })) : [];

      return {
        columns,
        rows,
        rowCount: rows.length,
        durationMs: Math.round(durationMs),
        truncated: false,
      };
    },

    async close(): Promise<void> {
      await client.close();
    },

    async getDatabaseSizes(): Promise<import('@kamehadb/shared').DatabaseSize[]> {
      const rows = await q<{
        database: string;
        name: string;
        total_rows: string;
        total_bytes: string;
      }>(
        `SELECT database, name, total_rows, total_bytes
         FROM system.tables
         WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
           AND engine NOT IN ('SystemTable', 'SystemLog')
         ORDER BY total_bytes DESC`,
      );
      return rows.map((r) => ({
        schema: r.database,
        table: r.name,
        sizeBytes: Number(r.total_bytes) || 0,
        indexBytes: 0,
        totalBytes: Number(r.total_bytes) || 0,
        rowEstimate: Number(r.total_rows) || 0,
      }));
    },
  };
}
