import pg from "pg";
import type { SqlAdapter, TestConnectionResult, DatabaseInfo, SchemaInfo, TableInfo, ColumnInfo, IndexInfo, PreviewRowsInput, QueryResult, RunQueryInput, QueryColumn } from "@kamehadb/shared";

const PG_TYPE_MAP: Record<number, string> = {
  16: "boolean",
  20: "bigint",
  21: "smallint",
  23: "integer",
  25: "text",
  700: "real",
  701: "double",
  1043: "varchar",
  1082: "date",
  1114: "timestamp",
  1184: "timestamptz",
  1700: "numeric",
};

function pgTypeName(oid: number): string {
  return PG_TYPE_MAP[oid] ?? "unknown";
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
    throw new Error("Database name is required");
  }
  if (!connection.username) {
    throw new Error("Username is required");
  }
  if (connection.password === undefined || connection.password === null) {
    throw new Error("Password is required");
  }

  const pool = new pg.Pool({
    host: connection.host || "localhost",
    port: connection.port || 5432,
    database: connection.database,
    user: connection.username,
    password: connection.password,
    ssl: connection.ssl
      ? { rejectUnauthorized: false }
      : false,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err.message);
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
        const result = await client.query("SELECT version()");
        return { success: true, serverVersion: result.rows[0]?.version as string };
      } finally {
        client.release();
      }
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      const result = await query("SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY name");
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

      const result = await query(sql, [schema || "public"]);
      return result.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        schema: r.schema as string,
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const [schema, table] = tableId.split(".");
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
        foreignKey: r.ref_table
          ? { table: r.ref_table as string, column: r.ref_column as string }
          : undefined,
      }));
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      const [schema, table] = tableId.split(".");
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
      const [schema, table] = input.tableId.split(".");
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;
      let sql = `SELECT * FROM "${schema}"."${table}"`;

      if (input.sortColumn) {
        sql += ` ORDER BY "${input.sortColumn}" ${input.sortDirection === "desc" ? "DESC" : "ASC"}`;
      }
      sql += ` LIMIT $1 OFFSET $2`;

      const start = performance.now();
      const result = await query(sql, [limit, offset]);
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
      if (err.message.includes("ECONNREFUSED")) {
        throw new Error(`Connection refused. Check if PostgreSQL is running on ${input.host}:${input.port}`);
      }
      if (err.message.includes("ENOTFOUND")) {
        throw new Error(`Host not found: ${input.host}. Check the hostname.`);
      }
      if (err.message.includes("authentication failed")) {
        throw new Error("Authentication failed. Check username and password.");
      }
      if (err.message.includes("database") && err.message.includes("does not exist")) {
        throw new Error(`Database "${input.database}" does not exist.`);
      }
      throw err;
    }
    throw new Error("Unknown error during connection test");
  } finally {
    await adapter.close();
  }
}
