import { zValidator } from '@hono/zod-validator';
import { isQuerySafe, KIND, DEFAULT_PORTS, isPasswordRequired, type SqlAdapter } from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import pg from 'pg';
import { createMongoDbAdapter, createSqlAdapter } from '../adapters/factory.js';
import * as metadataStore from '../db/metadata-store.js';
import { detectPgVectorCapability } from '../adapters/postgres.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { ADAPTER_TIMEOUTS } from '../lib/constants.js';
import { createSqlSchemaRouter } from './sql-schema.js';
import { buildSafeFilterClause, quoteSqlIdentifier } from '../lib/postgres-vector-sql.js';
import type {
  PostgresVectorCapability,
  PostgresVectorSampleResult,
  PostgresVectorSearchResult,
  PostgresVectorSearchHit,
  SqliteVecCapability,
  SqliteVecColumn,
  SqliteVecSearchResult,
  SqliteVecSearchHit,
} from '@kamehadb/shared';
import * as sqliteVec from 'sqlite-vec';
import { log } from '../lib/logger.js';

export const sqlRouter = new Hono();

function handleError(c: Context, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error({ err }, `SQL ${context}`);
  return c.json({ error: 'INTERNAL_ERROR', message }, 500);
}

// Module-level adapter cache to avoid creating + destroying connection pools per request
const adapterCache = new Map<string, SqlAdapter>();

/** Evict a cached adapter (e.g. when connection profile is updated). */
export function invalidateAdapterCache(connectionId: string): void {
  const adapter = adapterCache.get(connectionId);
  if (adapter) {
    adapterCache.delete(connectionId);
    adapter.close().catch(() => {});
  }
}

export async function getSqlAdapter(connectionId: string) {
  const cached = adapterCache.get(connectionId);
  if (cached) return cached;

  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind === KIND.MONGODB) {
    throw new Error('Use /mongo endpoint for MongoDB connections');
  }
  if (profile.kind === KIND.TIGERBEETLE) {
    throw new Error('TigerBeetle is not a SQL database');
  }

  const password = metadataStore.getProfilePassword(connectionId);
  if (!password && isPasswordRequired(profile.kind)) {
    throw new Error('Password not saved. Open connection settings and save with password.');
  }

  const adapter = createSqlAdapter(profile, password);
  if (!adapter) {
    log.warn({ connectionId, kind: profile.kind }, 'Unsupported connection kind for SQL adapter');
    const fallback = {
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
    adapterCache.set(connectionId, fallback);
    return fallback;
  }
  adapterCache.set(connectionId, adapter);
  return adapter;
}

async function getMongoAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error('Connection not found');

  if (profile.kind !== KIND.MONGODB) {
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
    const databases = await adapter.listDatabases();
    setCache(cacheKey, databases);
    return c.json(databases);
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
    const schemas = await adapter.listSchemas();
    setCache(cacheKey, schemas);
    return c.json(schemas);
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
    const tables = await adapter.listTables(schema || undefined);
    setCache(cacheKey, tables);
    return c.json(tables);
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
    const columns = await adapter.getTableColumns(tableId);
    setCache(cacheKey, columns);
    return c.json(columns);
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
    const indexes = await adapter.getTableIndexes(tableId);
    setCache(cacheKey, indexes);
    return c.json(indexes);
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
    const tables = await adapter.getCompletions(schema || undefined);
    const result = { tables };
    setCache(cacheKey, result);
    return c.json(result);
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
      const result = await adapter.previewRows(c.req.valid('json'));
      return c.json(result);
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

      const adapter = await getSqlAdapter(connectionId);
      const result = await adapter.runQuery(c.req.valid('json'));
      return c.json(result);
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
    if (!('getIndexStats' in adapter)) {
      return c.json([]);
    }
    const stats = await adapter.getIndexStats!(tableId);
    setCache(cacheKey, stats);
    return c.json(stats);
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
    if (!('getDatabaseSizes' in adapter)) {
      return c.json([]);
    }
    const sizes = await adapter.getDatabaseSizes!(schema || undefined);
    setCache(cacheKey, sizes);
    return c.json(sizes);
  } catch (err) {
    return handleError(c, err, 'getDatabaseSizes');
  }
});

