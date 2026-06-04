import pg from 'pg';
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
  SchemaSearchInput,
  SchemaSearchMatch,
} from '@kamehadb/shared';

export type IndexStats = {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  sizeBytes: number;
  scans: number;
  reads: number;
  usagePercent: number;
};

export type TableStats = {
  tableId: string;
  name: string;
  schema: string;
  rowEstimate: number;
  totalBytes: number;
  indexesBytes: number;
  toastBytes: number;
  bloatBytes: number;
  bloatPercent: number;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
  lastAnalyze: string | null;
  lastAutoanalyze: string | null;
  vacuumCount: number;
  autovacuumCount: number;
  nLiveTup: number;
  nDeadTup: number;
};

export type DatabaseSize = {
  schema: string;
  table: string;
  sizeBytes: number;
  indexBytes: number;
  totalBytes: number;
  rowEstimate: number;
};

export type ConnectionInfo = {
  pid: number;
  usename: string;
  applicationName: string;
  clientAddr: string | null;
  backendStart: string;
  state: string;
  query: string | null;
  queryStart: string | null;
  waitEventType: string | null;
  waitEvent: string | null;
  durationSeconds: number;
};

const PG_TYPE_MAP: Record<number, string> = {
  16: 'boolean',
  20: 'bigint',
  21: 'smallint',
  23: 'integer',
  25: 'text',
  700: 'real',
  701: 'double',
  1043: 'varchar',
  1082: 'date',
  1114: 'timestamp',
  1184: 'timestamptz',
  1700: 'numeric',
};

function pgTypeName(oid: number): string {
  return PG_TYPE_MAP[oid] ?? 'unknown';
}

