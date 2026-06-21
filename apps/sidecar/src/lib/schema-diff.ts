import type {
  SchemaChangeDescriptor,
  SchemaColumnChangeField,
  SchemaColumnDiff,
  SchemaColumnSnapshot,
  SchemaDiffResult,
  SchemaDiffStats,
  SchemaIndexChangeField,
  SchemaIndexDiff,
  SchemaIndexSnapshot,
  SchemaSnapshotRecord,
  SchemaSnapshotSummary,
  SchemaTableDiff,
  SchemaValueChange,
} from '@kamehadb/shared';

const COLUMN_FIELDS = [
  'type',
  'nullable',
  'default',
  'primaryKey',
] as const satisfies readonly SchemaColumnChangeField[];
const INDEX_FIELDS = ['columns', 'unique', 'primary'] as const satisfies readonly SchemaIndexChangeField[];

function compareStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareColumns(
  beforeColumns: readonly SchemaColumnSnapshot[],
  afterColumns: readonly SchemaColumnSnapshot[],
): readonly SchemaColumnDiff[] {
  const beforeByName = new Map(beforeColumns.map((column) => [column.name, column]));
  const afterByName = new Map(afterColumns.map((column) => [column.name, column]));
  const diffs: SchemaColumnDiff[] = [];

  for (const column of afterColumns) {
    if (!beforeByName.has(column.name)) diffs.push({ type: 'added', column });
  }
  for (const column of beforeColumns) {
    if (!afterByName.has(column.name)) diffs.push({ type: 'removed', column });
  }
  for (const column of afterColumns) {
    const before = beforeByName.get(column.name);
    if (!before) continue;

    const changes = COLUMN_FIELDS.flatMap((field) => {
      if (before[field] === column[field]) return [];
      return [{ field, from: before[field], to: column[field] } satisfies SchemaValueChange<SchemaColumnChangeField>];
    });
    if (changes.length > 0) {
      diffs.push({ type: 'changed', columnName: column.name, before, after: column, changes });
    }
  }

  return diffs;
}

function compareIndexes(
  beforeIndexes: readonly SchemaIndexSnapshot[],
  afterIndexes: readonly SchemaIndexSnapshot[],
): readonly SchemaIndexDiff[] {
  const beforeByName = new Map(beforeIndexes.map((index) => [index.name, index]));
  const afterByName = new Map(afterIndexes.map((index) => [index.name, index]));
  const diffs: SchemaIndexDiff[] = [];

  for (const index of afterIndexes) {
    if (!beforeByName.has(index.name)) diffs.push({ type: 'added', index });
  }
  for (const index of beforeIndexes) {
    if (!afterByName.has(index.name)) diffs.push({ type: 'removed', index });
  }
  for (const index of afterIndexes) {
    const before = beforeByName.get(index.name);
    if (!before) continue;

    const changes: SchemaValueChange<SchemaIndexChangeField>[] = [];
    if (!compareStringArrays(before.columns, index.columns)) {
      changes.push({ field: 'columns', from: before.columns, to: index.columns });
    }
    for (const field of INDEX_FIELDS.filter((value) => value !== 'columns')) {
      if (before[field] !== index[field]) {
        changes.push({ field, from: before[field], to: index[field] });
      }
    }
    if (changes.length > 0) {
      diffs.push({ type: 'changed', indexName: index.name, before, after: index, changes });
    }
  }

  return diffs;
}

function buildStats(tableDiffs: readonly SchemaTableDiff[]): SchemaDiffStats {
  const stats = {
    tableAdds: 0,
    tableRemovals: 0,
    tableChanges: 0,
    columnAdds: 0,
    columnRemovals: 0,
    columnChanges: 0,
    indexAdds: 0,
    indexRemovals: 0,
    indexChanges: 0,
    totalChanges: 0,
  } satisfies SchemaDiffStats;

  for (const tableDiff of tableDiffs) {
    if (tableDiff.type === 'added') stats.tableAdds += 1;
    if (tableDiff.type === 'removed') stats.tableRemovals += 1;
    if (tableDiff.type !== 'changed') continue;

    stats.tableChanges += 1;
    for (const columnDiff of tableDiff.columnDiffs) {
      if (columnDiff.type === 'added') stats.columnAdds += 1;
      if (columnDiff.type === 'removed') stats.columnRemovals += 1;
      if (columnDiff.type === 'changed') stats.columnChanges += 1;
    }
    for (const indexDiff of tableDiff.indexDiffs) {
      if (indexDiff.type === 'added') stats.indexAdds += 1;
      if (indexDiff.type === 'removed') stats.indexRemovals += 1;
      if (indexDiff.type === 'changed') stats.indexChanges += 1;
    }
  }

  stats.totalChanges =
    stats.tableAdds +
    stats.tableRemovals +
    stats.columnAdds +
    stats.columnRemovals +
    stats.columnChanges +
    stats.indexAdds +
    stats.indexRemovals +
    stats.indexChanges;

  return stats;
}

