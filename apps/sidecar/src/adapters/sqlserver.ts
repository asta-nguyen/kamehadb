import sql from 'mssql';
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
} from '@kamehadb/shared';

export async function testSqlServerConnection(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): Promise<TestConnectionResult> {
  const pool = new sql.ConnectionPool({
    server: connection.host || 'localhost',
    port: connection.port || 1433,
    database: connection.database || 'master',
    user: connection.username,
    password: connection.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 5000,
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

export function createSqlServerAdapter(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): SqlAdapter {
  const pool = new sql.ConnectionPool({
    server: connection.host || 'localhost',
    port: connection.port || 1433,
    database: connection.database || 'master',
    user: connection.username,
    password: connection.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 10000,
      requestTimeout: 30000,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
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
            CASE WHEN k.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS primary_key,
            CASE WHEN EXISTS (
              SELECT 1
              FROM sys.check_constraints chk
              WHERE chk.parent_object_id = OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME)
                AND chk.definition LIKE '%ISJSON%'
                AND (
                  (chk.parent_column_id <> 0
                    AND chk.parent_column_id = COL_ID(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME))
                  OR
                  (chk.parent_column_id = 0
                    AND EXISTS (
                      SELECT 1 FROM sys.sql_expression_dependencies sed
                      WHERE sed.referencing_id = chk.object_id
                        AND sed.referenced_minor_id = COL_ID(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME)
                    ))
                )
            ) THEN 1 ELSE 0 END AS is_json
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
        isJson: !!r.is_json,
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

    async close(): Promise<void> {
      try {
        await pool.close();
      } catch {}
    },
  };
}
