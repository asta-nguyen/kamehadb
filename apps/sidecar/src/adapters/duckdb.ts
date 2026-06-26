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
  TableStats,
} from '@kamehadb/shared';
import type { DuckDBInstance as DuckDBInst, DuckDBConnection as DuckDBConn } from '@duckdb/node-api';

export async function testDuckDBConnection(filePath: string): Promise<TestConnectionResult> {
  let inst: DuckDBInst | null = null;
  let conn: DuckDBConn | null = null;
  try {
    const { DuckDBInstance } = await import('@duckdb/node-api');
    inst = await DuckDBInstance.create(filePath);
    conn = await inst.connect();
    const reader = await conn.runAndReadAll('SELECT version() AS version');
    const rawRows = reader.getRowObjects();
    const rows = rawRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        out[key] = typeof val === 'bigint' ? Number(val) : val;
      }
      return out;
    });
    return { success: true, serverVersion: String(rows[0]?.version || '') };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
  } finally {
    conn?.closeSync();
    inst?.closeSync();
  }
}

function escapeId(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"';
}

function escapeVal(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}

export function createDuckDbAdapter(filePath: string): SqlAdapter {
  let inst: DuckDBInst | null = null;
  let conn: DuckDBConn | null = null;
  let initPromise: Promise<void> | null = null;

  async function ensureDb() {
    if (conn) return;
    if (!initPromise) {
      initPromise = (async () => {
        const { DuckDBInstance } = await import('@duckdb/node-api');
        inst = await DuckDBInstance.create(filePath);
        conn = await inst.connect();
      })();
    }
    await initPromise;
    initPromise = null;
  }

  function convertBigInt(val: unknown): unknown {
    if (typeof val === 'bigint') {
      return val > Number.MAX_SAFE_INTEGER || val < -Number.MAX_SAFE_INTEGER ? val.toString() : Number(val);
    }
    if (Array.isArray(val)) return val.map(convertBigInt);
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) out[k] = convertBigInt(v);
      return out;
    }
    return val;
  }

  async function q<T>(sql: string): Promise<T[]> {
    await ensureDb();
    const reader = await conn!.runAndReadAll(sql);
    const rows = reader.getRowObjects() as Record<string, unknown>[];
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        out[key] = convertBigInt(val);
      }
      return out as T;
    });
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      try {
        const rows = await q<Record<string, string>>('SELECT version() AS version');
        return { success: true, serverVersion: rows[0]?.version || '' };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
      }
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const rows = await q<Record<string, string>>('SELECT current_database() AS name');
      return rows.map((r) => ({ name: r.name }));
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      const rows = await q<Record<string, string>>(
        "SELECT DISTINCT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name != 'information_schema' ORDER BY schema_name",
      );
      return rows.map((r) => ({ name: r.name }));
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      const s = schema || 'main';
      const rows = await q<Record<string, string>>(
        `SELECT table_name AS name, table_schema AS schema_name FROM information_schema.tables WHERE table_schema = ${escapeVal(s)} AND table_type = 'BASE TABLE' ORDER BY table_name`,
      );
      return rows.map((r) => ({
        id: `${r.schema_name}.${r.name}`,
        name: r.name,
        schema: r.schema_name,
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'main';
      const table = parts.length > 1 ? parts[1] : tableId;
      const rows = await q<Record<string, unknown>>(
        `SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS default,
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_schema = ${escapeVal(schema)} AND tc.table_name = ${escapeVal(table)}
             AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
           LIMIT 1) AS primary_key
         FROM information_schema.columns c
         WHERE table_schema = ${escapeVal(schema)} AND table_name = ${escapeVal(table)}
         ORDER BY ordinal_position`,
      );
      return rows.map((r) => ({
        name: r.name as string,
        type: r.type as string,
        nullable: r.nullable === 'YES',
        default: r['default'] === null ? null : String(r['default']),
        primaryKey: r.primary_key === true,
      }));
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'main';
      const table = parts.length > 1 ? parts[1] : tableId;
      const rows = await q<Record<string, unknown>>(
        `SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_catalog = kcu.constraint_catalog
          AND tc.constraint_schema = kcu.constraint_schema
          AND tc.constraint_name = kcu.constraint_name
         WHERE tc.table_schema = ${escapeVal(schema)} AND tc.table_name = ${escapeVal(table)}
           AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
         ORDER BY tc.constraint_name, kcu.ordinal_position`,
      );
      const indexMap = new Map<string, IndexInfo>();
      for (const row of rows) {
        const name = row.constraint_name as string;
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            columns: [],
            unique: (row.constraint_type as string) === 'UNIQUE',
            primary: (row.constraint_type as string) === 'PRIMARY KEY',
          });
        }
        indexMap.get(name)!.columns.push(row.column_name as string);
      }
      return Array.from(indexMap.values());
    },

    async getCompletions(schema?: string): Promise<import('@kamehadb/shared').TableCompletions[]> {
      const s = schema || 'main';
      const rows = await q<Record<string, unknown>>(
        `SELECT c.table_name, c.column_name, c.data_type AS type, c.is_nullable AS nullable, c.column_default AS default
         FROM information_schema.columns c
         WHERE c.table_schema = ${escapeVal(s)}
         ORDER BY c.table_name, c.ordinal_position`,
      );
      const tableMap = new Map<string, import('@kamehadb/shared').TableCompletions>();
      for (const row of rows) {
        const name = row.table_name as string;
        if (!tableMap.has(name)) {
          tableMap.set(name, { name, schema: s, columns: [] });
        }
        tableMap.get(name)!.columns.push({
          name: row.column_name as string,
          type: row.type as string,
          nullable: row.nullable === 'YES',
          default: row['default'] === null ? null : String(row['default']),
          primaryKey: false,
        });
      }
      return Array.from(tableMap.values());
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      const parts = input.tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'main';
      const table = parts.length > 1 ? parts[1] : input.tableId;
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;

      let sql = `SELECT * FROM ${escapeId(schema)}.${escapeId(table)}`;

      if (input.search) {
        const colRows = await q<Record<string, string>>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = ${escapeVal(schema)} AND table_name = ${escapeVal(table)} ORDER BY ordinal_position`,
        );
        const searchCols = colRows.map((r) => r.column_name);
        if (searchCols.length > 0) {
          const clauses = searchCols.map(
            (col) => `CAST(${escapeId(col)} AS VARCHAR) ILIKE ${escapeVal(`%${input.search!}%`)}`,
          );
          sql += ` WHERE ${clauses.join(' OR ')}`;
        }
      }

      if (input.sortColumn) {
        sql += ` ORDER BY ${escapeId(input.sortColumn)} ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }

      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const start = performance.now();
      const rows = await q<Record<string, unknown>>(sql);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] =
        rows.length > 0
          ? Object.keys(rows[0]).map((key) => ({
              name: key,
              type: typeof rows[0][key],
            }))
          : [];

      return {
        columns,
        rows: rows || [],
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
        rows.length > 0
          ? Object.keys(rows[0]).map((key) => ({
              name: key,
              type: typeof rows[0][key],
            }))
          : [];

      return {
        columns,
        rows: rows || [],
        rowCount: rows.length,
        durationMs: Math.round(durationMs),
        truncated: false,
      };
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const parts = tableId.split('.');
      const schema = parts.length > 1 ? parts[0] : 'main';
      const table = parts.length > 1 ? parts[1] : tableId;
      const countRows = await q<Record<string, unknown>>(
        `SELECT COUNT(*) AS cnt FROM ${escapeId(schema)}.${escapeId(table)}`,
      );
      const rowEstimate = Number(countRows[0]?.cnt) || 0;
      return {
        tableId,
        name: table,
        schema,
        rowEstimate,
        totalBytes: 0,
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

    async close(): Promise<void> {
      if (conn) {
        conn.closeSync();
        conn = null;
      }
      if (inst) {
        inst.closeSync();
        inst = null;
      }
    },
  };
}
