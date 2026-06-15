import { zValidator } from '@hono/zod-validator';
import { isQuerySafe, type SqlAdapter } from '@kamehadb/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createMongoDbAdapter, createSqlAdapter } from '../adapters/factory.js';
import * as metadataStore from '../db/metadata-store.js';
import { CACHE_TTL, getCached, setCache } from '../lib/cache.js';

export const sqlRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`[SQL] ${context}:`, message);
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

  if (profile.kind !== 'mongodb') {
    throw new Error('Use /sql endpoint for non-MongoDB connections');
  }

  return createMongoDbAdapter(profile);
}

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
sqlRouter.get('/:connectionId/completions', async (c) => {
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
sqlRouter.get('/:connectionId/search-schema', async (c) => {
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
  '/:connectionId/preview',
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
sqlRouter.get('/:connectionId/tables/:tableId/index-stats', async (c) => {
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
sqlRouter.get('/:connectionId/sizes', async (c) => {
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
sqlRouter.get('/:connectionId/connections', async (c) => {
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

// Schema snapshot — capture full table/column/index structure
sqlRouter.post('/:connectionId/capture-schema', async (c) => {
  const connectionId = c.req.param('connectionId');
  try {
    const adapter = await getSqlAdapter(connectionId);
    const tables = await adapter.listTables();
    if (!tables || tables.length === 0) {
      return c.json({ error: 'EMPTY', message: 'No tables found in this database' }, 400);
    }

    const snapshot = {
      connectionId,
      capturedAt: new Date().toISOString(),
      tables: await Promise.all(
        tables.map(async (t) => ({
          id: t.id,
          name: t.name,
          schema: t.schema,
          columns: await adapter.getTableColumns(t.id),
          indexes: await adapter.getTableIndexes(t.id),
        })),
      ),
    };

    const id = metadataStore.saveSchemaSnapshot(connectionId, JSON.stringify(snapshot));
    // Keep only the last 50 snapshots per connection
    metadataStore.deleteOldSchemaSnapshots(connectionId, 50);

    return c.json({ id, capturedAt: snapshot.capturedAt, tableCount: snapshot.tables.length });
  } catch (err) {
    return handleError(c, err, 'captureSchema');
  }
});

// Schema changelog — diff consecutive snapshots
sqlRouter.get('/:connectionId/schema-changelog', async (c) => {
  const connectionId = c.req.param('connectionId');
  try {
    const snapshots = metadataStore.getSchemaSnapshots(connectionId);
    if (snapshots.length === 0) {
      return c.json({ entries: [] });
    }

    const entries: import('@kamehadb/shared').SchemaChangelogEntry[] = [];

    // First snapshot has no previous to compare against — include it as initial state
    entries.push({
      snapshotId: snapshots[0].id,
      capturedAt: snapshots[0].capturedAt,
      changes: [],
    });

    // Diff consecutive snapshots
    for (let i = 1; i < snapshots.length; i++) {
      const prevRaw = metadataStore.getSchemaSnapshotData(snapshots[i - 1].id);
      const currRaw = metadataStore.getSchemaSnapshotData(snapshots[i].id);
      if (!prevRaw || !currRaw) continue;

      const prev = JSON.parse(prevRaw) as import('@kamehadb/shared').SchemaSnapshotRecord;
      const curr = JSON.parse(currRaw) as import('@kamehadb/shared').SchemaSnapshotRecord;

      const prevTables = new Map(prev.tables.map((t) => [t.id, t]));
      const currTables = new Map(curr.tables.map((t) => [t.id, t]));
      const changes: import('@kamehadb/shared').SchemaChangeDescriptor[] = [];

      // Tables added / removed
      for (const id of currTables.keys()) {
        if (!prevTables.has(id)) changes.push({ type: 'table_added', table: id });
      }
      for (const id of prevTables.keys()) {
        if (!currTables.has(id)) changes.push({ type: 'table_removed', table: id });
      }

      // Column and index changes in common tables
      for (const [id, currTable] of currTables) {
        const prevTable = prevTables.get(id);
        if (!prevTable) continue;

        const prevCols = new Map(prevTable.columns.map((c) => [c.name, c]));
        const currCols = new Map(currTable.columns.map((c) => [c.name, c]));

        for (const [name, col] of currCols) {
          if (!prevCols.has(name)) {
            changes.push({ type: 'column_added', table: id, column: name, dataType: col.type });
          }
        }
        for (const [name, col] of prevCols) {
          if (!currCols.has(name)) {
            changes.push({ type: 'column_removed', table: id, column: name, dataType: col.type });
          }
        }
        for (const [name, currCol] of currCols) {
          const prevCol = prevCols.get(name);
          if (prevCol && prevCol.type !== currCol.type) {
            changes.push({ type: 'column_changed', table: id, column: name, from: prevCol.type, to: currCol.type });
          }
        }

        const prevIdxs = new Map(prevTable.indexes.map((i) => [i.name, i]));
        const currIdxs = new Map(currTable.indexes.map((i) => [i.name, i]));

        for (const [name, idx] of currIdxs) {
          if (!prevIdxs.has(name)) changes.push({ type: 'index_added', table: id, index: name, columns: idx.columns });
        }
        for (const [name, idx] of prevIdxs) {
          if (!currIdxs.has(name))
            changes.push({ type: 'index_removed', table: id, index: name, columns: idx.columns });
        }
      }

      entries.push({
        snapshotId: snapshots[i].id,
        capturedAt: snapshots[i].capturedAt,
        changes,
      });
    }

    return c.json({ entries });
  } catch (err) {
    return handleError(c, err, 'schemaChangelog');
  }
});

// Migration assistant — generate SQL from schema diff
sqlRouter.post(
  '/:connectionId/generate-migration',
  zValidator(
    'json',
    z.object({
      fromSnapshotId: z.string(),
      toSnapshotId: z.string(),
    }),
  ),
  async (c) => {
    try {
      const input = c.req.valid('json');
      const fromRaw = metadataStore.getSchemaSnapshotData(input.fromSnapshotId);
      const toRaw = metadataStore.getSchemaSnapshotData(input.toSnapshotId);
      if (!fromRaw || !toRaw) {
        return c.json({ error: 'NOT_FOUND', message: 'Snapshot not found' }, 404);
      }

      const from = JSON.parse(fromRaw) as import('@kamehadb/shared').SchemaSnapshotRecord;
      const to = JSON.parse(toRaw) as import('@kamehadb/shared').SchemaSnapshotRecord;
      const fromTables = new Map(from.tables.map((t) => [t.id, t]));
      const toTables = new Map(to.tables.map((t) => [t.id, t]));
      const stmts: string[] = [];

      stmts.push(`-- Migration: ${from.capturedAt} → ${to.capturedAt}`);
      stmts.push('');

      // Tables added — generate CREATE TABLE with full column defs
      for (const [id, table] of toTables) {
        if (!fromTables.has(id)) {
          const cols = table.columns
            .map((c) => {
              const parts = [`  ${c.name} ${c.type}`];
              if (c.primaryKey) parts.push('PRIMARY KEY');
              if (!c.nullable) parts.push('NOT NULL');
              if (c.default !== null && c.default !== undefined) parts.push(`DEFAULT ${c.default}`);
              return parts.join(' ');
            })
            .join(',\n');
          stmts.push(`CREATE TABLE ${id} (\n${cols}\n);`);
          for (const idx of table.indexes) {
            if (idx.primary) continue;
            const unique = idx.unique ? 'UNIQUE ' : '';
            stmts.push(`CREATE ${unique}INDEX ${idx.name} ON ${id} (${idx.columns.join(', ')});`);
          }
          stmts.push('');
        }
      }

      // Tables removed
      for (const id of fromTables.keys()) {
        if (!toTables.has(id)) {
          stmts.push(`DROP TABLE IF EXISTS ${id};`);
          stmts.push('');
        }
      }

      // Column and index changes in common tables
      for (const [id, toTable] of toTables) {
        const fromTable = fromTables.get(id);
        if (!fromTable) continue;

        const fromCols = new Map(fromTable.columns.map((c) => [c.name, c]));
        const toCols = new Map(toTable.columns.map((c) => [c.name, c]));

        // Columns added
        for (const [name, col] of toCols) {
          if (!fromCols.has(name)) {
            const parts = [`ALTER TABLE ${id} ADD COLUMN ${name} ${col.type}`];
            if (!col.nullable) parts.push('NOT NULL');
            if (col.default !== null && col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
            stmts.push(parts.join(' ') + ';');
          }
        }

        // Columns removed
        for (const [name, col] of fromCols) {
          if (!toCols.has(name)) {
            stmts.push(`ALTER TABLE ${id} DROP COLUMN ${name};`);
          }
        }

        // Columns changed
        for (const [name, toCol] of toCols) {
          const fromCol = fromCols.get(name);
          if (fromCol && fromCol.type !== toCol.type) {
            stmts.push(`ALTER TABLE ${id} ALTER COLUMN ${name} TYPE ${toCol.type};`);
          }
        }

        // Indexes added
        const fromIdxs = new Map(fromTable.indexes.map((i) => [i.name, i]));
        const toIdxs = new Map(toTable.indexes.map((i) => [i.name, i]));
        for (const [name, idx] of toIdxs) {
          if (!fromIdxs.has(name)) {
            const unique = idx.unique ? 'UNIQUE ' : '';
            stmts.push(`CREATE ${unique}INDEX ${name} ON ${id} (${idx.columns.join(', ')});`);
          }
        }

        // Indexes removed
        for (const [name, idx] of fromIdxs) {
          if (!toIdxs.has(name)) {
            stmts.push(`DROP INDEX IF EXISTS ${name};`);
          }
        }
      }

      return c.json({
        statements: stmts,
        dialect: 'postgresql',
        fromSnapshot: from.capturedAt,
        toSnapshot: to.capturedAt,
      } satisfies import('@kamehadb/shared').MigrationResult);
    } catch (err) {
      return handleError(c, err, 'generateMigration');
    }
  },
);
