import oracledb from 'oracledb';
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

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

export async function testOracleConnection(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): Promise<TestConnectionResult> {
  const conn = await oracledb.getConnection({
    connectString: `${connection.host || 'localhost'}:${connection.port || 1521}/${connection.database || 'XE'}`,
    user: connection.username,
    password: connection.password,
  });
  try {
    const result = await conn.execute("SELECT * FROM v$version WHERE banner LIKE 'Oracle%'");
    const version = (result.rows?.[0] as Record<string, string> | undefined)?.BANNER || '';
    return { success: true, serverVersion: version };
  } finally {
    await conn.close();
  }
}

export function createOracleAdapter(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}): SqlAdapter {
  const connectString = `${connection.host || 'localhost'}:${connection.port || 1521}/${connection.database || 'XE'}`;

  async function getConn() {
    return oracledb.getConnection({
      connectString,
      user: connection.username,
      password: connection.password,
    });
  }

  function escapeId(id: string): string {
    return '"' + id.replace(/"/g, '""') + '"';
  }

  function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        if (val && typeof val === 'object' && typeof (val as { getData?: unknown }).getData === 'function') {
          // Oracle LOB object — replaced with placeholder to avoid circular JSON references
          out[key] = '[CLOB]';
        } else if (val instanceof Date) {
          out[key] = val.toISOString();
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          // Avoid circular references from Oracle metadata objects
          try {
            JSON.stringify(val);
            out[key] = val;
          } catch {
            out[key] = String(val);
          }
        } else {
          out[key] = val;
        }
      }
      return out;
    });
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const conn = await getConn();
      try {
        const result = await conn.execute("SELECT * FROM v$version WHERE banner LIKE 'Oracle%'");
        return { success: true, serverVersion: String((result.rows?.[0] as Record<string, string>)?.BANNER || '') };
      } finally {
        await conn.close();
      }
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const conn = await getConn();
      try {
        const result = await conn.execute('SELECT name FROM v$database');
        return (result.rows as Record<string, string>[]).map((r) => ({ name: r.NAME }));
      } finally {
        await conn.close();
      }
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      const conn = await getConn();
      try {
        const result = await conn.execute('SELECT username AS name FROM all_users ORDER BY username');
        return (result.rows as Record<string, string>[]).map((r) => ({ name: r.NAME }));
      } finally {
        await conn.close();
      }
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      const conn = await getConn();
      try {
        const owner = schema?.toUpperCase() || connection.username?.toUpperCase();
        const result = await conn.execute(
          `SELECT table_name AS name, owner AS schema_name FROM all_tables WHERE owner = :owner ORDER BY table_name`,
          { owner },
        );
        return (result.rows as Record<string, string>[]).map((r) => ({
          id: `${r.SCHEMA_NAME}.${r.NAME}`,
          name: r.NAME,
          schema: r.SCHEMA_NAME,
        }));
      } finally {
        await conn.close();
      }
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const conn = await getConn();
      try {
        const parts = tableId.split('.');
        const owner = (parts.length > 1 ? parts[0] : connection.username)!.toUpperCase();
        const table = (parts.length > 1 ? parts[1] : tableId).toUpperCase();

        const colResult = await conn.execute(
          `SELECT column_name AS name, data_type AS type, nullable, data_default AS default_val
           FROM all_tab_cols WHERE owner = :owner AND table_name = :tbl ORDER BY column_id`,
          { owner, tbl: table },
        );

        const pkResult = await conn.execute(
          `SELECT cc.column_name FROM all_cons_columns cc
           JOIN all_constraints c ON cc.constraint_name = c.constraint_name AND cc.owner = c.owner
           WHERE cc.owner = :owner AND cc.table_name = :tbl AND c.constraint_type = 'P'`,
          { owner, tbl: table },
        );

        const pkColumns = new Set((pkResult.rows as Record<string, string>[]).map((r) => r.COLUMN_NAME));

        return (colResult.rows as Record<string, unknown>[]).map((r) => ({
          name: r.NAME as string,
          type: r.TYPE as string,
          nullable: r.NULLABLE === 'Y',
          default: r.DEFAULT_VAL === null || r.DEFAULT_VAL === undefined ? null : String(r.DEFAULT_VAL),
          primaryKey: pkColumns.has(r.NAME as string),
        }));
      } finally {
        await conn.close();
      }
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      const conn = await getConn();
      try {
        const parts = tableId.split('.');
        const owner = (parts.length > 1 ? parts[0] : connection.username)!.toUpperCase();
        const table = (parts.length > 1 ? parts[1] : tableId).toUpperCase();
        const result = await conn.execute(
          `SELECT
            i.index_name, i.column_name, i.descend,
            ix.uniqueness,
            ac.constraint_type
          FROM all_ind_columns i
          JOIN all_indexes ix ON i.index_name = ix.index_name AND i.table_owner = ix.owner
          LEFT JOIN all_constraints ac ON ac.index_name = ix.index_name AND ac.owner = ix.owner AND ac.constraint_type = 'P'
          WHERE i.table_owner = :owner AND i.table_name = :tbl
          ORDER BY i.index_name, i.column_position`,
          { owner, tbl: table },
        );
        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows as Record<string, unknown>[]) {
          const name = row.INDEX_NAME as string;
          if (!indexMap.has(name)) {
            indexMap.set(name, {
              name,
              columns: [],
              unique: row.UNIQUENESS === 'UNIQUE',
              primary: row.CONSTRAINT_TYPE === 'P',
            });
          }
          indexMap.get(name)!.columns.push(row.COLUMN_NAME as string);
        }
        return Array.from(indexMap.values());
      } finally {
        await conn.close();
      }
    },

    async getCompletions(schema?: string): Promise<TableCompletions[]> {
      const conn = await getConn();
      try {
        const owner = schema?.toUpperCase() || connection.username?.toUpperCase();
        const result = await conn.execute(
          `SELECT
            c.table_name, c.column_name, c.data_type AS type, c.nullable, c.data_default AS default_val
          FROM all_tab_cols c
          WHERE c.owner = :owner
          ORDER BY c.table_name, c.column_id`,
          { owner },
        );
        const tableMap = new Map<string, TableCompletions>();
        for (const row of result.rows as Record<string, unknown>[]) {
          const name = row.TABLE_NAME as string;
          if (!tableMap.has(name)) {
            tableMap.set(name, { name, schema: owner!, columns: [] });
          }
          tableMap.get(name)!.columns.push({
            name: row.COLUMN_NAME as string,
            type: row.TYPE as string,
            nullable: row.NULLABLE === 'Y',
            default: row.DEFAULT_VAL === null || row.DEFAULT_VAL === undefined ? null : String(row.DEFAULT_VAL),
            primaryKey: false,
          });
        }
        return Array.from(tableMap.values());
      } finally {
        await conn.close();
      }
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      const conn = await getConn();
      try {
        const parts = input.tableId.split('.');
        const owner = (parts.length > 1 ? parts[0] : connection.username)!.toUpperCase();
        const table = (parts.length > 1 ? parts[1] : input.tableId).toUpperCase();
        const offset = input.offset ?? 0;
        const limit = input.limit ?? 100;

        let q = `SELECT * FROM ${escapeId(owner!)}.${escapeId(table)}`;

        if (input.search) {
          const colResult = await conn.execute(
            `SELECT column_name FROM all_tab_cols WHERE owner = :owner AND table_name = :tbl ORDER BY column_id`,
            { owner, tbl: table },
          );
          const searchCols = (colResult.rows as Record<string, string>[]).map((r) => r.COLUMN_NAME as string);
          if (searchCols.length > 0) {
            const clauses = searchCols.map((col) => {
              return `LOWER(${escapeId(col)}) LIKE LOWER(:search)`;
            });
            q += ` WHERE ${clauses.join(' OR ')}`;
          }
        }

        if (input.sortColumn) {
          q += ` ORDER BY ${escapeId(input.sortColumn)} ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
        }

        // Oracle pagination
        q = `SELECT * FROM (SELECT a.*, ROWNUM rnum FROM (${q}) a WHERE ROWNUM <= ${offset + limit}) WHERE rnum > ${offset}`;

        const start = performance.now();
        const result = await conn.execute(q, input.search ? { search: `%${input.search}%` } : {});
        const durationMs = performance.now() - start;

        const columns: QueryColumn[] =
          result.rows && result.rows.length > 0
            ? Object.keys(result.rows![0] as Record<string, unknown>).map((key) => ({
                name: key,
                type: typeof (result.rows![0] as Record<string, unknown>)[key],
              }))
            : [];

        return {
          columns,
          rows: serializeRows((result.rows as Record<string, unknown>[]) || []),
          rowCount: result.rows?.length || 0,
          durationMs: Math.round(durationMs),
          truncated: (result.rows?.length || 0) >= limit,
        };
      } finally {
        await conn.close();
      }
    },

    async runQuery(input: RunQueryInput): Promise<QueryResult> {
      const conn = await getConn();
      try {
        const start = performance.now();
        const result = await conn.execute(input.query, input.params || {}, { autoCommit: true });
        const durationMs = performance.now() - start;

        const columns: QueryColumn[] =
          result.rows && result.rows.length > 0
            ? Object.keys(result.rows![0] as Record<string, unknown>).map((key) => ({
                name: key,
                type: typeof (result.rows![0] as Record<string, unknown>)[key],
              }))
            : [];

        return {
          columns,
          rows: serializeRows((result.rows as Record<string, unknown>[]) || []),
          rowCount: result.rows?.length || 0,
          durationMs: Math.round(durationMs),
          truncated: false,
        };
      } finally {
        await conn.close();
      }
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const conn = await getConn();
      try {
        const parts = tableId.split('.');
        const owner = (parts.length > 1 ? parts[0] : connection.username)!.toUpperCase();
        const table = (parts.length > 1 ? parts[1] : tableId).toUpperCase();
        const result = await conn.execute(
          `SELECT
            (SELECT num_rows FROM all_tables WHERE owner = :owner AND table_name = :tbl) AS num_rows,
            (SELECT NVL(SUM(bytes), 0) FROM user_segments WHERE segment_name = :tbl AND segment_type = 'TABLE') AS table_bytes,
            (SELECT NVL(SUM(s.bytes), 0) FROM user_segments s
             JOIN user_indexes ix ON s.segment_name = ix.index_name
             WHERE ix.table_name = :tbl) AS index_bytes
           FROM dual`,
          { owner, tbl: table },
        );
        const row = (result.rows as Record<string, unknown>[])?.[0];
        const numRows = row ? Number(row.NUM_ROWS) || 0 : 0;
        return {
          tableId,
          name: table,
          schema: owner,
          rowEstimate: numRows,
          totalBytes: row ? Number(row.TABLE_BYTES) || 0 : 0,
          indexesBytes: row ? Number(row.INDEX_BYTES) || 0 : 0,
          toastBytes: 0,
          bloatBytes: 0,
          bloatPercent: 0,
          lastVacuum: null,
          lastAutovacuum: null,
          lastAnalyze: null,
          lastAutoanalyze: null,
          vacuumCount: 0,
          autovacuumCount: 0,
          nLiveTup: numRows,
          nDeadTup: 0,
        };
      } finally {
        await conn.close();
      }
    },

    async close(): Promise<void> {},
  };
}