export function buildSchemaSnapshotSummary(snapshot: SchemaSnapshotRecord): SchemaSnapshotSummary {
  return {
    id: snapshot.id,
    connectionId: snapshot.connectionId,
    capturedAt: snapshot.capturedAt,
    tableCount: snapshot.tables.length,
  };
}

export function compareSchemaSnapshots(before: SchemaSnapshotRecord, after: SchemaSnapshotRecord): SchemaDiffResult {
  const beforeById = new Map(before.tables.map((table) => [table.id, table]));
  const afterById = new Map(after.tables.map((table) => [table.id, table]));
  const tableIds = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort((left, right) =>
    left.localeCompare(right),
  );
  const tableDiffs: SchemaTableDiff[] = [];

  for (const tableId of tableIds) {
    const beforeTable = beforeById.get(tableId);
    const afterTable = afterById.get(tableId);
    if (!beforeTable && afterTable) {
      tableDiffs.push({ type: 'added', tableId, table: afterTable });
      continue;
    }
    if (beforeTable && !afterTable) {
      tableDiffs.push({ type: 'removed', tableId, table: beforeTable });
      continue;
    }
    if (!beforeTable || !afterTable) continue;

    const columnDiffs = compareColumns(beforeTable.columns, afterTable.columns);
    const indexDiffs = compareIndexes(beforeTable.indexes, afterTable.indexes);
    if (columnDiffs.length === 0 && indexDiffs.length === 0) continue;

    tableDiffs.push({
      type: 'changed',
      tableId,
      tableName: afterTable.name,
      schema: afterTable.schema,
      columnDiffs,
      indexDiffs,
      changeCount: columnDiffs.length + indexDiffs.length,
    });
  }

  return {
    fromSnapshot: buildSchemaSnapshotSummary(before),
    toSnapshot: buildSchemaSnapshotSummary(after),
    tableDiffs,
    stats: buildStats(tableDiffs),
  };
}

function formatColumnSignature(column: SchemaColumnSnapshot): string {
  const parts = [column.type, column.nullable ? 'NULL' : 'NOT NULL'];
  if (column.default !== null) parts.push(`DEFAULT ${column.default}`);
  if (column.primaryKey) parts.push('PRIMARY KEY');
  return parts.join(' ');
}

export function toSchemaChangelogChanges(diff: SchemaDiffResult): readonly SchemaChangeDescriptor[] {
  const changes: SchemaChangeDescriptor[] = [];

  for (const tableDiff of diff.tableDiffs) {
    if (tableDiff.type === 'added') changes.push({ type: 'table_added', table: tableDiff.tableId });
    if (tableDiff.type === 'removed') changes.push({ type: 'table_removed', table: tableDiff.tableId });
    if (tableDiff.type !== 'changed') continue;

    for (const columnDiff of tableDiff.columnDiffs) {
      if (columnDiff.type === 'added') {
        changes.push({
          type: 'column_added',
          table: tableDiff.tableId,
          column: columnDiff.column.name,
          dataType: columnDiff.column.type,
        });
      }
      if (columnDiff.type === 'removed') {
        changes.push({
          type: 'column_removed',
          table: tableDiff.tableId,
          column: columnDiff.column.name,
          dataType: columnDiff.column.type,
        });
      }
      if (columnDiff.type === 'changed') {
        changes.push({
          type: 'column_changed',
          table: tableDiff.tableId,
          column: columnDiff.columnName,
          from: formatColumnSignature(columnDiff.before),
          to: formatColumnSignature(columnDiff.after),
        });
      }
    }
    for (const indexDiff of tableDiff.indexDiffs) {
      if (indexDiff.type === 'added')
        changes.push({
          type: 'index_added',
          table: tableDiff.tableId,
          index: indexDiff.index.name,
          columns: indexDiff.index.columns,
        });
      if (indexDiff.type === 'removed')
        changes.push({
          type: 'index_removed',
          table: tableDiff.tableId,
          index: indexDiff.index.name,
          columns: indexDiff.index.columns,
        });
      if (indexDiff.type === 'changed') {
        changes.push({
          type: 'index_removed',
          table: tableDiff.tableId,
          index: indexDiff.before.name,
          columns: indexDiff.before.columns,
        });
        changes.push({
          type: 'index_added',
          table: tableDiff.tableId,
          index: indexDiff.after.name,
          columns: indexDiff.after.columns,
        });
      }
    }
  }

  return changes;
}
