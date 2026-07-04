import { zValidator } from '@hono/zod-validator';
import { KIND } from '@kamehadb/shared';
import type {
  SqlServerVecCapability,
  SqlServerVecColumn,
  SqlServerVecSearchHit,
  SqlServerVecSearchResult,
} from '@kamehadb/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';
import { handleError, httpError } from '../lib/route-utils.js';
import { buildSafeFilterClauseSqlServer } from '../lib/sqlserver-vector-sql.js';
import { getSqlAdapter } from './sql.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;
type SqlServerAdapter = Awaited<ReturnType<typeof getSqlAdapter>>;

type SqlServerVectorColumnMeta = {
  schemaName: string;
  tableName: string;
  columnName: string;
  dimensions: number;
};

function getSqlServerProfile(connectionId: string | undefined) {
  if (!connectionId) throw httpError('Connection not found', 404);
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw httpError('Connection not found', 404);
  }
  if (profile.kind !== KIND.SQLSERVER) {
    throw httpError('SQL Server vector search requires a SQL Server connection', 400);
  }
  return profile;
}

function escapeId(id: string): string {
  return '[' + id.replace(/\]/g, ']]') + ']';
}

function parseVectorDimensions(typeName: string, maxLength: number): number {
  // SQL Server 2025 VECTOR type: 8-byte header + 4 bytes per float32 element
  if (maxLength > 8) {
    return Math.floor((maxLength - 8) / 4);
  }
  const match = typeName.match(/vector\s*\(\s*(\d+)\s*\)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function decodeVector(value: unknown): number[] {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as number[];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? (value as number[]) : [];
}

async function listVectorColumns(adapter: SqlServerAdapter): Promise<SqlServerVectorColumnMeta[]> {
  const result = await adapter.runQuery({
    query: `
      SELECT
        s.name AS schema_name,
        t.name AS table_name,
        c.name AS column_name,
        ty.name AS type_name,
        c.max_length
      FROM sys.columns c
      JOIN sys.tables t ON c.object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE ty.name = 'vector'
      ORDER BY s.name, t.name, c.column_id
    `,
  });

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    const typeName = record.type_name as string;
    const maxLength = Number(record.max_length ?? 0);
    return {
      schemaName: record.schema_name as string,
      tableName: record.table_name as string,
      columnName: record.column_name as string,
      dimensions: parseVectorDimensions(typeName, maxLength),
    };
  });
}

