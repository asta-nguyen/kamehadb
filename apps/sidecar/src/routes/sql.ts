import { zValidator } from '@hono/zod-validator';
import { isQuerySafe } from '@kamehadb/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import pg from 'pg';
import { createMongoDbAdapter, createSqlAdapter } from '../adapters/factory.js';
import * as metadataStore from '../db/metadata-store.js';
import { detectPgVectorCapability } from '../adapters/postgres.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { createSqlSchemaRouter } from './sql-schema.js';
import { buildSafeFilterClause, quoteSqlIdentifier } from '../lib/postgres-vector-sql.js';
import type {
  PostgresVectorCapability,
  PostgresVectorSampleResult,
  PostgresVectorSearchResult,
  PostgresVectorSearchHit,
} from '@kamehadb/shared';

export const sqlRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`[SQL] ${context}:`, message);
  return c.json({ error: 'INTERNAL_ERROR', message }, 500);
}

async function getSqlAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind === 'mongodb') {
    throw new Error('Use /mongo endpoint for MongoDB connections');
  }
  if (profile.kind === 'tigerbeetle') {
    throw new Error('TigerBeetle is not a SQL database');
  }

  const password = metadataStore.getProfilePassword(connectionId);
  if (!password && profile.kind === 'postgres') {
    throw new Error('Password not saved. Open connection settings and save with password.');
  }

  const adapter = createSqlAdapter(profile, password);
  if (!adapter) {
    console.warn(`[SQL] Unsupported connection kind for ${connectionId}: ${profile.kind}`);
    return {
      testConnection: () => Promise.resolve({ success: false, message: `Unsupported for ${profile.kind}` }),
      listDatabases: () => Promise.resolve([]),
      listSchemas: () => Promise.resolve([]),
      listTables: () => Promise.resolve([]),
      getTableColumns: () => Promise.resolve([]),
      getTableIndexes: () => Promise.resolve([]),
      getCompletions: () => Promise.resolve([]),
      previewRows: () => Promise.reject(new Error('Not supported')),
      runQuery: () => Promise.reject(new Error('Not supported')),
      close: () => Promise.resolve(),
    };
  }
  return adapter;
}

async function getMongoAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind !== 'mongodb') {
    throw new Error('Use /sql endpoint for non-MongoDB connections');
  }

  return createMongoDbAdapter(profile);
}

sqlRouter.route('/:connectionId', createSqlSchemaRouter({ getSqlAdapter, handleError }));

// Databases
sqlRouter.get('/:connectionId/databases', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `sql:${connectionId}:databases`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const databases = await adapter.listDatabases();
      setCache(cacheKey, databases);
      return c.json(databases);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listDatabases');
  }
});

// Schemas
sqlRouter.get('/:connectionId/schemas', async (c) => {
  const connectionId = c.req.param('connectionId');
  const cacheKey = `sql:${connectionId}:schemas`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const schemas = await adapter.listSchemas();
      setCache(cacheKey, schemas);
      return c.json(schemas);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listSchemas');
  }
});

// Tables
sqlRouter.get('/:connectionId/tables', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:tables:${schema}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const tables = await adapter.listTables(schema || undefined);
      setCache(cacheKey, tables);
      return c.json(tables);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'listTables');
  }
});

// Table columns
sqlRouter.get('/:connectionId/tables/:tableId/columns', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:columns:${tableId}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const columns = await adapter.getTableColumns(tableId);
      setCache(cacheKey, columns);
      return c.json(columns);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getTableColumns');
  }
});

// Table indexes
sqlRouter.get('/:connectionId/tables/:tableId/indexes', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:indexes:${tableId}`;
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const indexes = await adapter.getTableIndexes(tableId);
      setCache(cacheKey, indexes);
      return c.json(indexes);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getTableIndexes');
  }
});

// Completions schema (all tables + columns for autocomplete)
sqlRouter.get('/:connectionId/autocomplete', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:completions:${schema}`;
  const cached = getCached<{ tables: unknown[] }>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      const tables = await adapter.getCompletions(schema || undefined);
      const result = { tables };
      setCache(cacheKey, result);
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'completions');
  }
});

