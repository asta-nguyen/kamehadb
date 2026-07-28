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
  TableCompletions,
  SchemaSearchInput,
  SchemaSearchMatch,
} from '@kamehadb/shared';
import { safeErrorMessage } from '@kamehadb/shared';

export function createSqliteAdapter(filePath: string): SqlAdapter {
  const db = new Database(filePath, { readonly: false });

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
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' ORDER BY name",
        )
        .all() as { name: string }[];

      return rows.map((r) => ({
        id: r.name,
        name: r.name,
      }));
    },

    async searchSchema(input: SchemaSearchInput): Promise<SchemaSearchMatch[]> {
      const term = `%${input.query}%`;
      const limit = input.limit ?? 50;
      const results: SchemaSearchMatch[] = [];

      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' AND name LIKE ? ORDER BY name LIMIT ?`,
        )
        .all(term, limit) as { name: string }[];

      for (const t of tables) {
        results.push({ schema: 'main', table: t.name, matchType: 'table' });
      }

      if (results.length < limit) {
        const allTables = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' ORDER BY name",
          )
          .all() as { name: string }[];

        const colLimit = limit - results.length;
        let colCount = 0;

        for (const tbl of allTables) {
          if (colCount >= colLimit) break;
          const cols = db.prepare('SELECT * FROM pragma_table_info(?)').all(tbl.name) as {
            name: string;
            type: string;
          }[];
          for (const col of cols) {
            if (col.name.toLowerCase().includes(input.query.toLowerCase())) {
              results.push({
                schema: 'main',
                table: tbl.name,
                column: col.name,
                columnType: col.type || undefined,
                matchType: 'column',
              });
              colCount++;
              if (colCount >= colLimit) break;
            }
          }
        }
      }

      return results;
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

    async getCompletions(schema?: string): Promise<TableCompletions[]> {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE '%vec0%' ORDER BY name",
        )
        .all() as { name: string }[];
      const getColumns = db.prepare('SELECT * FROM pragma_table_info(?)');
      const getFKs = db.prepare('SELECT * FROM pragma_foreign_key_list(?)');

      const result: TableCompletions[] = [];
      for (const table of tables) {
        const cols = getColumns.all(table.name) as {
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[];
        const fks = getFKs.all(table.name) as { from: string; table: string; to: string }[];
        const fkMap = new Map<string, { table: string; column: string }>();
        for (const fk of fks) fkMap.set(fk.from, { table: fk.table, column: fk.to });

        result.push({
          name: table.name,
          columns: cols.map((c) => ({
            name: c.name,
            type: c.type || 'text',
            nullable: !c.notnull,
            default: c.dflt_value,
            primaryKey: c.pk > 0,
            foreignKey: fkMap.get(c.name),
          })),
        });
      }
      return result;
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
      const params: unknown[] = [];

      if (input.search) {
        const colResult = db.prepare(`PRAGMA table_info("${input.tableId}")`).all() as { name: string }[];
        const searchCols = colResult.map((r) => r.name);
        if (searchCols.length > 0) {
          const clauses = searchCols.map((col) => {
            params.push(`%${input.search}%`);
            return `"${col}" LIKE ?`;
          });
          sql += ` WHERE ${clauses.join(' OR ')}`;
        }
      }

      if (input.sortColumn) {
        sql += ` ORDER BY "${input.sortColumn}" ${input.sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
      }
      params.push(limit, offset);
      sql += ` LIMIT ? OFFSET ?`;

      const start = performance.now();
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as Record<string, unknown>[];
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
      let rows: Record<string, unknown>[] = [];
      let rowCount = 0;

      try {
        rows = (input.params ? stmt.all(...(input.params as unknown[])) : stmt.all()) as Record<string, unknown>[];
        rowCount = rows.length;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('does not return data')) {
          throw error;
        }
        const result = input.params ? stmt.run(...(input.params as unknown[])) : stmt.run();
        rowCount = result.changes;
      }

      const durationMs = performance.now() - start;

      const columns: QueryColumn[] =
        rows.length > 0 ? Object.keys(rows[0]).map((key) => ({ name: key, type: typeof rows[0][key] })) : [];

      return {
        columns,
        rows,
        rowCount,
        durationMs: Math.round(durationMs),
        truncated: false,
      };
    },

    async close(): Promise<void> {
      db.close();
    },

    async getTableStats(tableId: string): Promise<TableStats> {
      const rowCount = db.prepare(`SELECT COUNT(*) as count FROM "${tableId}"`).get() as { count: number };

      // SQLite doesn't have per-table sizes easily, use page stats
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
        const cols = db.prepare(`SELECT * FROM pragma_index_info(?)`).all(idx.name) as { name: string }[];

        return {
          name: idx.name,
          table: tableId,
          columns: cols.map((c) => c.name),
          unique: !!idx.unique,
          primary: idx.origin === 'pk',
          sizeBytes: 0, // SQLite doesn't expose index size easily
          scans: 0,
          reads: 0,
          usagePercent: 0,
        };
      });
    },

    async getDatabaseSizes(): Promise<DatabaseSize[]> {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'dbstat' AND sql NOT LIKE '%vec0%' ORDER BY name",
        )
        .all() as { name: string }[];

      // Get total DB size
      const totalDb = db
        .prepare(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`)
        .get() as { size: number };

      // Get row counts for each table to estimate proportional size
      const tablesWithCounts = tables.map((t) => {
        const countResult = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
        return { name: t.name, rowCount: countResult.cnt };
      });

      const totalRows = tablesWithCounts.reduce((sum, t) => sum + t.rowCount, 0);

      return tablesWithCounts.map((t) => {
        // Estimate table size proportionally by row count
        const estimatedSize = totalRows > 0 ? Math.round((t.rowCount / totalRows) * totalDb.size) : 0;
        return {
          schema: 'main',
          table: t.name,
          sizeBytes: estimatedSize,
          indexBytes: 0,
          totalBytes: estimatedSize,
          rowEstimate: t.rowCount,
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
      message: safeErrorMessage(err, 'Failed to open SQLite database'),
    };
  }
}
