import { zValidator } from '@hono/zod-validator';
import { DEFAULT_PORTS, KIND } from '@kamehadb/shared';
import type { ClickHouseVectorCapability, ClickHouseVectorColumn, ClickHouseVectorSearchResult, ClickHouseVectorSearchHit } from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { handleError, httpError } from '../lib/route-utils.js';
import { createClient } from '@clickhouse/client';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

interface ClickHouseResult<T> {
  data: T[];
}

function getClickHouseProfile(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw httpError('Connection not found', 404);
  if (profile.kind !== KIND.CLICKHOUSE) {
    throw httpError('ClickHouse vector search requires a ClickHouse connection', 400);
  }
  return profile;
}

export function createSqlVectorClickHouseRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  // GET /clickhouse-vec/capabilities
  // Detects Array(Float32) columns which can be used for vector similarity search.
  // ClickHouse always supports cosineDistance / L2Distance / dotProduct on these columns.
  router.get('/clickhouse-vec/capabilities', async (c) => {
    const connectionId = c.req.param('connectionId')!;
    const cacheKey = `clickhouse-vec-cap:${connectionId}`;
    const cached = getCached<ClickHouseVectorCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    try {
      const profile = getClickHouseProfile(connectionId);
      const password = metadataStore.getProfilePassword(connectionId);
      const client = createClient({
        host: `http://${profile.host || 'localhost'}:${profile.port || DEFAULT_PORTS[KIND.CLICKHOUSE]}`,
        username: profile.username || 'default',
        password: password ?? '',
        database: profile.database || 'default',
      });

      try {
        // Find all Array(Float32) columns in the current database
        const result = await client.query({
          query: `
            SELECT table, name, type
            FROM system.columns
            WHERE database = currentDatabase()
              AND type LIKE 'Array(Float32)%'
            ORDER BY table, name
          `,
          format: 'JSONCompact',
        });
        const json = (await result.json()) as ClickHouseResult<[string, string, string]>;

        const columns: ClickHouseVectorColumn[] = json.data.map(([tableName, columnName, dataType]) => ({
          tableName,
          columnName,
          dataType,
        }));

        const capability: ClickHouseVectorCapability = {
          available: true,
          columns,
        };
        setCache(cacheKey, capability);
        return c.json(capability);
      } finally {
        await client.close();
      }
    } catch (err) {
      return options.handleError(c, err, 'clickhouseVecCapabilities');
    }
  });

  // POST /clickhouse-vec/search
  router.post(
    '/clickhouse-vec/search',
    zValidator(
      'json',
      z.object({
        table: z.string(),
        column: z.string(),
        vector: z.array(z.number()),
        metric: z.enum(['cosine', 'l2', 'inner_product']).optional(),
        limit: z.number().min(1).max(1000).optional(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId')!;
      const input = c.req.valid('json');

      try {
        const profile = getClickHouseProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId);
        const client = createClient({
          host: `http://${profile.host || 'localhost'}:${profile.port || DEFAULT_PORTS[KIND.CLICKHOUSE]}`,
          username: profile.username || 'default',
          password: password ?? '',
          database: profile.database || 'default',
        });

        try {
          const metric = input.metric ?? 'cosine';
          const limit = input.limit ?? 10;

          // ClickHouse distance function names and sort direction
          let distanceFn: string;
          let orderDir: string;
          if (metric === 'cosine') {
            distanceFn = 'cosineDistance';
            orderDir = 'ASC'; // cosineDistance: 0 = identical, lower is closer
          } else if (metric === 'inner_product') {
            distanceFn = 'dotProduct';
            orderDir = 'DESC'; // dotProduct: higher = more similar
          } else {
            distanceFn = 'L2Distance';
            orderDir = 'ASC';
          }

          // Build a safe vector literal for ClickHouse: [v1, v2, ...]::Array(Float32)
          const vectorLiteral = `[${input.vector.map((v) => v.toFixed(8)).join(', ')}]`;
          const quotedTable = `\`${input.table.replaceAll('`', '``')}\``;
          const quotedColumn = `\`${input.column.replaceAll('`', '``')}\``;

          const sql = `
            SELECT *, ${distanceFn}(${quotedColumn}, ${vectorLiteral}) AS _vec_score
            FROM ${quotedTable}
            WHERE length(${quotedColumn}) > 0
            ORDER BY _vec_score ${orderDir}
            LIMIT ${limit}
          `;

          const start = performance.now();
          const result = await client.query({ query: sql, format: 'JSONEachRow' });
          const rows = (await result.json()) as Record<string, unknown>[];
          const durationMs = performance.now() - start;

          const hits: ClickHouseVectorSearchHit[] = rows.map((r, idx) => {
            const { _vec_score, [input.column]: _vec, ...row } = r;
            return {
              id: idx,
              score: Number(_vec_score) ?? 0,
              row,
            };
          });

          const searchResult: ClickHouseVectorSearchResult = {
            hits,
            durationMs: Math.round(durationMs),
          };
          return c.json(searchResult);
        } finally {
          await client.close();
        }
      } catch (err) {
        return options.handleError(c, err, 'clickhouseVecSearch');
      }
    },
  );

  return router;
}