// Schema search
sqlRouter.get('/:connectionId/schema/search', async (c) => {
  const connectionId = c.req.param('connectionId');
  const q = c.req.query('q');
  if (!q) return c.json([]);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('searchSchema' in adapter)) {
        return c.json({ error: 'NOT_SUPPORTED', message: 'Schema search not available for this database type' }, 400);
      }
      const schema = c.req.query('schema') || undefined;
      const rawLimit = c.req.query('limit');
      const parsed = rawLimit ? Number(rawLimit) : undefined;
      const limit =
        parsed !== undefined && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000 ? parsed : undefined;
      const results = await adapter.searchSchema!({ query: q, schema, limit });
      return c.json(results);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'searchSchema');
  }
});

// Preview rows
sqlRouter.post(
  '/:connectionId/rows',
  zValidator(
    'json',
    z.object({
      tableId: z.string(),
      schema: z.string().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
      search: z.string().optional(),
      sortColumn: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
      filters: z
        .array(
          z.object({
            column: z.string(),
            operator: z.string(),
            value: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  async (c) => {
    try {
      const adapter = await getSqlAdapter(c.req.param('connectionId'));
      try {
        const result = await adapter.previewRows(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'previewRows');
    }
  },
);

// Run query
sqlRouter.post(
  '/:connectionId/query',
  zValidator(
    'json',
    z.object({
      query: z.string(),
      params: z.array(z.unknown()).optional(),
    }),
  ),
  async (c) => {
    try {
      const connectionId = c.req.param('connectionId');
      const profile = metadataStore.getProfile(connectionId);
      if (!profile) return c.json({ error: 'NOT_FOUND', message: 'Connection not found' }, 404);

      if (profile.readonly !== false) {
        const { query } = c.req.valid('json');
        const safety = isQuerySafe(query);
        if (!safety.safe) {
          return c.json(
            { error: 'FORBIDDEN', message: safety.reason ?? 'Query is not allowed in read-only mode' },
            403,
          );
        }
      }

      const password = metadataStore.getProfilePassword(connectionId);
      const adapter = await getSqlAdapter(connectionId);
      try {
        const result = await adapter.runQuery(c.req.valid('json'));
        return c.json(result);
      } finally {
        await adapter.close();
      }
    } catch (err) {
      return handleError(c, err, 'runQuery');
    }
  },
);

// Table stats
sqlRouter.get('/:connectionId/tables/:tableId/stats', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:stats:${tableId}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('getTableStats' in adapter)) {
        return c.json({
          tableId,
          name: tableId.split('.').pop() || tableId,
          schema: tableId.includes('.') ? tableId.split('.')[0] : '',
          rowEstimate: 0,
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
          nLiveTup: 0,
          nDeadTup: 0,
        });
      }
      const stats = await adapter.getTableStats!(tableId);
      setCache(cacheKey, stats);
      return c.json(stats);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getTableStats');
  }
});

// Index stats
sqlRouter.get('/:connectionId/tables/:tableId/indexes/stats', async (c) => {
  const connectionId = c.req.param('connectionId');
  const tableId = c.req.param('tableId');
  const cacheKey = `sql:${connectionId}:index-stats:${tableId}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('getIndexStats' in adapter)) {
        return c.json([]);
      }
      const stats = await adapter.getIndexStats!(tableId);
      setCache(cacheKey, stats);
      return c.json(stats);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getIndexStats');
  }
});

// Database sizes
sqlRouter.get('/:connectionId/database/sizes', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schema = c.req.query('schema') || '';
  const cacheKey = `sql:${connectionId}:sizes:${schema}`;
  const cached = getCached<unknown>(cacheKey, CACHE_TTL.STATS);
  if (cached) return c.json(cached);

  try {
    const adapter = await getSqlAdapter(connectionId);
    try {
      if (!('getDatabaseSizes' in adapter)) {
        return c.json([]);
      }
      const sizes = await adapter.getDatabaseSizes!(schema || undefined);
      setCache(cacheKey, sizes);
      return c.json(sizes);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getDatabaseSizes');
  }
});

// Active connections
sqlRouter.get('/:connectionId/sessions', async (c) => {
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    try {
      if (!('getActiveConnections' in adapter)) {
        return c.json([]);
      }
      const connections = await adapter.getActiveConnections!();
      return c.json(connections);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, 'getActiveConnections');
  }
});
// PostgreSQL vector routes (mounted at /sql/:id/vectors/*)
// ----------------------------------------------------------------

function handlePgError(c: any, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const statusCode =
    typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500;
  console.error(`[PostgresVector] ${context}:`, message);
  return c.json({ error: statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message }, statusCode);
}

function getPgProfile(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw Object.assign(new Error('Connection not found'), { statusCode: 404 });
  }
  if (profile.kind !== 'postgres') {
    throw Object.assign(new Error('pgvector requires a PostgreSQL connection'), { statusCode: 400 });
  }
  return profile;
}

function getPgConnConfig(profile: ReturnType<typeof getPgProfile>, password?: string) {
  return {
    host: profile.host || 'localhost',
    port: profile.port || 5432,
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

// GET /:connectionId/pgvector/capabilities
// Returns pgvector availability, vector columns, and vector indexes.
// Results are cached for STATS_TTL since schema changes infrequently.
sqlRouter.get('/:connectionId/vectors/capabilities', async (c) => {
  const connectionId = c.req.param('connectionId');
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
    return handlePgError(c, err, 'capabilities');
  }
});

// POST /:connectionId/pgvector/search
// Run a vector similarity search against a PostgreSQL table with a vector column.
// The server validates identifiers against discovered metadata and generates safe SQL.
sqlRouter.post(
  '/:connectionId/vectors/search',
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
    const connectionId = c.req.param('connectionId');
    const body = c.req.valid('json');

    let pool: pg.Pool | null = null;
    try {
      const profile = getPgProfile(connectionId);
      const password = metadataStore.getProfilePassword(connectionId) ?? '';

      pool = new pg.Pool({
        host: profile.host || 'localhost',
        port: profile.port || 5432,
        database: profile.database,
        user: profile.username,
        password,
        ssl: profile.ssl ? { rejectUnauthorized: false } : false,
        max: 1,
        connectionTimeoutMillis: 10000,
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

      // Find a unique identifier column for this table
      const pkResult = await pool.query(
        `SELECT a.attname
        FROM pg_index ix
        JOIN pg_class c ON c.oid = ix.indrelid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
        WHERE n.nspname = $1 AND c.relname = $2 AND ix.indisprimary
        ORDER BY a.attnum
        LIMIT 1`,
        [body.schema, body.table],
      );
      const idColumn = pkResult.rows.length > 0 ? (pkResult.rows[0].attname as string) : 'ctid';
      const idSelect = idColumn === 'ctid' ? 't.ctid::text' : `t.${quoteSqlIdentifier(idColumn)}`;
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
      return handlePgError(c, err, 'vectorSearch');
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  },
);

// POST /:connectionId/pgvector/sample
// Sample vectors from a table column for PCA visualization.
// Returns up to limit rows with the vector and a slim payload (excluding the vector column itself).
sqlRouter.post(
  '/:connectionId/vectors/sample',
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
    const connectionId = c.req.param('connectionId');
    const body = c.req.valid('json');

    let pool: pg.Pool | null = null;
    try {
      const profile = getPgProfile(connectionId);
      const password = metadataStore.getProfilePassword(connectionId) ?? '';

      pool = new pg.Pool({
        host: profile.host || 'localhost',
        port: profile.port || 5432,
        database: profile.database,
        user: profile.username,
        password,
        ssl: profile.ssl ? { rejectUnauthorized: false } : false,
        max: 1,
        connectionTimeoutMillis: 10000,
      });

      // Find a unique identifier column for this table
      const pkResult = await pool.query(
        `SELECT a.attname
        FROM pg_index ix
        JOIN pg_class c ON c.oid = ix.indrelid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
        WHERE n.nspname = $1 AND c.relname = $2 AND ix.indisprimary
        ORDER BY a.attnum
        LIMIT 1`,
        [body.schema, body.table],
      );
      const idColumn = pkResult.rows.length > 0 ? (pkResult.rows[0].attname as string) : 'ctid';
      const idSelect = idColumn === 'ctid' ? 't.ctid::text' : `t.${quoteSqlIdentifier(idColumn)}`;

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
            vectorArr = [];
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
      return handlePgError(c, err, 'vectorSample');
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  },
);
