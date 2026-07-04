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
          const row = rows.rows[0] as Record<string, unknown>;
          const loadedVal = row['loaded'];
          if (loadedVal === true || loadedVal === 'true') {
            vssVersion = 'vss';
          }
        }
      } catch {
        // vss extension query failed — not available
      }

      // Discover FLOAT[] and DOUBLE[] columns via information_schema.
      // DuckDB reports fixed-size arrays as "FLOAT[3]" not "FLOAT[]", so we
      // match any FLOAT/DOUBLE/REAL column whose data_type contains "[".
      const colResult = await adapter.runQuery({
        query: `
          SELECT table_schema, table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
            AND (upper(data_type) LIKE 'FLOAT[%' OR upper(data_type) LIKE 'DOUBLE[%' OR upper(data_type) LIKE 'REAL[%')
          ORDER BY table_schema, table_name, column_name
        `,
      });

      const columns: DuckDbVectorColumn[] = colResult.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          tableSchema: String(r['table_schema'] ?? 'main'),
          tableName: String(r['table_name'] ?? ''),
          columnName: String(r['column_name'] ?? ''),
          dataType: String(r['data_type'] ?? ''),
        };
      });

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
        table: z.string().min(1),
        column: z.string().min(1),
        vector: z.array(z.number().finite()).min(1),
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
        // Note: these functions require fixed-size FLOAT[N] arrays, not FLOAT[].
        const dims = input.vector.length;
        const vectorLiteral = `[${input.vector.join(', ')}]::FLOAT[${dims}]`;
        const colCast = `${quotedCol}::FLOAT[${dims}]`;

        let distanceExpr: string;
        let orderDir: string;
        if (metric === 'cosine') {
          distanceExpr = `array_cosine_similarity(${colCast}, ${vectorLiteral})`;
          orderDir = 'DESC';
        } else if (metric === 'inner_product') {
          distanceExpr = `list_dot_product(${colCast}, ${vectorLiteral})`;
          orderDir = 'DESC';
        } else {
          distanceExpr = `array_distance(${colCast}, ${vectorLiteral})`;
          orderDir = 'ASC';
        }

        const sql = `SELECT *, ${distanceExpr} AS _vec_score FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL ORDER BY _vec_score ${orderDir} LIMIT ${limit}`;

        const start = performance.now();
        const rawResult = await adapter.runQuery({ query: sql });
        const durationMs = performance.now() - start;

        const hits: DuckDbVectorSearchHit[] = rawResult.rows.map((row, idx) => {
          const rowObj = row as Record<string, unknown>;
          const score = Number(rowObj['_vec_score'] ?? 0);
          const payload: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rowObj)) {
            if (key !== '_vec_score' && key !== input.column) {
              payload[key] = value;
            }
          }
          return { id: idx, score, row: payload };
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

  // POST /duckdb-vec/sample
  // Sample a single random vector from an array column for testing.
  router.post(
    '/duckdb-vec/sample',
    zValidator('json', z.object({ table: z.string().min(1), column: z.string().min(1) })),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        getDuckDbProfile(connectionId!);
        const adapter = await options.getSqlAdapter(connectionId!);

        const schema = 'main';
        const quotedTable = `"${schema.replaceAll('"', '""')}"."${input.table.replaceAll('"', '""')}"`;
        const quotedCol = `"${input.column.replaceAll('"', '""')}"`;

        const sql = `SELECT ${quotedCol} AS vec_value FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL LIMIT 1`;

        const rawResult = await adapter.runQuery({ query: sql });

        const vecCol = rawResult.columns.find((col) => col.name === 'vec_value');
        const row = rawResult.rows[0] as Record<string, unknown> | undefined;
        if (!row || !vecCol) {
          return c.json({ error: 'NO_VECTORS', message: 'No vectors found in this table' }, 404);
        }

        const vectorRaw = row['vec_value'];
        let vector: number[] = [];
        if (Array.isArray(vectorRaw)) {
          vector = vectorRaw.map((v) => Number(v));
        } else if (
          vectorRaw &&
          typeof vectorRaw === 'object' &&
          Array.isArray((vectorRaw as { items?: unknown[] }).items)
        ) {
          // DuckDB FLOAT[] columns come back as { items: number[] }
          vector = (vectorRaw as { items: number[] }).items.map((v) => Number(v));
        }

        return c.json({ vector, dimensions: vector.length });
      } catch (err) {
        return options.handleError(c, err, 'duckdbVecSample');
      }
    },
  );

  // POST /duckdb-vec/vectors/sample
  // Sample multiple vectors with payloads for 3D map visualization.
  router.post(
    '/duckdb-vec/vectors/sample',
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

      try {
        getDuckDbProfile(connectionId!);
        const adapter = await options.getSqlAdapter(connectionId!);

        const schema = 'main';
        const quotedTable = `"${schema.replaceAll('"', '""')}"."${input.table.replaceAll('"', '""')}"`;
        const quotedCol = `"${input.column.replaceAll('"', '""')}"`;

        const sql = `SELECT * FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL LIMIT ${input.limit}`;

        const rawResult = await adapter.runQuery({ query: sql });

        const points = rawResult.rows.map((row, idx) => {
          const rowObj = row as Record<string, unknown>;
          const vectorRaw = rowObj[input.column];
          let vector: number[] = [];
          if (Array.isArray(vectorRaw)) {
            vector = vectorRaw.map((v) => Number(v));
          } else if (
            vectorRaw &&
            typeof vectorRaw === 'object' &&
            Array.isArray((vectorRaw as { items?: unknown[] }).items)
          ) {
            vector = (vectorRaw as { items: number[] }).items.map((v) => Number(v));
          }
          const payload: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rowObj)) {
            if (key !== input.column) {
              payload[key] = value;
            }
          }
          return { id: idx, vector, payload };
        });

        const dimensions = points.length > 0 ? points[0].vector.length : 0;
        return c.json({ points, dimensions });
      } catch (err) {
        return options.handleError(c, err, 'duckdbVecSampleBulk');
      }
    },
  );

  return router;
}
