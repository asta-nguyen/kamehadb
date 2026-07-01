import { zValidator } from '@hono/zod-validator';
import { DEFAULT_PORTS, KIND } from '@kamehadb/shared';
import type {
  MysqlVectorCapability,
  MysqlVectorColumn,
  MysqlVectorSearchHit,
  MysqlVectorSearchResult,
} from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import mysql from 'mysql2/promise';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { ADAPTER_TIMEOUTS } from '../lib/constants.js';
import { buildSafeFilterClauseMysql, quoteMysqlIdentifier } from '../lib/mysql-vector-sql.js';
import { handleError, httpError } from '../lib/route-utils.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

function getMysqlProfile(connectionId: string | undefined) {
  if (!connectionId) throw httpError('Connection not found', 404);
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw httpError('Connection not found', 404);
  }
  if (profile.kind !== KIND.MYSQL && profile.kind !== KIND.MARIADB) {
    throw httpError('MySQL vector search requires a MySQL or MariaDB connection', 400);
  }
  return profile;
}

function getMysqlPool(profile: ReturnType<typeof getMysqlProfile>, password?: string) {
  return mysql.createPool({
    host: profile.host || 'localhost',
    port: profile.port || DEFAULT_PORTS[KIND.MYSQL],
    database: profile.database,
    user: profile.username || '',
    password: password ?? '',
    waitForConnections: true,
    connectionLimit: 2,
    enableKeepAlive: true,
    connectTimeout: ADAPTER_TIMEOUTS.CONNECT_LONG,
  });
}

