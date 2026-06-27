import { zValidator } from '@hono/zod-validator';
import { KIND } from '@kamehadb/shared';
import type { SqliteVecCapability, SqliteVecColumn, SqliteVecSearchResult, SqliteVecSearchHit } from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { handleError, httpError, quoteSqlIdentifier } from '../lib/route-utils.js';
import { buildSafeFilterClauseSqlite } from '../lib/sqlite-vector-sql.js';
import * as sqliteVec from 'sqlite-vec';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

function getSqliteProfile(connectionId: string | undefined) {
  if (!connectionId) throw httpError('Connection not found', 404);
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw httpError('Connection not found', 404);
  }
  if (profile.kind !== KIND.SQLITE) {
    throw httpError('sqlite-vec requires a SQLite connection', 400);
  }
  return profile;
}

function parseVec0ColumnNames(createSql: string): string[] {
  const match = createSql.match(/vec0\((.*)\)/s);
  if (!match) return [];
  const colDefs = match[1].split(',').map((s) => s.trim());
  const names: string[] = [];
  for (const def of colDefs) {
    const colMatch = def.match(/^(\w+)/);
    if (colMatch) names.push(colMatch[1]);
  }
  return names;
}

export function createSqlVectorSqliteRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  // GET /sqlite-vec/capabilities
  router.get('/sqlite-vec/capabilities', async (c) => {
    const connectionId = c.req.param('connectionId');
    const cacheKey = `sqlite-vec-cap:${connectionId}`;
    const cached = getCached<SqliteVecCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    try {
      const profile = getSqliteProfile(connectionId);
      if (!profile.filePath) throw new Error('SQLite file path is required');

      const Database = (await import('better-sqlite3')).default;
      const db = new Database(profile.filePath, { readonly: true });
      try {
        try {
          sqliteVec.load(db);
        } catch {
          // sqlite-vec not available
        }

        // Check if vec0 extension is loaded
        let version: string | null = null;
        try {
          const row = db.prepare('SELECT vec_version() as v').get() as { v: string };
          version = row.v;
        } catch {
          // not loaded
        }

        const columns: SqliteVecColumn[] = [];
        const metadataColumns: Record<string, string[]> = {};
        if (version) {
          // Find all vec0 virtual tables
          const vecTables = db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%vec0%' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as { name: string }[];

          for (const vt of vecTables) {
            // Parse the CREATE TABLE statement to find column names and dimensions
            const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(vt.name) as {
              sql: string;
            };

            // Extract column definitions from the vec0 table
            // Format: CREATE VIRTUAL TABLE name USING vec0(col1 TEXT, col2 TEXT, embedding float[N])
            const match = tableSql.sql.match(/vec0\((.*)\)/s);
            if (match) {
              const colDefs = match[1].split(',').map((s) => s.trim());
              const metaCols: string[] = [];
              for (const def of colDefs) {
                const vecMatch = def.match(/(\w+)\s+float\[(\d+)\]/);
                if (vecMatch) {
                  columns.push({
                    tableName: vt.name,
                    columnName: vecMatch[1],
                    dimensions: parseInt(vecMatch[2], 10),
                  });
                } else {
                  // Non-vector column (metadata)
                  const colMatch = def.match(/^(\w+)/);
                  if (colMatch) metaCols.push(colMatch[1]);
                }
              }
              metadataColumns[vt.name] = metaCols;
            }
          }
        }

        const capability: SqliteVecCapability = {
          available: !!version,
          version,
          columns,
          metadataColumns,
        };
        setCache(cacheKey, capability);
        return c.json(capability);
      } finally {
        db.close();
      }
    } catch (err) {
      return options.handleError(c, err, 'sqliteVecCapabilities');
    }
  });

  // POST /sqlite-vec/search
  router.post(
    '/sqlite-vec/search',
    zValidator(
      'json',
      z.object({
        table: z.string(),
        column: z.string(),
        vector: z.array(z.number()),
        filter: z.string().optional(),
        metric: z.enum(['cosine', 'l2', 'inner_product']).optional(),
        limit: z.number().min(1).max(1000).optional(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        const profile = getSqliteProfile(connectionId);
        if (!profile.filePath) throw new Error('SQLite file path is required');

        const Database = (await import('better-sqlite3')).default;
        const db = new Database(profile.filePath, { readonly: true });
        try {
          sqliteVec.load(db);

          const metric = input.metric ?? 'cosine';
          if (metric === 'inner_product') {
            return c.json(
              { error: 'BAD_REQUEST', message: 'inner_product metric is not supported by sqlite-vec' },
              400,
            );
          }
          const limit = input.limit ?? 10;
          const float32 = new Float32Array(input.vector);

          // Build the query — vec0 virtual tables support KNN via vec_distance_cosine / vec_distance_L2
          const distanceOp =
            metric === 'cosine' ? 'vec_distance_cosine' : metric === 'l2' ? 'vec_distance_L2' : 'vec_distance_L2';

          // Validate table and column exist in vec0 tables
          const tableSql = db
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
            .get(input.table) as { sql: string } | undefined;

          if (!tableSql || !tableSql.sql.includes('vec0')) {
            return c.json(
              { error: 'INVALID_TABLE', message: `Table "${input.table}" is not a vec0 virtual table` },
              400,
            );
          }

          // Check if the column exists in the vec0 table definition
          const columnNames = parseVec0ColumnNames(tableSql.sql);
          if (!columnNames.includes(input.column)) {
            return c.json(
              { error: 'INVALID_COLUMN', message: `Column "${input.column}" not found in vec0 table"${input.table}"` },
              400,
            );
          }

          // For vec0 virtual tables, we query with vec_distance functions
          // The rowid is the primary key, and we can select all columns
          const quotedTable = quoteSqlIdentifier(input.table);
          const quotedColumn = quoteSqlIdentifier(input.column);
          const filterClause = buildSafeFilterClauseSqlite(input.filter ?? '');

          let sql: string;
          const params: unknown[] = [float32];

          if (filterClause) {
            sql = `SELECT *, ${distanceOp}(${quotedColumn}, ?) AS distance FROM ${quotedTable} WHERE ${filterClause.sql} ORDER BY distance ASC LIMIT ?`;
            params.push(...filterClause.params, limit);
          } else {
            sql = `SELECT *, ${distanceOp}(${quotedColumn}, ?) AS distance FROM ${quotedTable} ORDER BY distance ASC LIMIT ?`;
            params.push(limit);
          }

          const start = performance.now();
          const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
          const durationMs = performance.now() - start;

          const hits: SqliteVecSearchHit[] = rows.map((r) => {
            const { distance, [input.column]: _vec, rowid, ...row } = r;
            return {
              id: (rowid as string | number) ?? 0,
              score: 1 - Number(distance),
              row,
            };
          });

          const result: SqliteVecSearchResult = {
            hits,
            durationMs: Math.round(durationMs),
          };

          return c.json(result);
        } finally {
          db.close();
        }
      } catch (err) {
        return options.handleError(c, err, 'sqliteVecSearch');
      }
    },
  );

  // POST /sqlite-vec/sample
  // Sample a random vector from a vec0 table for testing.
  router.post(
    '/sqlite-vec/sample',
    zValidator(
      'json',
      z.object({
        table: z.string(),
        column: z.string(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        const profile = getSqliteProfile(connectionId);
        if (!profile.filePath) throw new Error('SQLite file path is required');

        const Database = (await import('better-sqlite3')).default;
        const db = new Database(profile.filePath, { readonly: true });
        try {
          sqliteVec.load(db);

          // Get a random row's vector
          const row = db
            .prepare(
              `SELECT ${quoteSqlIdentifier(input.column)} AS vec FROM ${quoteSqlIdentifier(input.table)} ORDER BY RANDOM() LIMIT 1`,
            )
            .get() as { vec: Uint8Array } | undefined;

          if (!row || !row.vec) {
            return c.json({ error: 'NO_VECTORS', message: 'No vectors found in this table' }, 404);
          }

          // Convert the binary vector blob to a float array
          const float32 = new Float32Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength / 4);
          const vector = Array.from(float32);

          return c.json({ vector, dimensions: vector.length });
        } finally {
          db.close();
        }
      } catch (err) {
        return options.handleError(c, err, 'sqliteVecSample');
      }
    },
  );

  // POST /sqlite-vec/vectors/sample
  // Sample multiple vectors with payloads for PCA 3D visualization.
  router.post(
    '/sqlite-vec/vectors/sample',
    zValidator(
      'json',
      z.object({
        table: z.string(),
        column: z.string(),
        limit: z.number().min(1).max(1000).default(500),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        const profile = getSqliteProfile(connectionId);
        if (!profile.filePath) throw new Error('SQLite file path is required');

        const Database = (await import('better-sqlite3')).default;
        const db = new Database(profile.filePath, { readonly: true });
        try {
          sqliteVec.load(db);

          // Discover the table columns — vec0 virtual tables don't support SELECT *
          // reliably, so we need to enumerate columns from pragma_table_info and
          // select them explicitly.
          const colInfo = db.prepare(`PRAGMA table_info(${quoteSqlIdentifier(input.table)})`).all() as {
            name: string;
          }[];
          const colNames = colInfo.map((c) => c.name);
          // Always include rowid for the id field
          const selectCols = ['rowid', ...colNames.map((n) => `"${n}"`)];
          const selectExpr = selectCols.join(', ');

          const rows = db
            .prepare(`SELECT ${selectExpr} FROM ${quoteSqlIdentifier(input.table)} LIMIT ?`)
            .all(input.limit) as Record<string, unknown>[];

          const points = rows.map((r) => {
            const { rowid, ...rest } = r;
            const blob = rest[input.column] as Uint8Array | undefined;
            let vector: number[] = [];
            if (blob && blob.byteLength > 0) {
              const float32 = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
              vector = Array.from(float32);
            }
            // Exclude the vector column from payload
            const { [input.column]: _vec, ...payload } = rest;
            return {
              id: (rowid as string | number) ?? 0,
              vector,
              payload,
            };
          });

          const dimensions = points.length > 0 ? points[0].vector.length : 0;
          return c.json({ points, dimensions });
        } finally {
          db.close();
        }
      } catch (err) {
        return options.handleError(c, err, 'sqliteVecSampleBulk');
      }
    },
  );

  return router;
}
