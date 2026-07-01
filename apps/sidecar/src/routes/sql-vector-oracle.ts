import { zValidator } from '@hono/zod-validator';
import { DEFAULT_PORTS, KIND } from '@kamehadb/shared';
import type {
  OracleVectorCapability,
  OracleVectorColumn,
  OracleVectorSearchHit,
  OracleVectorSearchResult,
} from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import oracledb from 'oracledb';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { httpError } from '../lib/route-utils.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;

type OracleProfile = ReturnType<typeof getOracleProfile>;

function getOracleProfile(connectionId: string | undefined) {
  if (!connectionId) throw httpError('Connection not found', 404);
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw httpError('Connection not found', 404);
  if (profile.kind !== KIND.ORACLE) {
    throw httpError('Oracle vector search requires an Oracle connection', 400);
  }
  return profile;
}

function getOracleConnectOptions(profile: OracleProfile, password?: string) {
  return {
    connectString: `${profile.host || 'localhost'}:${profile.port || DEFAULT_PORTS[KIND.ORACLE]}/${profile.database || 'FREEPDB1'}`,
    user: profile.username,
    password: password ?? '',
  };
}

function quoteOracleIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function serializeOracleValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object' && typeof (value as { getData?: unknown }).getData === 'function') {
    return '[CLOB]';
  }
  return value;
}

function buildDistanceExpression(metric: 'cosine' | 'l2' | 'inner_product', quotedColumn: string): string {
  if (metric === 'inner_product') {
    return `INNER_PRODUCT(${quotedColumn}, TO_VECTOR(:queryVector))`;
  }
  if (metric === 'l2') {
    return `L2_DISTANCE(${quotedColumn}, TO_VECTOR(:queryVector))`;
  }
  return `COSINE_DISTANCE(${quotedColumn}, TO_VECTOR(:queryVector))`;
}

function buildOrderDirection(metric: 'cosine' | 'l2' | 'inner_product'): 'ASC' | 'DESC' {
  return metric === 'inner_product' ? 'DESC' : 'ASC';
}

export function createSqlVectorOracleRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  router.get('/oracle-vec/capabilities', async (c) => {
    const connectionId = c.req.param('connectionId');
    const cacheKey = `oracle-vec-cap:${connectionId}`;
    const cached = getCached<OracleVectorCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    let conn: oracledb.Connection | null = null;
    try {
      const profile = getOracleProfile(connectionId);
      const password = metadataStore.getProfilePassword(connectionId!);
      conn = await oracledb.getConnection(getOracleConnectOptions(profile, password ?? undefined));

      const versionResult = await conn.execute(
        "SELECT banner FROM v$version WHERE banner LIKE 'Oracle%' FETCH FIRST 1 ROWS ONLY",
      );
      const version = (versionResult.rows?.[0] as Record<string, string> | undefined)?.BANNER ?? null;

      const columnsResult = await conn.execute(
        `SELECT owner, table_name, column_name, char_length
         FROM all_tab_cols
         WHERE data_type = 'VECTOR'
           AND owner = :owner
         ORDER BY owner, table_name, column_name`,
        { owner: profile.username?.toUpperCase() ?? '' },
      );

      const columns: OracleVectorColumn[] = (columnsResult.rows as Record<string, unknown>[]).map((row) => ({
        tableSchema: String(row.OWNER ?? ''),
        tableName: String(row.TABLE_NAME ?? ''),
        columnName: String(row.COLUMN_NAME ?? ''),
        dimensions: Number(row.CHAR_LENGTH ?? 0),
      }));

      const capability: OracleVectorCapability = {
        available: true,
        version,
        columns,
      };
      setCache(cacheKey, capability);
      return c.json(capability);
    } catch (error) {
      return options.handleError(c, error, 'oracleVecCapabilities');
    } finally {
      await conn?.close().catch(() => {});
    }
  });

  router.post(
    '/oracle-vec/search',
    zValidator(
      'json',
      z.object({
        schema: z.string().optional(),
        table: z.string().min(1),
        column: z.string().min(1),
        vector: z.array(z.number()).min(1),
        metric: z.enum(['cosine', 'l2', 'inner_product']).optional(),
        limit: z.number().int().positive().max(1000).optional(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');
      let conn: oracledb.Connection | null = null;

      try {
        const profile = getOracleProfile(connectionId);
        const password = metadataStore.getProfilePassword(connectionId!);
        conn = await oracledb.getConnection(getOracleConnectOptions(profile, password ?? undefined));

        const schema = (input.schema ?? profile.username ?? '').toUpperCase();
        const validateResult = await conn.execute(
          `SELECT owner, table_name, column_name, char_length
           FROM all_tab_cols
           WHERE owner = :owner
             AND table_name = :tableName
             AND column_name = :columnName
             AND data_type = 'VECTOR'`,
          {
            owner: schema,
            tableName: input.table.toUpperCase(),
            columnName: input.column.toUpperCase(),
          },
        );

        if ((validateResult.rows?.length ?? 0) === 0) {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Column "${schema}"."${input.table}"."${input.column}" was not found or is not a VECTOR column`,
            },
            400,
          );
        }

        const metadata = validateResult.rows?.[0] as Record<string, unknown>;
        const dimensions = Number(metadata.CHAR_LENGTH ?? 0);
        if (dimensions > 0 && input.vector.length !== dimensions) {
          return c.json(
            {
              error: 'BAD_REQUEST',
              message: `Vector dimension mismatch: column expects ${dimensions} dimensions but query provides ${input.vector.length}`,
            },
            400,
          );
        }

        const quotedSchema = quoteOracleIdentifier(String(metadata.OWNER));
        const quotedTable = quoteOracleIdentifier(String(metadata.TABLE_NAME));
        const quotedColumn = quoteOracleIdentifier(String(metadata.COLUMN_NAME));
        const metric = input.metric ?? 'cosine';
        const distanceExpression = buildDistanceExpression(metric, `t.${quotedColumn}`);
        const orderDirection = buildOrderDirection(metric);
        const limit = input.limit ?? 10;

        const searchSql = `SELECT *
          FROM (
            SELECT
              ROWIDTOCHAR(t.ROWID) AS ROW_ID_VALUE,
              t.*,
              ${distanceExpression} AS VEC_SCORE
            FROM ${quotedSchema}.${quotedTable} t
            WHERE t.${quotedColumn} IS NOT NULL
            ORDER BY VEC_SCORE ${orderDirection}
          )
          WHERE ROWNUM <= ${limit}`;

        const start = performance.now();
        const searchResult = await conn.execute(searchSql, {
          queryVector: `[${input.vector.join(',')}]`,
        });
        const durationMs = performance.now() - start;

        const hits: OracleVectorSearchHit[] = (searchResult.rows as Record<string, unknown>[]).map((row) => {
          const score = Number(row.VEC_SCORE ?? 0);
          const id = String(row.ROW_ID_VALUE ?? '');
          const resultRow: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            if (key === 'ROW_ID_VALUE' || key === 'VEC_SCORE' || key === String(metadata.COLUMN_NAME)) continue;
            resultRow[key] = serializeOracleValue(value);
          }
          return { id, score, row: resultRow };
        });

        const result: OracleVectorSearchResult = {
          hits,
          durationMs: Math.round(durationMs),
        };
        return c.json(result);
      } catch (error) {
        return options.handleError(c, error, 'oracleVecSearch');
      } finally {
        await conn?.close().catch(() => {});
      }
    },
  );

  return router;
}