/** Check if a JSON value is a vector (an array of finite numbers). */
function isVectorValue(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** Compute cosine distance between two vectors (1 - cosine similarity). */
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

/** Compute L2 (Euclidean) distance between two vectors. */
function l2Distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function createSqlVectorMysqlRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  // GET /mysql-vec/capabilities
  // Discovers tables with JSON columns that contain vector-like data (arrays of numbers).
  router.get('/mysql-vec/capabilities', async (c) => {
    const connectionId = c.req.param('connectionId');
    const cacheKey = `mysql-vec-cap:${connectionId}`;
    const cached = getCached<MysqlVectorCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    let pool: mysql.Pool | null = null;
    try {
      const profile = getMysqlProfile(connectionId);
      const password = metadataStore.getProfilePassword(connectionId!);
      pool = getMysqlPool(profile, password);

      // Get MySQL/MariaDB version
      const [versionRows] = await pool.query('SELECT VERSION() AS version');
      const version = ((versionRows as Record<string, unknown>[])[0]?.version as string | undefined) ?? null;

      // Find all JSON columns in the current database
      const [colRows] = await pool.query(
        `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
         FROM information_schema.columns
         WHERE TABLE_SCHEMA = ? AND DATA_TYPE IN ('json', 'longtext', 'text')
         ORDER BY TABLE_NAME, COLUMN_NAME`,
        [profile.database],
      );

      const columns: MysqlVectorColumn[] = [];
      // Accumulate all vector columns per table; metadataColumns is built once
      // after the loop so every vector column is excluded, not just the first.
      const vectorColsByTable = new Map<string, Set<string>>();
      const allColumnsByTable = new Map<string, string[]>();

      for (const row of colRows as Array<{ tableName: string; columnName: string }>) {
        // Sample one value to check if it's a vector (array of numbers)
        try {
          const [sampleRows] = await pool.query(
            `SELECT ${quoteMysqlIdentifier(row.columnName)} AS vec
             FROM ${quoteMysqlIdentifier(row.tableName)}
             WHERE ${quoteMysqlIdentifier(row.columnName)} IS NOT NULL
             LIMIT 1`,
          );
          const sample = (sampleRows as Record<string, unknown>[])[0];
          if (!sample?.vec) continue;

          let parsed: unknown;
          if (typeof sample.vec === 'string') {
            try {
              parsed = JSON.parse(sample.vec);
            } catch {
              continue;
            }
          } else if (typeof sample.vec === 'object') {
            parsed = sample.vec;
          } else {
            continue;
          }

          if (isVectorValue(parsed)) {
            columns.push({
              tableName: row.tableName,
              columnName: row.columnName,
              dimensions: parsed.length,
            });

            if (!vectorColsByTable.has(row.tableName)) {
              vectorColsByTable.set(row.tableName, new Set());
            }
            vectorColsByTable.get(row.tableName)!.add(row.columnName);

            // Fetch the table's full column list once per table.
            if (!allColumnsByTable.has(row.tableName)) {
              const [tableCols] = await pool.query(
                `SELECT COLUMN_NAME AS name
                 FROM information_schema.columns
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                 ORDER BY ORDINAL_POSITION`,
                [profile.database, row.tableName],
              );
              allColumnsByTable.set(
                row.tableName,
                (tableCols as Array<{ name: string }>).map((tc) => tc.name),
              );
            }
          }
        } catch {
          // Skip columns that can't be sampled
        }
      }

      // Build metadataColumns excluding every discovered vector column per table.
      const metadataColumns: Record<string, string[]> = {};
      for (const [table, vectorCols] of vectorColsByTable) {
        const allCols = allColumnsByTable.get(table) ?? [];
        metadataColumns[table] = allCols.filter((name) => !vectorCols.has(name));
      }

      const capability: MysqlVectorCapability = {
        available: true,
        version,
        columns,
        metadataColumns,
      };
      setCache(cacheKey, capability);
      return c.json(capability);
    } catch (err) {
      return options.handleError(c, err, 'mysqlVecCapabilities');
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  });

  // POST /mysql-vec/search
  // Brute-force KNN search: fetches rows with the vector column, computes distances in JS.
  router.post(
    '/mysql-vec/search',
    zValidator(
      'json',
      z.object({
        table: z.string().min(1),
        column: z.string().min(1),
        vector: z.array(z.number()).min(1),
        filter: z.string().max(1000).optional(),
        metric: z.enum(['cosine', 'l2']).optional().default('cosine'),
        limit: z.number().int().positive().max(500).optional().default(10),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      let pool: mysql.Pool | null = null;
      try {
        const profile = getMysqlProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId!) ?? '';
        pool = getMysqlPool(profile, password);

        const quotedTable = quoteMysqlIdentifier(input.table);
        const quotedColumn = quoteMysqlIdentifier(input.column);
        const filterClause = buildSafeFilterClauseMysql(input.filter ?? '');

        // Fetch all rows (with optional filter) — brute-force approach
        // Limit to a reasonable max to avoid loading huge tables
        const MAX_SCAN = 10000;
        let sql: string;
        const params: unknown[] = [];
        if (filterClause) {
          sql = `SELECT * FROM ${quotedTable} WHERE ${filterClause.sql} LIMIT ?`;
          params.push(...filterClause.params, MAX_SCAN);
        } else {
          sql = `SELECT * FROM ${quotedTable} LIMIT ?`;
          params.push(MAX_SCAN);
        }

        const start = performance.now();
        const [rows] = await pool.query(sql, params);
        const durationMs = Math.round(performance.now() - start);

        const queryVector = input.vector;
        const metric = input.metric ?? 'cosine';
        const limit = input.limit ?? 10;

        const hits: MysqlVectorSearchHit[] = [];
        for (const row of rows as Record<string, unknown>[]) {
          const rawVec = row[input.column];
          if (rawVec == null) continue;

          let vec: unknown;
          if (typeof rawVec === 'string') {
            try {
              vec = JSON.parse(rawVec);
            } catch {
              continue;
            }
          } else {
            vec = rawVec;
          }

          if (!isVectorValue(vec)) continue;
          if (vec.length !== queryVector.length) continue;

          const distance = metric === 'l2' ? l2Distance(queryVector, vec) : cosineDistance(queryVector, vec);
          // Score: 1 - distance (so higher = more similar, matching pgvector/sqlite-vec convention)
          const score = metric === 'l2' ? 1 / (1 + distance) : 1 - distance;

          // Exclude the vector column from the row payload
          const { [input.column]: _vec, ...payload } = row;

          // Use the first column value as id (or row index fallback)
          const id = (payload.id ?? payload.ID ?? payload.Id ?? 0) as string | number;

          hits.push({ id, score, row: payload });
        }

        hits.sort((a, b) => b.score - a.score);
        const topHits = hits.slice(0, limit);

        const result: MysqlVectorSearchResult = {
          hits: topHits,
          durationMs,
        };

        return c.json(result);
      } catch (err) {
        return options.handleError(c, err, 'mysqlVecSearch');
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    },
  );

  // POST /mysql-vec/sample
  // Sample a random vector from a table for testing.
  router.post(
    '/mysql-vec/sample',
    zValidator(
      'json',
      z.object({
        table: z.string().min(1),
        column: z.string().min(1),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      let pool: mysql.Pool | null = null;
      try {
        const profile = getMysqlProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId!) ?? '';
        pool = getMysqlPool(profile, password);

        const quotedTable = quoteMysqlIdentifier(input.table);
        const quotedColumn = quoteMysqlIdentifier(input.column);

        const [rows] = await pool.query(
          `SELECT ${quotedColumn} AS vec FROM ${quotedTable}
           WHERE ${quotedColumn} IS NOT NULL
           ORDER BY RAND() LIMIT 1`,
        );

        const row = (rows as Record<string, unknown>[])[0];
        if (!row?.vec) {
          return c.json({ error: 'NO_VECTORS', message: 'No vectors found in this table' }, 404);
        }

        let vec: unknown;
        if (typeof row.vec === 'string') {
          try {
            vec = JSON.parse(row.vec);
          } catch {
            // Sampled row isn't valid JSON — treat as no vectors, matching
            // the capabilities/search routes' handling of non-vector data.
            return c.json({ error: 'NO_VECTORS', message: 'Column does not contain vector data' }, 400);
          }
        } else {
          vec = row.vec;
        }

        if (!isVectorValue(vec)) {
          return c.json({ error: 'NO_VECTORS', message: 'Column does not contain vector data' }, 400);
        }

        return c.json({ vector: vec, dimensions: vec.length });
      } catch (err) {
        return options.handleError(c, err, 'mysqlVecSample');
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    },
  );

  // POST /mysql-vec/vectors/sample
  // Sample multiple vectors with payloads for PCA 3D visualization.
  router.post(
    '/mysql-vec/vectors/sample',
    zValidator(
      'json',
      z.object({
        table: z.string().min(1),
        column: z.string().min(1),
        limit: z.number().min(1).max(1000).default(500),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      let pool: mysql.Pool | null = null;
      try {
        const profile = getMysqlProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId!) ?? '';
        pool = getMysqlPool(profile, password);

        const quotedTable = quoteMysqlIdentifier(input.table);
        const quotedColumn = quoteMysqlIdentifier(input.column);

        const [rows] = await pool.query(`SELECT * FROM ${quotedTable} WHERE ${quotedColumn} IS NOT NULL LIMIT ?`, [
          input.limit,
        ]);

        const points = (rows as Record<string, unknown>[]).map((row, index) => {
          const rawVec = row[input.column];
          let vector: number[] = [];
          if (rawVec != null) {
            let vec: unknown;
            if (typeof rawVec === 'string') {
              try {
                vec = JSON.parse(rawVec);
              } catch {
                vec = null;
              }
            } else {
              vec = rawVec;
            }
            if (isVectorValue(vec)) vector = vec;
          }

          const { [input.column]: _vec, ...payload } = row;
          const id = (payload.id ?? payload.ID ?? payload.Id ?? index) as string | number;
          return { id, vector, payload };
        });

        const dimensions = points.length > 0 ? points[0].vector.length : 0;
        return c.json({ points, dimensions });
      } catch (err) {
        return options.handleError(c, err, 'mysqlVecSampleBulk');
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    },
  );

  return router;
}
