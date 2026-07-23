import { zValidator } from '@hono/zod-validator';
import { DEFAULT_PORTS, KIND } from '@kamehadb/shared';
import type {
  PostgresVectorCapability,
  PostgresVectorSampleResult,
  PostgresVectorSearchResult,
  PostgresVectorSearchHit,
} from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import pg from 'pg';
import { detectPgVectorCapability } from '../adapters/postgres.js';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { ADAPTER_TIMEOUTS } from '../lib/constants.js';
import { buildSafeFilterClause } from '../lib/postgres-vector-sql.js';
import { handleError, httpError, quoteSqlIdentifier } from '../lib/route-utils.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

function getPgProfile(connectionId: number | undefined) {
  if (!connectionId) throw httpError('Connection not found', 404);
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw httpError('Connection not found', 404);
  }
  if (profile.kind !== KIND.POSTGRES) {
    throw httpError('pgvector requires a PostgreSQL connection', 400);
  }
  return profile;
}

function getPgConnConfig(profile: ReturnType<typeof getPgProfile>, password?: string) {
  return {
    host: profile.host || 'localhost',
    port: profile.port || DEFAULT_PORTS[KIND.POSTGRES],
    database: profile.database || '',
    username: profile.username || '',
    password: password ?? '',
    ssl: profile.ssl,
  };
}

const METRIC_OPERATOR: Record<string, string> = {
  l2: '<->',
  cosine: '<=>',
  inner_product: '<#>',
};

