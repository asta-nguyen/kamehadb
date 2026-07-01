import sql from 'mssql';
import { DEFAULT_PORTS, KIND } from '@kamehadb/shared';
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
  ConnectionInfo,
  SchemaSearchInput,
  SchemaSearchMatch,
} from '@kamehadb/shared';
import { ADAPTER_TIMEOUTS } from '../lib/constants.js';

export async function testSqlServerConnection(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): Promise<TestConnectionResult> {
  const pool = new sql.ConnectionPool({
    server: connection.host || 'localhost',
    port: connection.port || DEFAULT_PORTS[KIND.SQLSERVER],
    database: connection.database || 'master',
    user: connection.username,
    password: connection.password,
    connectionTimeout: ADAPTER_TIMEOUTS.CONNECT_DEFAULT,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  });
  try {
    await pool.connect();
    const result = await pool.request().query('SELECT @@VERSION AS version');
    const version = result.recordset[0]?.version as string;
    await pool.close();
    return { success: true, serverVersion: version };
  } catch (error) {
    await pool.close().catch(() => {});
    throw error;
  }
}

export function createSqlServerAdapter(
  connection: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  },
  options?: { requestTimeoutMs?: number },
): SqlAdapter {
  const requestTimeoutMs = options?.requestTimeoutMs ?? ADAPTER_TIMEOUTS.IDLE;
  const pool = new sql.ConnectionPool({
    server: connection.host || 'localhost',
    port: connection.port || DEFAULT_PORTS[KIND.SQLSERVER],
    database: connection.database || 'master',
    user: connection.username,
    password: connection.password,
    connectionTimeout: ADAPTER_TIMEOUTS.CONNECT_LONG,
    requestTimeout: requestTimeoutMs,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: ADAPTER_TIMEOUTS.IDLE,
    },
  });

  function escapeId(id: string): string {
    return '[' + id.replace(/\]/g, ']]') + ']';
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      await pool.connect();
      const result = await pool.request().query('SELECT @@VERSION AS version');
      return { success: true, serverVersion: String(result.recordset[0]?.version ?? '') };
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      await pool.connect();
      const result = await pool.request().query('SELECT name FROM sys.databases WHERE state = 0 ORDER BY name');
      return result.recordset.map((r) => ({ name: r.name as string }));
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      await pool.connect();
      const result = await pool.request().query('SELECT name FROM sys.schemas ORDER BY name');
      return result.recordset.map((r) => ({ name: r.name as string }));
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      await pool.connect();
      const s = schema || 'dbo';
      const result = await pool.request().input('schema', sql.NVarChar, s).query(`
          SELECT TABLE_NAME AS name, TABLE_SCHEMA AS schema_name
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = @schema AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME
        `);
      return result.recordset.map((r) => ({
        id: `${r.schema_name}.${r.name}`,
        name: r.name as string,
        schema: r.schema_name as string,
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      await pool.connect();
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : tableId;
      const result = await pool.request().input('schema', sql.NVarChar, schema).input('table', sql.NVarChar, table)
        .query(`
          SELECT
            c.COLUMN_NAME AS name,
            c.DATA_TYPE AS type,
            c.IS_NULLABLE AS nullable,
            c.COLUMN_DEFAULT AS [default],
            COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS is_identity,
            CASE WHEN k.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS primary_key
          FROM INFORMATION_SCHEMA.COLUMNS c
          LEFT JOIN (
            SELECT ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
              ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
              AND ku.TABLE_SCHEMA = @schema
              AND ku.TABLE_NAME = @table
          ) k ON c.COLUMN_NAME = k.COLUMN_NAME
          WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
          ORDER BY c.ORDINAL_POSITION
        `);
      return result.recordset.map((r) => ({
        name: r.name as string,
        type: r.type as string,
        nullable: r.nullable === 'YES',
        default: r.default === null ? null : String(r.default),
        primaryKey: !!r.primary_key,
      }));
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      await pool.connect();
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : tableId;
      const result = await pool.request().input('schema', sql.NVarChar, schema).input('table', sql.NVarChar, table)
        .query(`
          SELECT
            i.name AS index_name,
            c.name AS column_name,
            i.is_unique,
            i.is_primary_key
          FROM sys.indexes i
          JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
          JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          JOIN sys.tables t ON i.object_id = t.object_id
          JOIN sys.schemas s ON t.schema_id = s.schema_id
          WHERE s.name = @schema AND t.name = @table
          ORDER BY i.name, ic.key_ordinal
        `);
      const indexMap = new Map<string, IndexInfo>();
      for (const row of result.recordset) {
        const name = row.index_name as string;
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            columns: [],
            unique: !!row.is_unique,
            primary: !!row.is_primary_key,
          });
        }
        indexMap.get(name)!.columns.push(row.column_name as string);
      }
      return Array.from(indexMap.values());
    },

    async getCompletions(schema?: string): Promise<TableCompletions[]> {
      await pool.connect();
      const s = schema || 'dbo';
      const result = await pool.request().input('schema', sql.NVarChar, s).query(`
          SELECT
            c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE AS type,
            c.IS_NULLABLE AS nullable, c.COLUMN_DEFAULT AS [default]
          FROM INFORMATION_SCHEMA.COLUMNS c
          WHERE c.TABLE_SCHEMA = @schema
          ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        `);
      const tableMap = new Map<string, TableCompletions>();
      for (const row of result.recordset) {
        const name = row.TABLE_NAME as string;
        if (!tableMap.has(name)) {
          tableMap.set(name, { name, schema: s, columns: [] });
        }
        tableMap.get(name)!.columns.push({
          name: row.COLUMN_NAME as string,
          type: row.type as string,
          nullable: (row.nullable as string) === 'YES',
          default: row.default === null ? null : String(row.default),
          primaryKey: false,
        });
      }
      return Array.from(tableMap.values());
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      await pool.connect();
      const parts = input.tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : input.tableId;
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;

      let q = `SELECT * FROM ${escapeId(schema!)}.${escapeId(table)}`;
      const req = pool.request();

      if (input.search) {
        const colResult = await pool.request().input('schema', sql.NVarChar, schema).input('table', sql.NVarChar, table)
          .query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
            ORDER BY ORDINAL_POSITION
          `);
        const searchCols = colResult.recordset.map((r) => r.COLUMN_NAME as string);
        if (searchCols.length > 0) {
          const clauses = searchCols.map((col, i) => {
            req.input(`search${i}`, sql.NVarChar, `%${input.search}%`);
            return `${escapeId(col)} LIKE @search${i}`;
          });
          q += ` WHERE ${clauses.join(' OR ')}`;
        }
      }

      if (input.sortColumn) {
        q += ` ORDER BY ${escapeId(input.sortColumn)} ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      } else {
        q += ' ORDER BY 1';
      }
      q += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

      const start = performance.now();
      const result = await req.query(q);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] =
        result.recordset.length > 0
          ? Object.keys(result.recordset[0]).map((key) => ({ name: key, type: typeof result.recordset[0][key] }))
          : [];

      return {
        columns,
        rows: result.recordset as Record<string, unknown>[],
        rowCount: result.recordset.length,
        durationMs: Math.round(durationMs),
        truncated: result.recordset.length >= limit,
      };
    },

    async runQuery(input: RunQueryInput): Promise<QueryResult> {
      await pool.connect();
      const start = performance.now();
      const req = pool.request();
      if (input.params) {
        for (let i = 0; i < input.params.length; i++) {
          req.input(`p${i}`, input.params[i]);
        }
      }
      const result = await req.query(input.query);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] =
        result.recordset.length > 0
          ? Object.keys(result.recordset[0]).map((key) => ({ name: key, type: typeof result.recordset[0][key] }))
          : [];

      return {
        columns,
        rows: result.recordset as Record<string, unknown>[],
        rowCount: result.recordset.length,
        durationMs: Math.round(durationMs),
        truncated: false,
      };
    },

    async searchSchema(input: SchemaSearchInput): Promise<SchemaSearchMatch[]> {
      await pool.connect();
      const term = `%${input.query}%`;
      const limit = input.limit ?? 50;
      const schema = input.schema ?? 'dbo';
      const req = pool.request();
      req.input('term', sql.NVarChar, term).input('limit', sql.Int, limit).input('schema', sql.NVarChar, schema);

      const tableResult = await req.query(`
        SELECT TOP (@limit) t.name AS table_name, s.name AS schema_name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name LIKE @term
        ORDER BY t.name
      `);
      const results: SchemaSearchMatch[] = [];
      for (const row of tableResult.recordset) {
        results.push({
          schema: row.schema_name as string,
          table: row.table_name as string,
          matchType: 'table',
        });
      }

      if (results.length < limit) {
        const colReq = pool.request();
        colReq
          .input('term', sql.NVarChar, term)
          .input('limit', sql.Int, limit - results.length)
          .input('schema', sql.NVarChar, schema);
        const colResult = await colReq.query(`
          SELECT TOP (@limit)
            c.name AS column_name,
            ty.name AS type_name,
            t.name AS table_name,
            s.name AS schema_name
          FROM sys.columns c
          JOIN sys.tables t ON c.object_id = t.object_id
          JOIN sys.schemas s ON t.schema_id = s.schema_id
          JOIN sys.types ty ON c.user_type_id = ty.user_type_id
          WHERE s.name = @schema AND c.name LIKE @term
          ORDER BY t.name, c.column_id
        `);
        for (const row of colResult.recordset) {
          results.push({
            schema: row.schema_name as string,
            table: row.table_name as string,
            column: row.column_name as string,
            columnType: row.type_name as string,
            matchType: 'column',
          });
        }
      }

      return results.slice(0, limit);
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      await pool.connect();
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : tableId;

      // Row count
      const countReq = pool.request();
      const countResult = await countReq.query(`SELECT COUNT(*) AS cnt FROM ${escapeId(schema)}.${escapeId(table)}`);
      const rowCount = countResult.recordset[0]?.cnt as number;

      // Table size from sys.partitions + sys.allocation_units
      const sizeReq = pool.request().input('schema', sql.NVarChar, schema).input('table', sql.NVarChar, table);
      const sizeResult = await sizeReq.query(`
        SELECT
          SUM(a.total_pages) * 8 * 1024 AS total_bytes,
          SUM(a.used_pages) * 8 * 1024 AS used_bytes,
          SUM(a.data_pages) * 8 * 1024 AS data_bytes
        FROM sys.partitions p
        JOIN sys.allocation_units a ON p.partition_id = a.container_id
        JOIN sys.tables t ON p.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table
      `);
      const totalBytes = (sizeResult.recordset[0]?.total_bytes as number) ?? 0;

      // Index size
      const idxSizeReq = pool.request().input('schema', sql.NVarChar, schema).input('table', sql.NVarChar, table);
      const idxSizeResult = await idxSizeReq.query(`
        SELECT
          SUM(a.total_pages) * 8 * 1024 AS index_bytes
        FROM sys.partitions p
        JOIN sys.allocation_units a ON p.partition_id = a.container_id
        JOIN sys.tables t ON p.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.indexes i ON p.object_id = i.object_id AND p.index_id = i.index_id
        WHERE s.name = @schema AND t.name = @table AND i.type > 1
      `);
      const indexesBytes = (idxSizeResult.recordset[0]?.index_bytes as number) ?? 0;

      return {
        tableId,
        name: table,
        schema,
        rowEstimate: rowCount,
        totalBytes,
        indexesBytes,
        toastBytes: 0,
        bloatBytes: 0,
        bloatPercent: 0,
        lastVacuum: null,
        lastAutovacuum: null,
        lastAnalyze: null,
        lastAutoanalyze: null,
        vacuumCount: 0,
        autovacuumCount: 0,
        nLiveTup: rowCount,
        nDeadTup: 0,
      };
    },

    async getIndexStats(tableId: string): Promise<IndexStats[]> {
      await pool.connect();
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : tableId;

      const req = pool.request().input('schema', sql.NVarChar, schema).input('table', sql.NVarChar, table);
      const result = await req.query(`
        SELECT
          i.name AS index_name,
          i.is_unique,
          i.is_primary_key,
          i.type_desc AS method,
          STUFF((
            SELECT ',' + c.name
            FROM sys.index_columns ic2
            JOIN sys.columns c ON ic2.object_id = c.object_id AND ic2.column_id = c.column_id
            WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id
              AND ic2.is_included_column = 0
            ORDER BY ic2.key_ordinal
            FOR XML PATH('')
          ), 1, 1, '') AS columns_csv,
          SUM(a.total_pages) * 8 * 1024 AS size_bytes,
          us.user_seeks AS scans,
          us.user_scans + us.user_seeks AS reads
        FROM sys.indexes i
        JOIN sys.tables t ON i.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        LEFT JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
        LEFT JOIN sys.allocation_units a ON p.partition_id = a.container_id
        LEFT JOIN sys.dm_db_index_usage_stats us
          ON i.object_id = us.object_id AND i.index_id = us.index_id AND us.database_id = DB_ID()
        WHERE s.name = @schema AND t.name = @table AND i.name IS NOT NULL
        GROUP BY i.name, i.is_unique, i.is_primary_key, i.type_desc, us.user_seeks, us.user_scans
        ORDER BY i.name
      `);

      return result.recordset.map((r) => ({
        name: r.index_name as string,
        table: tableId,
        columns: (r.columns_csv as string)?.split(',').filter(Boolean) ?? [],
        unique: !!r.is_unique,
        primary: !!r.is_primary_key,
        method: r.method as string | undefined,
        sizeBytes: (r.size_bytes as number) ?? 0,
        scans: (r.scans as number) ?? 0,
        reads: (r.reads as number) ?? 0,
        usagePercent: 0,
      }));
    },

    async getDatabaseSizes(schema?: string): Promise<DatabaseSize[]> {
      await pool.connect();
      const s = schema || 'dbo';
      const req = pool.request().input('schema', sql.NVarChar, s);
      const result = await req.query(`
        SELECT
          s.name AS schema_name,
          t.name AS table_name,
          SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows ELSE 0 END) AS row_count,
          SUM(a.total_pages) * 8 * 1024 AS total_bytes,
          SUM(CASE WHEN i.type > 1 THEN a.total_pages ELSE 0 END) * 8 * 1024 AS index_bytes
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.partitions p ON t.object_id = p.object_id
        JOIN sys.allocation_units a ON p.partition_id = a.container_id
        LEFT JOIN sys.indexes i ON p.object_id = i.object_id AND p.index_id = i.index_id
        WHERE s.name = @schema
        GROUP BY s.name, t.name
        ORDER BY total_bytes DESC
      `);

      return result.recordset.map((r) => ({
        schema: r.schema_name as string,
        table: r.table_name as string,
        sizeBytes: ((r.total_bytes as number) ?? 0) - ((r.index_bytes as number) ?? 0),
        indexBytes: (r.index_bytes as number) ?? 0,
        totalBytes: (r.total_bytes as number) ?? 0,
        rowEstimate: (r.row_count as number) ?? 0,
      }));
    },

    async getActiveConnections(): Promise<ConnectionInfo[]> {
      await pool.connect();
      const result = await pool.request().query(`
        SELECT
          c.session_id AS pid,
          login_name AS usename,
          program_name AS application_name,
          client_net_address AS client_addr,
          connect_time AS backend_start,
          status AS state,
          text AS query,
          last_request_start_time AS query_start,
          wait_type AS wait_event_type,
          wait_resource AS wait_event,
          DATEDIFF(second, last_request_start_time, GETUTCDATE()) AS duration_seconds
        FROM sys.dm_exec_connections c
        JOIN sys.dm_exec_sessions s ON c.session_id = s.session_id
        OUTER APPLY sys.dm_exec_sql_text(c.most_recent_sql_handle) AS st
        ORDER BY c.session_id
      `);

      return result.recordset.map((r) => ({
        pid: r.pid as number,
        usename: (r.usename as string) ?? '',
        applicationName: (r.application_name as string) ?? '',
        clientAddr: (r.client_addr as string) ?? null,
        backendStart: r.backend_start ? new Date(r.backend_start).toISOString() : new Date().toISOString(),
        state: (r.state as string) ?? 'unknown',
        query: (r.query as string) ?? null,
        queryStart: r.query_start ? new Date(r.query_start).toISOString() : null,
        waitEventType: (r.wait_event_type as string) ?? null,
        waitEvent: (r.wait_event as string) ?? null,
        durationSeconds: (r.duration_seconds as number) ?? 0,
      }));
    },

    async close(): Promise<void> {
      try {
        await pool.close();
      } catch {}
    },
  };
}
