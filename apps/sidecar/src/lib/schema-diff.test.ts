import test from 'node:test';
import assert from 'node:assert/strict';
import type { SchemaSnapshotRecord } from '@kamehadb/shared';
import { compareSchemaSnapshots, toSchemaChangelogChanges } from './schema-diff.js';
import { generateMigrationFromDiff } from './schema-migration.js';

const beforeSnapshot: SchemaSnapshotRecord = {
  id: 'before',
  connectionId: 'pg',
  capturedAt: '2026-06-16T00:00:00.000Z',
  tables: [
    {
      id: 'public.accounts',
      name: 'accounts',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, default: null, primaryKey: true },
        { name: 'name', type: 'text', nullable: false, default: null, primaryKey: false },
        { name: 'status', type: 'text', nullable: true, default: "'active'", primaryKey: false },
      ],
      indexes: [{ name: 'accounts_name_idx', columns: ['name'], unique: false, primary: false }],
    },
  ],
};

const afterSnapshot: SchemaSnapshotRecord = {
  id: 'after',
  connectionId: 'pg',
  capturedAt: '2026-06-16T01:00:00.000Z',
  tables: [
    {
      id: 'public.accounts',
      name: 'accounts',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, default: null, primaryKey: true },
        { name: 'full_name', type: 'text', nullable: false, default: null, primaryKey: false },
        { name: 'status', type: 'varchar(20)', nullable: false, default: "'active'", primaryKey: false },
      ],
      indexes: [{ name: 'accounts_name_idx', columns: ['full_name'], unique: true, primary: false }],
    },
    {
      id: 'public.audit_logs',
      name: 'audit_logs',
      schema: 'public',
      columns: [{ name: 'id', type: 'bigint', nullable: false, default: null, primaryKey: true }],
      indexes: [],
    },
  ],
};

test('compareSchemaSnapshots returns structured table, column, and index diffs', () => {
  const diff = compareSchemaSnapshots(beforeSnapshot, afterSnapshot);

  assert.equal(diff.stats.tableAdds, 1);
  assert.equal(diff.stats.columnAdds, 1);
  assert.equal(diff.stats.columnRemovals, 1);
  assert.equal(diff.stats.columnChanges, 1);
  assert.equal(diff.stats.indexChanges, 1);

  const changedTable = diff.tableDiffs.find(
    (tableDiff) => tableDiff.type === 'changed' && tableDiff.tableId === 'public.accounts',
  );
  assert.ok(changedTable);
  if (!changedTable || changedTable.type !== 'changed') return;

  const renamedIndex = changedTable.indexDiffs.find((indexDiff) => indexDiff.type === 'changed');
  assert.ok(renamedIndex);
  const statusColumn = changedTable.columnDiffs.find(
    (columnDiff) => columnDiff.type === 'changed' && columnDiff.columnName === 'status',
  );
  assert.ok(statusColumn);
});

test('changelog and migration output stay aligned with the structured diff', () => {
  const diff = compareSchemaSnapshots(beforeSnapshot, afterSnapshot);
  const changes = toSchemaChangelogChanges(diff);
  const migration = generateMigrationFromDiff(diff);

  assert.ok(changes.some((change) => change.type === 'table_added' && change.table === 'public.audit_logs'));
  assert.ok(changes.some((change) => change.type === 'column_removed' && change.column === 'name'));
  assert.ok(changes.some((change) => change.type === 'column_added' && change.column === 'full_name'));
  assert.ok(migration.statements.some((statement) => statement.includes('CREATE TABLE "public"."audit_logs"')));
  assert.ok(
    migration.statements.some((statement) => statement.includes('ALTER TABLE "public"."accounts" DROP COLUMN "name"')),
  );
  assert.ok(migration.statements.some((statement) => statement.includes('CREATE UNIQUE INDEX "accounts_name_idx"')));
});
