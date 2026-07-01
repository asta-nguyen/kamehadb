import { zValidator } from '@hono/zod-validator';
import { KIND } from '@kamehadb/shared';
import type {
  DuckDbVectorCapability,
  DuckDbVectorColumn,
  DuckDbVectorSearchResult,
  DuckDbVectorSearchHit,
} from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { httpError } from '../lib/route-utils.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

type GetSqlAdapter = (connectionId: string) => Promise<import('@kamehadb/shared').SqlAdapter>;

function getDuckDbProfile(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw httpError('Connection not found', 404);
  if (profile.kind !== KIND.DUCKDB) {
    throw httpError('DuckDB vector search requires a DuckDB connection', 400);
  }
  return profile;
}

export function createSqlVectorDuckDbRouter(options: {
  readonly handleError: ErrorHandler;
  readonly getSqlAdapter: GetSqlAdapter;
}): Hono {
  const router = new Hono();

  // GET /duckdb-vec/capabilities
  router.get('/duckdb-vec/capabilities', async (c) => {
    const connectionId = c.req.param('connectionId');
    const cacheKey = `duckdb-vec-cap:${connectionId}`;
    const cached = getCached<DuckDbVectorCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    try {
      getDuckDbProfile(connectionId!);
      const adapter = await options.getSqlAdapter(connectionId!);

      // Check if vss extension is loaded
      let vssVersion: string | null = null;
      try {
        const rows = await adapter.runQuery({
          query: "SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'vss' LIMIT 1",
        });
        if (rows.rows.length > 0) {
          const loadedVal = rows.rows[0][0];
          if (loadedVal === true || loadedVal === 'true') {
            vssVersion = 'vss';
          }
        }
      } catch {
        // vss extension query failed — not available
      }

      // Discover FLOAT[] and DOUBLE[] columns via information_schema
      const colResult = await adapter.runQuery({
        query: `
          SELECT table_schema, table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
            AND (upper(data_type) LIKE '%FLOAT%[]%' OR upper(data_type) LIKE '%DOUBLE%[]%' OR upper(data_type) LIKE '%REAL%[]%')
          ORDER BY table_schema, table_name, column_name
        `,
      });

      const columns: DuckDbVectorColumn[] = colResult.rows.map((row) => ({
        tableSchema: String(row[0] ?? 'main'),
        tableName: String(row[1] ?? ''),
        columnName: String(row[2] ?? ''),
        dataType: String(row[3] ?? ''),
      }));

      const capability: DuckDbVectorCapability = {
        available: vssVersion !== null || columns.length > 0,
        vssVersion,
        columns,
      };
      setCache(cacheKey, capability);
      return c.json(capability);
    } catch (err) {
      return options.handleError(c, err, 'duckdbVecCapabilities');
    }
  });

  // POST /duckdb-vec/search
  router.post(
    '/duckdb-vec/search',
    zValidator(
      'json',
      z.object({
        schema: z.string().optional(),
        table: z.string(),
        column: z.string(),
        vector: z.array(z.number()),
        metric: z.enum(['cosine', 'l2', 'inner_product']).optional(),
        limit: z.number().min(1).max(1000).optional(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        getDuckDbProfile(connectionId!);
        const adapter = await options.getSqlAdapter(connectionId!);

        const metric = input.metric ?? 'cosine';
        const limit = input.limit ?? 10;
        const schema = input.schema ?? 'main';
        const quotedTable = `"${schema.replaceAll('"', '""')}"."${input.table.replaceAll('"', '""')}"`;
        const quotedCol = `"${input.column.replaceAll('"', '""')}"`;

        // DuckDB distance functions:
        // cosine: array_cosine_similarity (1 = identical → ORDER BY DESC)
        // l2: array_distance (0 = identical → ORDER BY ASC)
        // inner_product: list_dot_product (higher = more similar → ORDER BY DESC)
        const vectorLiteral = `[${input.vector.join(', ')}]::FLOAT[]`;

        let distanceExpr: string;
        let orderDir: string;
        if (metric === 'cosine') {
          distanceExpr = `array_cosine_similarity(${quotedCol}, ${vectorLiteral})`;
          orderDir = 'DESC';
        } else if (metric === 'inner_product') {
          distanceExpr = `list_dot_product(${quotedCol}, ${vectorLiteral})`;
          orderDir = 'DESC';
        } else {
          distanceExpr = `array_distance(${quotedCol}, ${vectorLiteral})`;
          orderDir = 'ASC';
        }

        const sql = `SELECT *, ${distanceExpr} AS _vec_score FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL ORDER BY _vec_score ${orderDir} LIMIT ${limit}`;

        const start = performance.now();
        const rawResult = await adapter.runQuery({ query: sql });
        const durationMs = performance.now() - start;

        const scoreColIdx = rawResult.columns.findIndex((col) => col.name === '_vec_score');
        const vecColIdx = rawResult.columns.findIndex((col) => col.name === input.column);

        const hits: DuckDbVectorSearchHit[] = rawResult.rows.map((row, idx) => {
          const score = scoreColIdx >= 0 ? Number(row[scoreColIdx]) : 0;
          const rowObj: Record<string, unknown> = {};
          rawResult.columns.forEach((col, i) => {
            if (i !== scoreColIdx && i !== vecColIdx) {
              rowObj[col.name] = row[i];
            }
          });
          return { id: idx, score, row: rowObj };
        });

        const result: DuckDbVectorSearchResult = {
          hits,
          durationMs: Math.round(durationMs),
        };
        return c.json(result);
      } catch (err) {
        return options.handleError(c, err, 'duckdbVecSearch');
      }
    },
  );

  return router;
}