// Active connections
sqlRouter.get('/:connectionId/sessions', async (c) => {
  try {
    const adapter = await getSqlAdapter(c.req.param('connectionId'));
    if (!('getActiveConnections' in adapter)) {
      return c.json([]);
    }
    const connections = await adapter.getActiveConnections!();
    return c.json(connections);
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
  log.error({ err }, `PostgresVector ${context}`);
  return c.json({ error: statusCode === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message }, statusCode);
}

function getPgProfile(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw Object.assign(new Error('Connection not found'), { statusCode: 404 });
  }
  if (profile.kind !== KIND.POSTGRES) {
    throw Object.assign(new Error('pgvector requires a PostgreSQL connection'), { statusCode: 400 });
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
        port: profile.port || DEFAULT_PORTS[KIND.POSTGRES],
        database: profile.database,
        user: profile.username,
        password,
        ssl: profile.ssl ? { rejectUnauthorized: false } : false,
        max: 1,
        connectionTimeoutMillis: ADAPTER_TIMEOUTS.CONNECT_LONG,
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

// --- sqlite-vec routes ---

function getSqliteProfile(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw Object.assign(new Error('Connection not found'), { statusCode: 404 });
  }
  if (profile.kind !== KIND.SQLITE) {
    throw Object.assign(new Error('sqlite-vec requires a SQLite connection'), { statusCode: 400 });
  }
  return profile;
}

// GET /:connectionId/sqlite-vec/capabilities
sqlRouter.get('/:connectionId/sqlite-vec/capabilities', async (c) => {
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
    return handleError(c, err, 'sqliteVecCapabilities');
  }
});

// POST /:connectionId/sqlite-vec/search
sqlRouter.post(
  '/:connectionId/sqlite-vec/search',
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
        const limit = input.limit ?? 10;
        const float32 = new Float32Array(input.vector);

        // Build the query — vec0 virtual tables support KNN via vec_distance_cosine / vec_distance_L2
        const distanceOp =
          metric === 'cosine' ? 'vec_distance_cosine' : metric === 'l2' ? 'vec_distance_L2' : 'vec_distance_L2';

        // Validate table and column exist in vec0 tables
        const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(input.table) as
          | { sql: string }
          | undefined;

        if (!tableSql || !tableSql.sql.includes('vec0')) {
          return c.json({ error: 'INVALID_TABLE', message: `Table "${input.table}" is not a vec0 virtual table` }, 400);
        }

        // Check if the column exists in the vec0 table definition
        if (!tableSql.sql.includes(input.column)) {
          return c.json(
            { error: 'INVALID_COLUMN', message: `Column "${input.column}" not found in vec0 table"${input.table}"` },
            400,
          );
        }

        // For vec0 virtual tables, we query with vec_distance functions
        // The rowid is the primary key, and we can select all columns
        let sql: string;
        const params: unknown[] = [float32];

        if (input.filter) {
          sql = `SELECT *, ${distanceOp}(${input.column}, ?) AS distance FROM "${input.table}" WHERE ${input.filter} ORDER BY distance ASC LIMIT ?`;
          params.push(limit);
        } else {
          sql = `SELECT *, ${distanceOp}(${input.column}, ?) AS distance FROM "${input.table}" ORDER BY distance ASC LIMIT ?`;
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
      return handleError(c, err, 'sqliteVecSearch');
    }
  },
);

// POST /:connectionId/sqlite-vec/sample
// Sample a random vector from a vec0 table for testing.
sqlRouter.post(
  '/:connectionId/sqlite-vec/sample',
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
          .prepare(`SELECT "${input.column}" AS vec FROM "${input.table}" ORDER BY RANDOM() LIMIT 1`)
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
      return handleError(c, err, 'sqliteVecSample');
    }
  },
);

// POST /:connectionId/sqlite-vec/vectors/sample
// Sample multiple vectors with payloads for PCA 3D visualization.
sqlRouter.post(
  '/:connectionId/sqlite-vec/vectors/sample',
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
        const colInfo = db.prepare(`PRAGMA table_info("${input.table}")`).all() as { name: string }[];
        const colNames = colInfo.map((c) => c.name);
        // Always include rowid for the id field
        const selectCols = ['rowid', ...colNames.map((n) => `"${n}"`)];
        const selectExpr = selectCols.join(', ');

        const rows = db.prepare(`SELECT ${selectExpr} FROM "${input.table}" LIMIT ?`).all(input.limit) as Record<
          string,
          unknown
        >[];

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
      return handleError(c, err, 'sqliteVecSampleBulk');
    }
  },
);