export function createSqlVectorPgRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  // GET /vectors/capabilities
  // Returns pgvector availability, vector columns, and vector indexes.
  // Results are cached for STATS_TTL since schema changes infrequently.
  router.get('/vectors/capabilities', async (c) => {
    const connectionId = Number(c.req.param('connectionId'));
    const cacheKey = `pgvector-cap:${connectionId}`;
    const cached = getCached<PostgresVectorCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    try {
      const profile = getPgProfile(connectionId);
      const password = metadataStore.getProfilePassword(connectionId);
      const config = getPgConnConfig(profile, password);
      const capability = await detectPgVectorCapability(config);
      setCache(cacheKey, capability);
      return c.json(capability);
    } catch (err) {
      return options.handleError(c, err, 'pgvector capabilities');
    }
  });

  // POST /vectors/search
  // Run a vector similarity search against a PostgreSQL table with a vector column.
  // The server validates identifiers against discovered metadata and generates safe SQL.
  router.post(
    '/vectors/search',
    zValidator(
      'json',
      z.object({
        table: z.string().min(1),
        schema: z.string().optional().default('public'),
        column: z.string().min(1),
        vector: z.array(z.number()).min(1),
        filter: z.string().max(1000).optional(),
        metric: z.enum(['l2', 'cosine', 'inner_product']).optional().default('cosine'),
        limit: z.number().int().positive().max(500).optional().default(10),
      }),
    ),
    async (c) => {
      const connectionId = Number(c.req.param('connectionId'));
      const body = c.req.valid('json');

      let pool: pg.Pool | null = null;
      try {
        const profile = getPgProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId) ?? '';

        pool = new pg.Pool({
          host: profile.host || 'localhost',
          port: profile.port || DEFAULT_PORTS[KIND.POSTGRES],
          database: profile.database,
          user: profile.username,
          password,
          ssl: profile.ssl ? { rejectUnauthorized: false } : false,
          max: 1,
          connectionTimeoutMillis: ADAPTER_TIMEOUTS.CONNECT_LONG,
        });

        // Validate that the table/column exist and are vector type
        const validateResult = await pool.query(
          `SELECT
            a.attname,
            t.typname,
            a.atttypmod
          FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_attribute a ON a.attrelid = c.oid
          JOIN pg_type t ON a.atttypid = t.oid
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3
            AND a.attnum > 0 AND NOT a.attisdropped`,
          [body.schema, body.table, body.column],
        );

        if (validateResult.rows.length === 0) {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Column "${body.schema}"."${body.table}"."${body.column}" not found or is not a vector column`,
            },
            400,
          );
        }

        const row = validateResult.rows[0];
        if (row.typname !== 'vector') {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Column "${body.column}" has type "${row.typname}", not "vector"`,
            },
            400,
          );
        }

        // Validate vector dimension matches the column
        const dims = Number(row.atttypmod) || 0;
        if (dims > 0 && body.vector.length !== dims) {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Vector dimension mismatch: column expects ${dims} dimensions but query provides ${body.vector.length}`,
            },
            400,
          );
        }

        // Find a unique identifier for this table — use the PK column when it's
        // a single-column key, otherwise fall back to ctid for composite PKs.
        const pkResult = await pool.query(
          `SELECT a.attname
          FROM pg_index ix
          JOIN pg_class c ON c.oid = ix.indrelid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
          WHERE n.nspname = $1 AND c.relname = $2 AND ix.indisprimary
          ORDER BY a.attnum`,
          [body.schema, body.table],
        );
        const idSelect =
          pkResult.rows.length === 1 ? `t.${quoteSqlIdentifier(pkResult.rows[0].attname as string)}` : 't.ctid::text';
        const filter = buildSafeFilterClause(body.filter ?? '', 4);
        const whereClause = filter ? `WHERE ${filter.sql}` : '';

        // Run the similarity search using the chosen metric operator.
        // Table/column identifiers are validated against the catalog above and
        // are safe to quote-identify. The query vector is passed as a parameter.
        const operator = METRIC_OPERATOR[body.metric] || '<=>';
        const vectorLiteral = `[${body.vector.join(',')}]`;
        const searchSql = `WITH ranked AS (
          SELECT
            ${idSelect} AS id,
            (to_jsonb(t) - $3::text) AS row,
            t.${quoteSqlIdentifier(body.column)} ${operator} $2::vector AS score
          FROM ${quoteSqlIdentifier(body.schema)}.${quoteSqlIdentifier(body.table)} AS t
          ${whereClause}
          ORDER BY score ASC
          LIMIT $1
        )
        SELECT id, row, score
        FROM ranked`;

        const start = performance.now();
        const searchResult = await pool.query(searchSql, [
          body.limit,
          vectorLiteral,
          body.column,
          ...(filter?.params ?? []),
        ]);
        const durationMs = performance.now() - start;

        const hits: PostgresVectorSearchHit[] = searchResult.rows.map((r: Record<string, unknown>) => ({
          id: r.id as string | number,
          score: Number(r.score),
          row: (r.row as Record<string, unknown>) ?? {},
        }));

        const result: PostgresVectorSearchResult = {
          hits,
          durationMs: Math.round(durationMs),
        };

        return c.json(result);
      } catch (err) {
        return options.handleError(c, err, 'pgvector search');
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    },
  );

  // POST /vectors/sample
  // Sample vectors from a table column for PCA visualization.
  // Returns up to limit rows with the vector and a slim payload (excluding the vector column itself).
  router.post(
    '/vectors/sample',
    zValidator(
      'json',
      z.object({
        table: z.string().min(1),
        schema: z.string().optional().default('public'),
        column: z.string().min(1),
        limit: z.number().int().positive().max(500).optional().default(500),
      }),
    ),
    async (c) => {
      const connectionId = Number(c.req.param('connectionId'));
      const body = c.req.valid('json');

      let pool: pg.Pool | null = null;
      try {
        const profile = getPgProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId) ?? '';

        pool = new pg.Pool({
          host: profile.host || 'localhost',
          port: profile.port || DEFAULT_PORTS[KIND.POSTGRES],
          database: profile.database,
          user: profile.username,
          password,
          ssl: profile.ssl ? { rejectUnauthorized: false } : false,
          max: 1,
          connectionTimeoutMillis: ADAPTER_TIMEOUTS.CONNECT_LONG,
        });

        // Validate that the table/column exist and are vector type
        const validateResult = await pool.query(
          `SELECT
            a.attname,
            t.typname
          FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_attribute a ON a.attrelid = c.oid
          JOIN pg_type t ON a.atttypid = t.oid
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3
            AND a.attnum > 0 AND NOT a.attisdropped`,
          [body.schema, body.table, body.column],
        );

        if (validateResult.rows.length === 0) {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Column "${body.schema}"."${body.table}"."${body.column}" not found or is not a vector column`,
            },
            400,
          );
        }

        const validateRow = validateResult.rows[0];
        if (validateRow.typname !== 'vector') {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Column "${body.column}" has type "${validateRow.typname}", not "vector"`,
            },
            400,
          );
        }

        // Find a unique identifier for this table — use the PK column when it's
        // a single-column key, otherwise fall back to ctid for composite PKs.
        const pkResult = await pool.query(
          `SELECT a.attname
          FROM pg_index ix
          JOIN pg_class c ON c.oid = ix.indrelid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
          WHERE n.nspname = $1 AND c.relname = $2 AND ix.indisprimary
          ORDER BY a.attnum`,
          [body.schema, body.table],
        );
        const idSelect =
          pkResult.rows.length === 1 ? `t.${quoteSqlIdentifier(pkResult.rows[0].attname as string)}` : 't.ctid::text';

        const sampleResult = await pool.query(
          `SELECT
            ${idSelect} AS id,
            t.${quoteSqlIdentifier(body.column)} AS vector,
            to_jsonb(t) - $2::text AS payload
          FROM ${quoteSqlIdentifier(body.schema ?? 'public')}.${quoteSqlIdentifier(body.table)} AS t
          WHERE t.${quoteSqlIdentifier(body.column)} IS NOT NULL
          LIMIT $1`,
          [body.limit, body.column],
        );

        const points: import('@kamehadb/shared').PostgresVectorSamplePoint[] = sampleResult.rows.map(
          (r: Record<string, unknown>) => {
            const rawVector = r.vector;
            let vectorArr: number[];
            if (typeof rawVector === 'string') {
              vectorArr = rawVector.slice(1, -1).split(',').map(Number);
            } else if (Array.isArray(rawVector)) {
              vectorArr = rawVector as number[];
            } else {
              throw httpError(
                `Expected vector column '${body.column}' to be a string or array, got ${typeof rawVector}`,
                400,
              );
            }
            return {
              id: r.id as string | number,
              vector: vectorArr,
              payload: (r.payload as Record<string, unknown>) ?? {},
            };
          },
        );

        const dimensions = points.length > 0 ? points[0].vector.length : 0;
        const result: PostgresVectorSampleResult = { points, dimensions };

        return c.json(result);
      } catch (err) {
        return options.handleError(c, err, 'pgvector sample');
      } finally {
        if (pool) await pool.end().catch(() => {});
      }
    },
  );

  return router;
}
