import type {
  MigrationInput,
  SchemaDiffInput,
  SchemaSnapshotRecord,
  SchemaSnapshotSource,
  SchemaSnapshotSummary,
  SqlAdapter,
} from '@kamehadb/shared';
import { resolveDialect } from '@kamehadb/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { httpError } from '../lib/route-utils.js';
import { compareSchemaSnapshots, toSchemaChangelogChanges } from '../lib/schema-diff.js';
import { generateMigrationFromDiff } from '../lib/schema-migration.js';
import { schemaWatcher } from '../lib/schema-watcher.js';
import { WATCHER_DEFAULT_INTERVAL_MS, WATCHER_MIN_INTERVAL_MS } from '../lib/constants.js';

type ErrorHandler = (context: Context, error: unknown, scope: string) => Response;
type AdapterLoader = (connectionId: string) => Promise<SqlAdapter>;

function hydrateSnapshot(snapshotId: string, raw: string): SchemaSnapshotRecord {
  const parsed = JSON.parse(raw) as Omit<SchemaSnapshotRecord, 'id'> & Partial<Pick<SchemaSnapshotRecord, 'id'>>;
  return { ...parsed, id: parsed.id ?? snapshotId };
}

function loadSnapshot(connectionId: string, snapshotId: string): SchemaSnapshotRecord | null {
  const raw = metadataStore.getSchemaSnapshotData(snapshotId);
  if (!raw) return null;
  const snapshot = hydrateSnapshot(snapshotId, raw);
  return snapshot.connectionId === connectionId ? snapshot : null;
}

function requireConnectionId(context: Context): string {
  const connectionId = context.req.param('connectionId');
  if (!connectionId) throw new Error('Connection not found');
  return connectionId;
}

function toSnapshotSummary(snapshot: SchemaSnapshotRecord): SchemaSnapshotSummary {
  return {
    id: snapshot.id,
    connectionId: snapshot.connectionId,
    capturedAt: snapshot.capturedAt,
    tableCount: snapshot.tables.length,
    source: snapshot.source,
  };
}

/** Capture a schema snapshot for a connection using the given adapter.
 * Extracted from the POST /schema/snapshots route so the watcher can reuse
 * the exact same capture logic for auto-snapshots. */
async function captureSnapshot(
  connectionId: string,
  adapter: SqlAdapter,
  source: SchemaSnapshotSource = 'manual',
): Promise<{ id: string; capturedAt: string; tableCount: number }> {
  // Capture tables from every schema, not just the default one.
  // Multi-schema databases (e.g. PostgreSQL) otherwise produce incomplete snapshots.
  const schemas = await adapter.listSchemas();
  const schemaNames = schemas.map((s) => s.name);
  const allTables = (
    await Promise.all(
      schemaNames.length > 0 ? schemaNames.map((schema) => adapter.listTables(schema)) : [adapter.listTables()],
    )
  ).flat();

  if (allTables.length === 0) throw httpError('No tables found in this database', 400);

  const snapshot = {
    connectionId,
    capturedAt: new Date().toISOString(),
    tables: await Promise.all(
      allTables.map(async (table) => ({
        id: table.id,
        name: table.name,
        schema: table.schema,
        columns: await adapter.getTableColumns(table.id),
        indexes: await adapter.getTableIndexes(table.id),
      })),
    ),
    source,
  } satisfies Omit<SchemaSnapshotRecord, 'id'>;

  const id = metadataStore.saveSchemaSnapshot(connectionId, JSON.stringify(snapshot));
  metadataStore.deleteOldSchemaSnapshots(connectionId, 50);
  return { id, capturedAt: snapshot.capturedAt, tableCount: snapshot.tables.length };
}