async function getVectorColumn(
  adapter: SqlServerAdapter,
  schema: string,
  table: string,
  column: string,
): Promise<SqlServerVectorColumnMeta | null> {
  const result = await adapter.runQuery({
    query: `
      SELECT
        s.name AS schema_name,
        t.name AS table_name,
        c.name AS column_name,
        ty.name AS type_name,
        c.max_length
      FROM sys.columns c
      JOIN sys.tables t ON c.object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE ty.name = 'vector'
        AND s.name = @p0
        AND t.name = @p1
        AND c.name = @p2
    `,
    params: [schema, table, column],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  const typeName = row.type_name as string;
  const maxLength = Number(row.max_length ?? 0);
  return {
    schemaName: row.schema_name as string,
    tableName: row.table_name as string,
    columnName: row.column_name as string,
    dimensions: parseVectorDimensions(typeName, maxLength),
  };
}

async function getMetadataColumns(adapter: SqlServerAdapter, schema: string, table: string): Promise<string[]> {
  const result = await adapter.runQuery({
    query: `
      SELECT c.name AS column_name
      FROM sys.columns c
      JOIN sys.tables t ON c.object_id = t.object_id
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE s.name = @p0
        AND t.name = @p1
        AND ty.name != 'vector'
      ORDER BY c.column_id
    `,
    params: [schema, table],
  });

  return result.rows.map((row) => (row as Record<string, unknown>).column_name as string);
}

export function createSqlVectorSqlServerRouter(options: { readonly handleError: ErrorHandler }): Hono {
  const router = new Hono();

  router.get('/sqlserver-vec/capabilities', async (c) => {
    const connectionId = c.req.param('connectionId');
    const cacheKey = `sqlserver-vec-cap:${connectionId}`;
    const cached = getCached<SqlServerVecCapability>(cacheKey, CACHE_TTL.STATS);
    if (cached) return c.json(cached);

    try {
      const profile = getSqlServerProfile(connectionId);
      const adapter = await getSqlAdapter(profile.id);
      const vecTypeResult = await adapter.runQuery({
        query: `SELECT name FROM sys.types WHERE name = 'vector'`,
      });

      let version: string | null = null;
      let columns: SqlServerVecColumn[] = [];
      const metadataColumns: Record<string, string[]> = {};
      const available = vecTypeResult.rows.length > 0;

      if (available) {
        const versionResult = await adapter.runQuery({
          query: `SELECT @@VERSION AS version`,
        });
        version = ((versionResult.rows[0] as Record<string, unknown> | undefined)?.version as string) ?? null;

        const vectorColumns = await listVectorColumns(adapter);
        columns = vectorColumns.map(({ schemaName, tableName, columnName, dimensions }) => ({
          schemaName,
          tableName,
          columnName,
          dimensions,
        }));

        for (const { schemaName, tableName } of vectorColumns) {
          const tableKey = `${schemaName}.${tableName}`;
          if (!metadataColumns[tableKey]) {
            metadataColumns[tableKey] = await getMetadataColumns(adapter, schemaName, tableName);
          }
        }
      }

      const capability: SqlServerVecCapability = {
        available,
        version,
        columns,
        metadataColumns,
      };
      setCache(cacheKey, capability);
      return c.json(capability);
    } catch (err) {
      return options.handleError(c, err, 'sqlserverVecCapabilities');
    }
  });

  router.post(
    '/sqlserver-vec/search',
    zValidator(
      'json',
      z.object({
        schema: z.string(),
        table: z.string(),
        column: z.string(),
        vector: z.array(z.number()).min(1),
        filter: z.string().optional(),
        metric: z.enum(['cosine', 'euclidean', 'dot']).optional(),
        limit: z.number().min(1).max(1000).optional(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        const profile = getSqlServerProfile(connectionId);
        const adapter = await getSqlAdapter(profile.id);
        const vectorColumn = await getVectorColumn(adapter, input.schema, input.table, input.column);
        if (!vectorColumn) {
          throw httpError(
            `Column "${input.schema}"."${input.table}"."${input.column}" not found or is not a vector column`,
            400,
          );
        }
        if (vectorColumn.dimensions > 0 && input.vector.length !== vectorColumn.dimensions) {
          throw httpError(
            `Vector dimension mismatch: column expects ${vectorColumn.dimensions} dimensions but query provides ${input.vector.length}`,
            400,
          );
        }

        const metric = input.metric ?? 'cosine';
        const limit = input.limit ?? 10;
        const quotedSchema = escapeId(input.schema);
        const quotedTable = escapeId(input.table);
        const quotedColumn = escapeId(input.column);
        const selectCols = (await getMetadataColumns(adapter, input.schema, input.table))
          .map((column) => `t.${escapeId(column)}`)
          .join(', ');
        const selectPrefix = selectCols ? `${selectCols}, ` : '';
        const filterClause = buildSafeFilterClauseSqlServer(input.filter ?? '', 1);
        const whereClause = filterClause ? ` WHERE ${filterClause.sql}` : '';
        const distanceExpr = `VECTOR_DISTANCE('${metric}', t.${quotedColumn}, CAST(@p0 AS vector(${vectorColumn.dimensions || input.vector.length})))`;
        const query = `SELECT TOP (${limit}) ${selectPrefix}${distanceExpr} AS distance FROM ${quotedSchema}.${quotedTable} AS t${whereClause} ORDER BY distance ASC`;

        const start = performance.now();
        const result = await adapter.runQuery({
          query,
          params: [JSON.stringify(input.vector), ...(filterClause?.params ?? [])],
        });
        const durationMs = performance.now() - start;

        const hits: SqlServerVecSearchHit[] = result.rows.map((row, index) => {
          const record = row as Record<string, unknown>;
          const { distance, ...rest } = record;
          return {
            id: index,
            score: metric === 'cosine' ? 1 - Number(distance) : -Number(distance),
            row: rest,
          };
        });

        const searchResult: SqlServerVecSearchResult = {
          hits,
          durationMs: Math.round(durationMs),
        };
        return c.json(searchResult);
      } catch (err) {
        return options.handleError(c, err, 'sqlserverVecSearch');
      }
    },
  );

  router.post(
    '/sqlserver-vec/sample',
    zValidator(
      'json',
      z.object({
        schema: z.string(),
        table: z.string(),
        column: z.string(),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        const profile = getSqlServerProfile(connectionId);
        const adapter = await getSqlAdapter(profile.id);
        const vectorColumn = await getVectorColumn(adapter, input.schema, input.table, input.column);
        if (!vectorColumn) {
          throw httpError(
            `Column "${input.schema}"."${input.table}"."${input.column}" not found or is not a vector column`,
            400,
          );
        }

        const result = await adapter.runQuery({
          query: `SELECT TOP 1 CAST(${escapeId(vectorColumn.columnName)} AS NVARCHAR(MAX)) AS vec FROM ${escapeId(vectorColumn.schemaName)}.${escapeId(vectorColumn.tableName)} ORDER BY NEWID()`,
        });
        if (result.rows.length === 0) {
          return c.json({ error: 'NO_VECTORS', message: 'No vectors found in this table' }, 404);
        }

        const vector = decodeVector((result.rows[0] as Record<string, unknown>).vec);
        return c.json({ vector, dimensions: vector.length });
      } catch (err) {
        return options.handleError(c, err, 'sqlserverVecSample');
      }
    },
  );

  router.post(
    '/sqlserver-vec/vectors/sample',
    zValidator(
      'json',
      z.object({
        schema: z.string(),
        table: z.string(),
        column: z.string(),
        limit: z.number().min(1).max(1000).default(500),
      }),
    ),
    async (c) => {
      const connectionId = c.req.param('connectionId');
      const input = c.req.valid('json');

      try {
        const profile = getSqlServerProfile(connectionId);
        const adapter = await getSqlAdapter(profile.id);
        const vectorColumn = await getVectorColumn(adapter, input.schema, input.table, input.column);
        if (!vectorColumn) {
          throw httpError(
            `Column "${input.schema}"."${input.table}"."${input.column}" not found or is not a vector column`,
            400,
          );
        }

        const selectCols = (await getMetadataColumns(adapter, input.schema, input.table))
          .map((column) => escapeId(column))
          .join(', ');
        const selectPrefix = selectCols ? `${selectCols}, ` : '';
        const result = await adapter.runQuery({
          query: `SELECT TOP (${input.limit}) ${selectPrefix}CAST(${escapeId(vectorColumn.columnName)} AS NVARCHAR(MAX)) AS vec FROM ${escapeId(vectorColumn.schemaName)}.${escapeId(vectorColumn.tableName)}`,
        });

        const points = result.rows.map((row, index) => {
          const record = row as Record<string, unknown>;
          const { vec, ...payload } = record;
          return {
            id: index,
            vector: decodeVector(vec),
            payload,
          };
        });

        const dimensions = points.length > 0 ? points[0].vector.length : 0;
        return c.json({ points, dimensions });
      } catch (err) {
        return options.handleError(c, err, 'sqlserverVecSampleBulk');
      }
    },
  );

  return router;
}
