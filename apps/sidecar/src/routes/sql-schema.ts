import {
  type MigrationInput,
  type SchemaDiffInput,
  type SchemaSnapshotRecord,
  type SchemaSnapshotSummary,
  type SqlAdapter,
  resolveDialect,
  DEFAULT_DIALECT,
} from '@kamehadb/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import * as metadataStore from '../db/metadata-store.js';
import { compareSchemaSnapshots, toSchemaChangelogChanges } from '../lib/schema-diff.js';
import { generateMigrationFromDiff } from '../lib/schema-migration.js';

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
  };
}

export function createSqlSchemaRouter(options: {
  readonly getSqlAdapter: AdapterLoader;
  readonly handleError: ErrorHandler;
}): Hono {
  const router = new Hono();

  router.post('/schema/snapshots', async (context) => {
    try {
      const connectionId = requireConnectionId(context);
      const adapter = await options.getSqlAdapter(connectionId);
      // Capture tables from every schema, not just the default one.
      // Multi-schema databases (e.g. PostgreSQL) otherwise produce
      // incomplete snapshots and diffs.
      const schemas = await adapter.listSchemas();
      const schemaNames = schemas.map((s) => s.name);
      const allTables = (
        await Promise.all(
          schemaNames.length > 0 ? schemaNames.map((schema) => adapter.listTables(schema)) : [adapter.listTables()],
        )
      ).flat();

      if (allTables.length === 0)
        return context.json({ error: 'EMPTY', message: 'No tables found in this database' }, 400);

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
      } satisfies Omit<SchemaSnapshotRecord, 'id'>;

      const id = metadataStore.saveSchemaSnapshot(connectionId, JSON.stringify(snapshot));
      metadataStore.deleteOldSchemaSnapshots(connectionId, 50);
      return context.json({ id, capturedAt: snapshot.capturedAt, tableCount: snapshot.tables.length });
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
        const dialect = profile ? resolveDialect(profile.kind) : DEFAULT_DIALECT;
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

  return router;
}
