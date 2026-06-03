import mysql from 'mysql2/promise';
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
  IndexStats,
  DatabaseSize,
  SchemaSearchInput,
  SchemaSearchMatch,
} from '@kamehadb/shared';

export async function testMysqlConnection(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): Promise<TestConnectionResult> {
  const pool = mysql.createPool({
    host: connection.host || 'localhost',
    port: connection.port || 3306,
    database: connection.database,
    user: connection.username,
    password: connection.password,
    waitForConnections: true,
    connectionLimit: 1,
  });

  try {
    const [rows] = await pool.execute('SELECT VERSION() AS version');
    const version = (rows as Record<string, unknown>[])[0]?.version as string;
    await pool.end();
    return { success: true, serverVersion: version };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

export function createMysqlAdapter(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): SqlAdapter {
  if (!connection.database) throw new Error('Database name is required');
  if (!connection.username) throw new Error('Username is required');
  if (connection.password === undefined || connection.password === null) {
    throw new Error('Password is required');
  }

  const pool = mysql.createPool({
    host: connection.host || 'localhost',
    port: connection.port || 3306,
    database: connection.database,
    user: connection.username,
    password: connection.password,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
  });

  function escapeId(id: string): string {
    return '`' + id.replace(/`/g, '``') + '`';
  }

  async function query(sql: string, params?: unknown[]) {
    const [rows] = await pool.execute(sql, params as any);
    return rows as Record<string, unknown>[];
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const rows = await query('SELECT VERSION() AS version');
      return { success: true, serverVersion: String(rows[0]?.version ?? '') };
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const rows = await query('SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY name');
      return rows as DatabaseInfo[];
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      const rows = await query('SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY name');
      return rows as SchemaInfo[];
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      const db = schema ?? connection.database;
      const [rows] = await pool.query(
        "SELECT TABLE_NAME AS name, TABLE_SCHEMA AS schema_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
        [db],
      );
      return (rows as Record<string, unknown>[]).map((r) => ({
        id: `${r.schema_name}.${r.name}`,
        name: r.name as string,
        schema: r.schema_name as string,
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : connection.database;
      const table = parts.length > 1 ? parts[1] : tableId;
      const [rows] = await pool.query(
        `SELECT
          c.COLUMN_NAME AS name,
          c.COLUMN_TYPE AS type,
          c.IS_NULLABLE AS nullable,
          c.COLUMN_DEFAULT AS \`default\`,
          IF(c.COLUMN_KEY = 'PRI', TRUE, FALSE) AS primary_key,
          ku.REFERENCED_TABLE_NAME AS ref_table,
          ku.REFERENCED_COLUMN_NAME AS ref_column
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON c.TABLE_SCHEMA = ku.TABLE_SCHEMA AND c.TABLE_NAME = ku.TABLE_NAME AND c.COLUMN_NAME = ku.COLUMN_NAME
          AND ku.REFERENCED_TABLE_NAME IS NOT NULL
        WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
        ORDER BY c.ORDINAL_POSITION`,
        [schema, table],
      );
      return (rows as Record<string, unknown>[]).map((r) => ({
        name: r.name as string,
        type: r.type as string,
        nullable: r.nullable === 'YES',
        default: r.default === null ? null : String(r.default),
        primaryKey: !!r.primary_key,
        foreignKey: r.ref_table ? { table: r.ref_table as string, column: r.ref_column as string } : undefined,
      }));
    },

    async getCompletions(schema?: string): Promise<TableCompletions[]> {
      const db = schema ?? connection.database;
      const rows = await query(
        `SELECT
          c.TABLE_NAME AS table_name,
          c.COLUMN_NAME AS column_name,
          c.COLUMN_TYPE AS type,
          c.IS_NULLABLE AS nullable,
          c.COLUMN_DEFAULT AS \`default\`,
          IF(c.COLUMN_KEY = 'PRI', TRUE, FALSE) AS primary_key,
          ku.REFERENCED_TABLE_NAME AS ref_table,
          ku.REFERENCED_COLUMN_NAME AS ref_column
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON c.TABLE_SCHEMA = ku.TABLE_SCHEMA
          AND c.TABLE_NAME = ku.TABLE_NAME
          AND c.COLUMN_NAME = ku.COLUMN_NAME
          AND ku.REFERENCED_TABLE_NAME IS NOT NULL
        WHERE c.TABLE_SCHEMA = ?
          AND c.TABLE_NAME IN (
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
          )
        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
        [db, db],
      );
      const tableMap = new Map<string, TableCompletions>();
      for (const row of rows as Record<string, unknown>[]) {
        const name = row.table_name as string;
        if (!tableMap.has(name)) {
          tableMap.set(name, { name, schema: db, columns: [] });
        }
        tableMap.get(name)!.columns.push({
          name: row.column_name as string,
          type: row.type as string,
          nullable: row.nullable === 'YES',
          default: row.default === null ? null : String(row.default),
          primaryKey: !!row.primary_key,
          foreignKey: row.ref_table ? { table: row.ref_table as string, column: row.ref_column as string } : undefined,
        });
      }
      return Array.from(tableMap.values());
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : connection.database;
      const table = parts.length > 1 ? parts[1] : tableId;
      const [rows] = await pool.query(
        `SELECT INDEX_NAME AS Key_name, COLUMN_NAME AS Column_name, NON_UNIQUE AS Non_unique
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [schema, table],
      );
      const indexMap = new Map<string, IndexInfo>();
      for (const row of rows as Record<string, unknown>[]) {
        const name = row.Key_name as string;
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            columns: [],
            unique: row.Non_unique === 0,
            primary: name === 'PRIMARY',
          });
        }
        indexMap.get(name)!.columns.push(row.Column_name as string);
      }
      return Array.from(indexMap.values());
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      const parts = input.tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : connection.database;
      const table = parts.length > 1 ? parts[1] : input.tableId;
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;
      let sql = `SELECT * FROM ${escapeId(schema!)}.${escapeId(table)}`;
      const params: unknown[] = [];

      if (input.search) {
        const [colRows] = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
          [schema, table],
        );
        const searchCols = (colRows as any[]).map((r: any) => r.column_name as string);
        if (searchCols.length > 0) {
          const clauses = searchCols.map((col) => {
            params.push(`%${input.search}%`);
            return `${escapeId(col)} LIKE ?`;
          });
          sql += ` WHERE ${clauses.join(' OR ')}`;
        }
      }

      if (input.sortColumn) {
        sql += ` ORDER BY ${escapeId(input.sortColumn)} ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }
      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const start = performance.now();
      const [rows] = (await pool.query(sql)) as unknown as [Record<string, unknown>[]];
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
      const rows = await query(input.query, input.params as any);
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
      await pool.end();
    },

    async searchSchema(input: SchemaSearchInput): Promise<SchemaSearchMatch[]> {
      const term = `%${input.query}%`;
      const db = input.schema ?? connection.database;
      const limit = input.limit ?? 50;

      const [rows] = await pool.query(
        `SELECT TABLE_SCHEMA, TABLE_NAME, NULL AS COLUMN_NAME, NULL AS COLUMN_TYPE, 'table' AS MATCH_TYPE
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE ?
         UNION ALL
         SELECT c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.COLUMN_TYPE, 'column' AS MATCH_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS c
         WHERE c.TABLE_SCHEMA = ? AND c.COLUMN_NAME LIKE ?
         ORDER BY MATCH_TYPE, TABLE_NAME, COLUMN_NAME
         LIMIT ?`,
        [db, term, db, term, limit],
      );

      return (rows as Record<string, unknown>[]).map((r) => ({
        schema: r.TABLE_SCHEMA as string,
        table: r.TABLE_NAME as string,
        column: (r.COLUMN_NAME as string) || undefined,
        columnType: (r.COLUMN_TYPE as string) || undefined,
        matchType: r.MATCH_TYPE as 'table' | 'column',
      }));
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : connection.database;
      const table = parts.length > 1 ? parts[1] : tableId;

      const [rows] = (await pool.query(
        `SELECT
          (SELECT COUNT(*) FROM ${escapeId(schema!)}.${escapeId(table)}) AS row_count,
          (SELECT (data_length + index_length) FROM information_schema.TABLES WHERE table_schema = ? AND table_name = ?) AS total_bytes,
          data_length AS data_bytes,
          index_length AS index_bytes
        FROM DUAL`,
        [schema, table],
      )) as [Record<string, unknown>[], any];

      const stats = rows[0] || {};
      return {
        tableId,
        name: table,
        schema: schema!,
        rowEstimate: Number(stats.row_count) || 0,
        totalBytes: Number(stats.total_bytes) || 0,
        indexesBytes: Number(stats.index_bytes) || 0,
        toastBytes: 0,
        bloatBytes: 0,
        bloatPercent: 0,
        lastVacuum: null,
        lastAutovacuum: null,
        lastAnalyze: null,
        lastAutoanalyze: null,
        vacuumCount: 0,
        autovacuumCount: 0,
        nLiveTup: Number(stats.row_count) || 0,
        nDeadTup: 0,
      };
    },

    async getIndexStats(tableId: string): Promise<IndexStats[]> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : connection.database;
      const table = parts.length > 1 ? parts[1] : tableId;

      const [rows] = (await pool.query(
        `SELECT
          INDEX_NAME AS name,
          COLUMN_NAME AS column_name,
          NON_UNIQUE AS non_unique,
          SEQ_IN_INDEX AS seq
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [schema, table],
      )) as [Record<string, unknown>[], any];

      const indexMap = new Map<string, IndexStats & { columns: string[] }>();
      for (const row of rows) {
        const name = row.name as string;
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            table: tableId,
            columns: [],
            unique: row.non_unique === 0,
            primary: name === 'PRIMARY',
            sizeBytes: 0,
            scans: 0,
            reads: 0,
            usagePercent: 0,
          });
        }
        indexMap.get(name)!.columns.push(row.column_name as string);
      }

      return Array.from(indexMap.values());
    },

    async getDatabaseSizes(): Promise<DatabaseSize[]> {
      const db = connection.database!;
      const [rows] = (await pool.query(
        `SELECT
          TABLE_NAME AS table_name,
          TABLE_ROWS AS row_estimate,
          DATA_LENGTH + INDEX_LENGTH AS total_bytes,
          INDEX_LENGTH AS index_bytes
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY total_bytes DESC`,
        [db],
      )) as [Record<string, unknown>[], any];

      return rows.map((row) => ({
        schema: db,
        table: row.table_name as string,
        sizeBytes: Number(row.total_bytes) || 0,
        indexBytes: Number(row.index_bytes) || 0,
        totalBytes: Number(row.total_bytes) || 0,
        rowEstimate: Number(row.row_estimate) || 0,
      }));
    },
  };
}
