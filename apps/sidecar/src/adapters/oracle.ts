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
          [owner],
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
        const result = await conn.execute(
          `SELECT
            column_name AS name, data_type AS type, nullable,
            data_default AS default,
            (SELECT constraint_type FROM all_cons_columns ccl
             JOIN all_constraints con ON ccl.constraint_name = con.constraint_name
             WHERE ccl.table_name = :table AND ccl.column_name = cols.column_name
               AND con.constraint_type = 'P' AND ROWNUM = 1) AS primary_key
          FROM all_tab_cols cols
          WHERE owner = :owner AND table_name = :table2
          ORDER BY column_id`,
          [table, owner, table],
        );
        return (result.rows as Record<string, unknown>[]).map((r) => ({
          name: r.NAME as string,
          type: r.TYPE as string,
          nullable: r.NULLABLE === 'Y',
          default: r.DEFAULT === null ? null : String(r.DEFAULT),
          primaryKey: r.PRIMARY_KEY === 'P',
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
            ix.uniqueness, ix.constraint_index AS is_pk
          FROM all_ind_columns i
          JOIN all_indexes ix ON i.index_name = ix.index_name AND i.table_owner = ix.owner
          WHERE i.table_owner = :owner AND i.table_name = :table
          ORDER BY i.index_name, i.column_position`,
          [owner, table],
        );
        const indexMap = new Map<string, IndexInfo>();
        for (const row of result.rows as Record<string, unknown>[]) {
          const name = row.INDEX_NAME as string;
          if (!indexMap.has(name)) {
            indexMap.set(name, {
              name,
              columns: [],
              unique: row.UNIQUENESS === 'UNIQUE',
              primary: row.IS_PK === 'YES',
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
            c.table_name, c.column_name, c.data_type AS type, c.nullable, c.data_default AS default
          FROM all_tab_cols c
          WHERE c.owner = :owner
          ORDER BY c.table_name, c.column_id`,
          [owner],
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
            default: row.DEFAULT === null ? null : String(row.DEFAULT),
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
            `SELECT column_name FROM all_tab_cols WHERE owner = :owner AND table_name = :table ORDER BY column_id`,
            [owner, table],
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
          rows: (result.rows as Record<string, unknown>[]) || [],
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
          rows: (result.rows as Record<string, unknown>[]) || [],
          rowCount: result.rows?.length || 0,
          durationMs: Math.round(durationMs),
          truncated: false,
        };
      } finally {
        await conn.close();
      }
    },

    async close(): Promise<void> {},
  };
}