export function createPostgresAdapter(connection: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
}): SqlAdapter {
  // Validate required fields
  if (!connection.database) {
    throw new Error('Database name is required');
  }
  if (!connection.username) {
    throw new Error('Username is required');
  }
  if (connection.password === undefined || connection.password === null) {
    throw new Error('Password is required');
  }

  const pool = new pg.Pool({
    host: connection.host || 'localhost',
    port: connection.port || 5432,
    database: connection.database,
    user: connection.username,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });

  async function query(sql: string, params?: unknown[]) {
    const client = await pool.connect();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT version()');
        return { success: true, serverVersion: result.rows[0]?.version as string };
      } finally {
        client.release();
      }
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const result = await query('SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY name');
      return result.rows as DatabaseInfo[];
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      const result = await query(
        "SELECT schema_name as name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema') ORDER BY name",
      );
      return result.rows as SchemaInfo[];
    },

    async listTables(schema?: string): Promise<TableInfo[]> {
      const sql = `SELECT
        t.table_schema || '.' || t.table_name as id,
        t.table_name as name,
        t.table_schema as schema
      FROM information_schema.tables t
      WHERE t.table_schema = COALESCE($1, 'public') AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name`;

      const result = await query(sql, [schema || 'public']);
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        schema: r.schema as string,
      }));
    },

    async searchSchema(input: SchemaSearchInput): Promise<SchemaSearchMatch[]> {
      const schema = input.schema ?? 'public';
      const term = `%${input.query}%`;
      const limit = input.limit ?? 50;

      const sql = `SELECT
        t.table_schema,
        t.table_name,
        NULL AS column_name,
        NULL AS column_type,
        'table' AS match_type
      FROM information_schema.tables t
      WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE' AND t.table_name ILIKE $2
      UNION ALL
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        'column'
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.column_name ILIKE $2
      ORDER BY match_type, table_name, column_name
      LIMIT $3`;

      const result = await query(sql, [schema, term, limit]);
      return result.rows.map((r: Record<string, unknown>) => ({
        schema: r.table_schema as string,
        table: r.table_name as string,
        column: (r.column_name as string) || undefined,
        columnType: (r.column_type as string) || undefined,
        matchType: r.match_type as 'table' | 'column',
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const [schema, table] = tableId.split('.');
      const sql = `SELECT
        c.column_name as name,
        c.data_type as type,
        c.is_nullable = 'YES' as nullable,
        c.column_default as default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as primary_key,
        fk.ref_table, fk.ref_column
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT ku.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
      ) fk ON c.column_name = fk.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position`;

      const result = await query(sql, [schema, table]);
      return result.rows.map((r: Record<string, unknown>) => ({
        name: r.name as string,
        type: r.type as string,
        nullable: !!r.nullable,
        default: (r.default as string) ?? null,
        primaryKey: !!r.primary_key,
        foreignKey: r.ref_table ? { table: r.ref_table as string, column: r.ref_column as string } : undefined,
      }));
    },

    async getCompletions(schema?: string): Promise<TableCompletions[]> {
      const sql = `WITH pk_cols AS (
        SELECT ku.table_schema, ku.table_name, ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_catalog = ku.constraint_catalog
          AND tc.constraint_schema = ku.constraint_schema
          AND tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
      ), fk_cols AS (
        SELECT ku.table_schema, ku.table_name, ku.column_name,
               ccu.table_name AS ref_table, ccu.column_name AS ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_catalog = ku.constraint_catalog
          AND tc.constraint_schema = ku.constraint_schema
          AND tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_catalog = ccu.constraint_catalog
          AND tc.constraint_schema = ccu.constraint_schema
          AND tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
      )
      SELECT
        c.table_name,
        c.table_schema,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS primary_key,
        fk.ref_table,
        fk.ref_column
      FROM information_schema.columns c
      LEFT JOIN pk_cols pk
        ON c.table_schema = pk.table_schema
        AND c.table_name = pk.table_name
        AND c.column_name = pk.column_name
      LEFT JOIN fk_cols fk
        ON c.table_schema = fk.table_schema
        AND c.table_name = fk.table_name
        AND c.column_name = fk.column_name
      WHERE c.table_schema = $1
        AND c.table_name IN (
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        )
      ORDER BY c.table_name, c.ordinal_position`;

      const schemaName = schema || 'public';
      const result = await query(sql, [schemaName]);
      const tableMap = new Map<string, TableCompletions>();
      for (const row of result.rows as Record<string, unknown>[]) {
        const name = row.table_name as string;
        if (!tableMap.has(name)) {
          tableMap.set(name, { name, schema: row.table_schema as string, columns: [] });
        }
        tableMap.get(name)!.columns.push({
          name: row.column_name as string,
          type: row.data_type as string,
          nullable: row.is_nullable === 'YES',
          default: (row.column_default as string) ?? null,
          primaryKey: !!row.primary_key,
          foreignKey: row.ref_table ? { table: row.ref_table as string, column: row.ref_column as string } : undefined,
        });
      }
      return Array.from(tableMap.values());
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      const [schema, table] = tableId.split('.');
      const sql = `SELECT
        i.relname as name,
        a.attname as column_name,
        ix.indisunique as unique,
        ix.indisprimary as primary
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = $2
      ORDER BY i.relname, a.attnum`;

      const result = await query(sql, [schema, table]);

      const indexMap = new Map<string, IndexInfo>();
      for (const row of result.rows as Record<string, unknown>[]) {
        const name = row.name as string;
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            columns: [],
            unique: !!row.unique,
            primary: !!row.primary,
          });
        }
        indexMap.get(name)!.columns.push(row.column_name as string);
      }

      return Array.from(indexMap.values());
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      const [schema, table] = input.tableId.split('.');
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;
      const params: unknown[] = [];
      let sql = `SELECT * FROM "${schema}"."${table}"`;

      if (input.search) {
        const colResult = await query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
          [schema, table],
        );
        const searchCols = colResult.rows.map((r: any) => r.column_name as string);
        if (searchCols.length > 0) {
          const clauses = searchCols.map((col, i) => `"${col}"::text ILIKE $${i + 1}`);
          sql += ` WHERE ${clauses.join(' OR ')}`;
          params.push(...searchCols.map(() => `%${input.search!}%`));
        }
      }

      if (input.sortColumn) {
        sql += ` ORDER BY "${input.sortColumn}" ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }

      params.push(limit, offset);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const start = performance.now();
      const result = await query(sql, params);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] = result.fields.map((f) => ({
        name: f.name,
        type: pgTypeName(f.dataTypeID),
        nullable: true,
      }));

      return {
        columns,
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rows.length,
        durationMs: Math.round(durationMs),
        truncated: result.rows.length >= limit,
      };
    },

    async runQuery(input: RunQueryInput): Promise<QueryResult> {
      const start = performance.now();
      const result = await query(input.query, input.params);
      const durationMs = performance.now() - start;

      const columns: QueryColumn[] = (result.fields ?? []).map((f) => ({
        name: f.name,
        type: pgTypeName(f.dataTypeID),
      }));

      return {
        columns,
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rows.length,
        durationMs: Math.round(durationMs),
        truncated: false,
      };
    },

    async getIndexStats(tableId: string): Promise<IndexStats[]> {
      const [schema, table] = tableId.split('.');
      const sql = `SELECT
        i.relname as name,
        t.relname as table_name,
        a.attname as column_name,
        ix.indisunique as unique_index,
        ix.indisprimary as primary_index,
        pg_relation_size(i.oid) as size_bytes
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = $2
      ORDER BY i.relname, a.attnum`;

      const result = await query(sql, [schema, table]);

      const indexMap = new Map<string, IndexStats>();
      for (const row of result.rows as Record<string, unknown>[]) {
        const name = row.name as string;
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            table: row.table_name as string,
            columns: [],
            unique: !!row.unique_index,
            primary: !!row.primary_index,
            sizeBytes: Number(row.size_bytes) || 0,
            scans: 0,
            reads: 0,
            usagePercent: 0,
          });
        }
        indexMap.get(name)!.columns.push(row.column_name as string);
      }

      return Array.from(indexMap.values());
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const [schema, table] = tableId.split('.');
      const sql = `SELECT
        t.relname as name,
        n.nspname as schema,
        s.n_live_tup as row_estimate,
        pg_total_relation_size(t.oid) as total_bytes,
        COALESCE(pg_indexes_size(t.oid), 0) as indexes_bytes,
        COALESCE(pg_relation_size(t.oid) - pg_table_size(t.oid), 0) as toast_bytes,
        (pg_total_relation_size(t.oid) - pg_table_size(t.oid)) as bloat_bytes,
        100.0 * (pg_total_relation_size(t.oid) - pg_table_size(t.oid)) / NULLIF(pg_total_relation_size(t.oid), 0) as bloat_percent,
        s.last_vacuum,
        s.last_autovacuum,
        s.last_analyze,
        s.last_autoanalyze,
        s.vacuum_count,
        s.autovacuum_count,
        COALESCE(s.n_live_tup, 0) as n_live_tup,
        COALESCE(s.n_dead_tup, 0) as n_dead_tup
      FROM pg_stat_user_tables s
      JOIN pg_class t ON t.oid = s.relid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = $2`;

      const result = await query(sql, [schema, table]);
      const row = (result.rows as Record<string, unknown>[])[0];

      return {
        tableId,
        name: (row?.name as string) ?? table,
        schema: (row?.schema as string) ?? schema,
        rowEstimate: Number(row?.row_estimate) || 0,
        totalBytes: Number(row?.total_bytes) || 0,
        indexesBytes: Number(row?.indexes_bytes) || 0,
        toastBytes: Number(row?.toast_bytes) || 0,
        bloatBytes: Number(row?.bloat_bytes) || 0,
        bloatPercent: Number(row?.bloat_percent) || 0,
        lastVacuum: (row?.last_vacuum as string) || null,
        lastAutovacuum: (row?.last_autovacuum as string) || null,
        lastAnalyze: (row?.last_analyze as string) || null,
        lastAutoanalyze: (row?.last_autoanalyze as string) || null,
        vacuumCount: Number(row?.vacuum_count) || 0,
        autovacuumCount: Number(row?.autovacuum_count) || 0,
        nLiveTup: Number(row?.n_live_tup) || 0,
        nDeadTup: Number(row?.n_dead_tup) || 0,
      };
    },

    async getDatabaseSizes(schema?: string): Promise<DatabaseSize[]> {
      const sql = `SELECT
        n.nspname as schema,
        c.relname as table,
        pg_relation_size(c.oid) as size_bytes,
        COALESCE(pg_indexes_size(c.oid), 0) as index_bytes,
        pg_total_relation_size(c.oid) as total_bytes,
        s.n_live_tup as row_estimate
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname = COALESCE($1, n.nspname)
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 100`;

      const result = await query(sql, [schema || null]);
      return (result.rows as Record<string, unknown>[]).map((r) => ({
        schema: r.schema as string,
        table: r.table as string,
        sizeBytes: Number(r.size_bytes) || 0,
        indexBytes: Number(r.index_bytes) || 0,
        totalBytes: Number(r.total_bytes) || 0,
        rowEstimate: Number(r.row_estimate) || 0,
      }));
    },

    async getActiveConnections(): Promise<ConnectionInfo[]> {
      const sql = `SELECT
        pid,
        usename,
        application_name as applicationName,
        client_addr::text as clientAddr,
        backend_start::text as backendStart,
        state,
        query,
        query_start::text as queryStart,
        wait_event_type as waitEventType,
        wait_event as waitEvent,
        EXTRACT(EPOCH FROM (now() - query_start))::bigint as durationSeconds
      FROM pg_stat_activity
      WHERE datname = current_database()
      ORDER BY state, query_start`;

      const result = await query(sql);
      return (result.rows as Record<string, unknown>[]).map((r) => ({
        pid: Number(r.pid),
        usename: (r.usename as string) || '',
        applicationName: (r.applicationName as string) || '',
        clientAddr: (r.clientAddr as string) || null,
        backendStart: (r.backendStart as string) || '',
        state: (r.state as string) || '',
        query: r.query as string | null,
        queryStart: (r.queryStart as string) || null,
        waitEventType: (r.waitEventType as string) || null,
        waitEvent: (r.waitEvent as string) || null,
        durationSeconds: Number(r.durationSeconds) || 0,
      }));
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export async function testPostgresConnection(input: {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
}): Promise<TestConnectionResult> {
  const adapter = createPostgresAdapter(input);
  try {
    return await adapter.testConnection();
  } catch (err) {
    if (err instanceof Error) {
      // Provide more helpful error messages for common issues
      if (err.message.includes('ECONNREFUSED')) {
        throw new Error(`Connection refused. Check if PostgreSQL is running on ${input.host}:${input.port}`);
      }
      if (err.message.includes('ENOTFOUND')) {
        throw new Error(`Host not found: ${input.host}. Check the hostname.`);
      }
      if (err.message.includes('authentication failed')) {
        throw new Error('Authentication failed. Check username and password.');
      }
      if (err.message.includes('database') && err.message.includes('does not exist')) {
        throw new Error(`Database "${input.database}" does not exist.`);
      }
      throw err;
    }
    throw new Error('Unknown error during connection test');
  } finally {
    await adapter.close();
  }
}
