import Database from 'better-sqlite3';
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
  IndexStats,
  DatabaseSize,
  ConnectionInfo,
} from '@kamehadb/shared';

export function createSqliteAdapter(filePath: string): SqlAdapter {
  const db = new Database(filePath, { readonly: true });

  return {
    async testConnection(): Promise<TestConnectionResult> {
      const result = db.prepare('SELECT sqlite_version() as version').get() as { version: string };
      return { success: true, serverVersion: result.version };
    },

    async listDatabases(): Promise<DatabaseInfo[]> {
      return [{ name: 'main' }];
    },

    async listSchemas(): Promise<SchemaInfo[]> {
      return [{ name: 'main' }];
    },

    async listTables(): Promise<TableInfo[]> {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as { name: string }[];

      return rows.map((r) => ({
        id: r.name,
        name: r.name,
      }));
    },

    async getTableColumns(tableId: string): Promise<ColumnInfo[]> {
      const result = db.prepare(`PRAGMA table_info("${tableId}")`).all() as {
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      // Get foreign keys
      const fkResult = db.prepare(`PRAGMA foreign_key_list("${tableId}")`).all() as {
        from: string;
        table: string;
        to: string;
      }[];

      const fkMap = new Map<string, { table: string; column: string }>();
      for (const fk of fkResult) {
        fkMap.set(fk.from, { table: fk.table, column: fk.to });
      }

      return result.map((r) => ({
        name: r.name,
        type: r.type || 'text',
        nullable: !r.notnull,
        default: r.dflt_value,
        primaryKey: r.pk > 0,
        foreignKey: fkMap.get(r.name),
      }));
    },

    async getTableIndexes(tableId: string): Promise<IndexInfo[]> {
      const result = db.prepare(`PRAGMA index_list("${tableId}")`).all() as {
        name: string;
        unique: number;
        origin: string;
      }[];

      const indexes: IndexInfo[] = [];
      for (const idx of result) {
        const cols = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as {
          name: string;
        }[];
        indexes.push({
          name: idx.name,
          columns: cols.map((c) => c.name),
          unique: !!idx.unique,
          primary: idx.origin === 'pk',
        });
      }

      return indexes;
    },

    async previewRows(input: PreviewRowsInput): Promise<QueryResult> {
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 100;
      let sql = `SELECT * FROM "${input.tableId}"`;

      if (input.sortColumn) {
        sql += ` ORDER BY "${input.sortColumn}" ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }
      sql += ` LIMIT ? OFFSET ?`;

      const start = performance.now();
      const stmt = db.prepare(sql);
      const rows = stmt.all(limit, offset) as Record<string, unknown>[];
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
      const stmt = db.prepare(input.query);
      const rows = (input.params ? stmt.all(...(input.params as unknown[])) : stmt.all()) as Record<string, unknown>[];
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
      db.close();
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const rowCount = db.prepare(`SELECT COUNT(*) as count FROM "${tableId}"`).get() as { count: number };
      const totalBytes = db
        .prepare(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`)
        .get() as { size: number };

      return {
        tableId,
        name: tableId,
        schema: 'main',
        rowEstimate: rowCount.count,
        totalBytes: totalBytes.size,
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
        nLiveTup: rowCount.count,
        nDeadTup: 0,
      };
    },

    async getIndexStats(tableId: string): Promise<IndexStats[]> {
      const indexes = db.prepare(`PRAGMA index_list("${tableId}")`).all() as {
        name: string;
        unique: number;
        origin: string;
      }[];

      return indexes.map((idx) => {
        const cols = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as { name: string }[];
        const size = db
          .prepare(`SELECT idx_blksize * len as size FROM sqlite_master WHERE type='index' AND name='${idx.name}'`)
          .get() as { size: number } | undefined;

        return {
          name: idx.name,
          table: tableId,
          columns: cols.map((c) => c.name),
          unique: !!idx.unique,
          primary: idx.origin === 'pk',
          sizeBytes: size?.size || 0,
          scans: 0,
          reads: 0,
          usagePercent: 0,
        };
      });
    },

    async getDatabaseSizes(): Promise<DatabaseSize[]> {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as { name: string }[];

      return tables.map((t) => {
        const info = db
          .prepare(
            `SELECT page_count * page_size as size, (SELECT COUNT(*) FROM "${t.name}") as rows FROM pragma_page_count(), pragma_page_size()`,
          )
          .get() as { size: number; rows: number };
        return {
          schema: 'main',
          table: t.name,
          sizeBytes: info.size,
          indexBytes: 0,
          totalBytes: info.size,
          rowEstimate: info.rows,
        };
      });
    },

    async getActiveConnections(): Promise<ConnectionInfo[]> {
      return [
        {
          pid: 1,
          usename: 'sqlite',
          applicationName: 'kamehadb',
          clientAddr: null,
          backendStart: new Date().toISOString(),
          state: 'active',
          query: null,
          queryStart: null,
          waitEventType: null,
          waitEvent: null,
          durationSeconds: 0,
        },
      ];
    },
  };
}

export async function testSqliteConnection(filePath?: string): Promise<TestConnectionResult> {
  if (!filePath) {
    return { success: false, message: 'SQLite file path is required' };
  }

  try {
    const adapter = createSqliteAdapter(filePath);
    const result = await adapter.testConnection();
    adapter.close();
    return result;
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to open SQLite database',
    };
  }
}