export function createSqlSchemaRouter(options: {
  readonly getSqlAdapter: AdapterLoader;
  readonly handleError: ErrorHandler;
}): Hono {
  const router = new Hono();

  // Inject the capture function into the watcher so it can capture snapshots
  // without importing this route file (avoids circular dependency).
  schemaWatcher.setCaptureFn(async (connectionId: string, source: SchemaSnapshotSource) => {
    const adapter = await options.getSqlAdapter(connectionId);
    await captureSnapshot(connectionId, adapter, source);
  });

  router.post('/schema/snapshots', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      const adapter = await options.getSqlAdapter(connectionId);
      const result = await captureSnapshot(connectionId, adapter, 'manual');
      return context.json(result);
    } catch (error) {
      return options.handleError(context, error, 'captureSchema');
    }
  });

  router.get('/schema/snapshots', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      const summaries = metadataStore.getSchemaSnapshots(connectionId).flatMap((entry) => {
        const snapshot = loadSnapshot(connectionId, entry.id);
        return snapshot ? [toSnapshotSummary(snapshot)] : [];
      });
      return context.json({ snapshots: summaries });
    } catch (error) {
      return options.handleError(context, error, 'schemaSnapshots');
    }
  });

  router.get('/schema/changelog', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      const snapshotEntries = metadataStore.getSchemaSnapshots(connectionId);
      if (snapshotEntries.length === 0) return context.json({ entries: [] });

      const entries = snapshotEntries.flatMap((entry, index) => {
        const snapshot = loadSnapshot(connectionId, entry.id);
        if (!snapshot) return [];
        if (index === 0) return [{ snapshotId: snapshot.id, capturedAt: snapshot.capturedAt, changes: [] }];

        const previous = loadSnapshot(connectionId, snapshotEntries[index - 1].id);
        if (!previous) return [];
        return [
          {
            snapshotId: snapshot.id,
            capturedAt: snapshot.capturedAt,
            changes: toSchemaChangelogChanges(compareSchemaSnapshots(previous, snapshot)),
          },
        ];
      });

      return context.json({ entries });
    } catch (error) {
      return options.handleError(context, error, 'schemaChangelog');
    }
  });

  router.post(
    '/schema/diff',
    zValidator('json', z.object({ fromSnapshotId: z.string(), toSnapshotId: z.string() })),
    async (context) => {
      try {
        const connectionId = requireConnectionId(context);
        const input = context.req.valid('json') as SchemaDiffInput;
        const fromSnapshot = loadSnapshot(connectionId, input.fromSnapshotId);
        const toSnapshot = loadSnapshot(connectionId, input.toSnapshotId);
        if (!fromSnapshot || !toSnapshot)
          return context.json({ error: 'NOT_FOUND', message: 'Snapshot not found' }, 404);
        return context.json(compareSchemaSnapshots(fromSnapshot, toSnapshot));
      } catch (error) {
        return options.handleError(context, error, 'schemaDiff');
      }
    },
  );

  router.post(
    '/schema/migrations',
    zValidator('json', z.object({ fromSnapshotId: z.string(), toSnapshotId: z.string() })),
    async (context) => {
      try {
        const connectionId = requireConnectionId(context);
        const input = context.req.valid('json') as MigrationInput;
        const profile = metadataStore.getProfile(connectionId);
        const dialect = profile ? resolveDialect(profile.kind) : 'postgresql';
        const fromSnapshot = loadSnapshot(connectionId, input.fromSnapshotId);
        const toSnapshot = loadSnapshot(connectionId, input.toSnapshotId);
        if (!fromSnapshot || !toSnapshot)
          return context.json({ error: 'NOT_FOUND', message: 'Snapshot not found' }, 404);
        return context.json(generateMigrationFromDiff(compareSchemaSnapshots(fromSnapshot, toSnapshot), dialect));
      } catch (error) {
        return options.handleError(context, error, 'generateMigration');
      }
    },
  );

  // --- Schema watcher routes ---

  router.post('/schema/watcher/start', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      let body: { intervalMs?: number };
      try {
        body = await context.req.json();
      } catch {
        return context.json({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }, 400);
      }
      const intervalMs = body.intervalMs ?? WATCHER_DEFAULT_INTERVAL_MS;
      if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < WATCHER_MIN_INTERVAL_MS) {
        return context.json(
          { error: 'INVALID_INTERVAL', message: `Minimum interval is ${WATCHER_MIN_INTERVAL_MS}ms` },
          400,
        );
      }
      schemaWatcher.startCadence(connectionId, intervalMs);
      return context.json({ ok: true });
    } catch (error) {
      return options.handleError(context, error, 'startWatcher');
    }
  });

  router.post('/schema/watcher/stop', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      schemaWatcher.stopCadence(connectionId);
      return context.json({ ok: true });
    } catch (error) {
      return options.handleError(context, error, 'stopWatcher');
    }
  });

  router.get('/schema/watcher/status', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      const status = schemaWatcher.getStatus(connectionId);
      return context.json(status);
    } catch (error) {
      return options.handleError(context, error, 'watcherStatus');
    }
  });

  router.post('/schema/watcher/notify/start', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      await schemaWatcher.startNotify(connectionId);
      return context.json({ ok: true });
    } catch (error) {
      return options.handleError(context, error, 'startNotifyWatcher');
    }
  });

  router.post('/schema/watcher/notify/stop', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      schemaWatcher.stopNotify(connectionId);
      return context.json({ ok: true });
    } catch (error) {
      return options.handleError(context, error, 'stopNotifyWatcher');
    }
  });

  return router;
}
