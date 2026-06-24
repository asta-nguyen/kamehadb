import {
  DEFAULT_DIALECT,
  DIALECT,
  type MigrationResult,
  type SchemaColumnDiff,
  type SchemaColumnSnapshot,
  type SchemaDiffResult,
  type SchemaIndexSnapshot,
} from '@kamehadb/shared';

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteTableId(tableId: string): string {
  return tableId
    .split('.')
    .filter((part) => part.length > 0)
    .map((part) => quoteIdent(part))
    .join('.');
}

function formatColumns(columns: readonly string[]): string {
  return columns.map((column) => quoteIdent(column)).join(', ');
}

function formatColumnDefinition(column: SchemaColumnSnapshot, includePrimaryKey: boolean): string {
  const parts = [quoteIdent(column.name), column.type];
  if (includePrimaryKey && column.primaryKey) parts.push('PRIMARY KEY');
  if (!column.nullable) parts.push('NOT NULL');
  if (column.default !== null) parts.push(`DEFAULT ${column.default}`);
  return parts.join(' ');
}

function buildCreateIndex(tableId: string, index: SchemaIndexSnapshot): string {
  const unique = index.unique ? 'UNIQUE ' : '';
  return `CREATE ${unique}INDEX ${quoteIdent(index.name)} ON ${quoteTableId(tableId)} (${formatColumns(index.columns)});`;
}

function buildDropIndex(tableId: string, _index: SchemaIndexSnapshot, dialect: string): string {
  // MySQL / MariaDB require "ON tableName" for DROP INDEX
  if (dialect === DIALECT.MYSQL) {
    return `DROP INDEX ${quoteIdent(_index.name)} ON ${quoteTableId(tableId)};`;
  }
  return `DROP INDEX IF EXISTS ${quoteIdent(_index.name)};`;
}

function pushColumnChangeStatements(statements: string[], tableId: string, columnDiff: SchemaColumnDiff): void {
  if (columnDiff.type === 'added') {
    statements.push(
      `ALTER TABLE ${quoteTableId(tableId)} ADD COLUMN ${formatColumnDefinition(columnDiff.column, false)};`,
    );
    if (columnDiff.column.primaryKey)
      statements.push(
        `-- Review primary key change for ${quoteTableId(tableId)}.${quoteIdent(columnDiff.column.name)} manually.`,
      );
    return;
  }
  if (columnDiff.type === 'removed') {
    statements.push(`ALTER TABLE ${quoteTableId(tableId)} DROP COLUMN ${quoteIdent(columnDiff.column.name)};`);
    return;
  }

  for (const change of columnDiff.changes) {
    if (change.field === 'type') {
      statements.push(
        `ALTER TABLE ${quoteTableId(tableId)} ALTER COLUMN ${quoteIdent(columnDiff.columnName)} TYPE ${columnDiff.after.type};`,
      );
    }
    if (change.field === 'nullable') {
      statements.push(
        `ALTER TABLE ${quoteTableId(tableId)} ALTER COLUMN ${quoteIdent(columnDiff.columnName)} ${columnDiff.after.nullable ? 'DROP' : 'SET'} NOT NULL;`,
      );
    }
    if (change.field === 'default') {
      statements.push(
        columnDiff.after.default === null
          ? `ALTER TABLE ${quoteTableId(tableId)} ALTER COLUMN ${quoteIdent(columnDiff.columnName)} DROP DEFAULT;`
          : `ALTER TABLE ${quoteTableId(tableId)} ALTER COLUMN ${quoteIdent(columnDiff.columnName)} SET DEFAULT ${columnDiff.after.default};`,
      );
    }
    if (change.field === 'primaryKey') {
      statements.push(
        `-- Review primary key change for ${quoteTableId(tableId)}.${quoteIdent(columnDiff.columnName)} manually.`,
      );
    }
  }
}

export function generateMigrationFromDiff(diff: SchemaDiffResult, dialect: string = DEFAULT_DIALECT): MigrationResult {
  const statements = [`-- Migration: ${diff.fromSnapshot.capturedAt} → ${diff.toSnapshot.capturedAt}`, ''];

  for (const tableDiff of diff.tableDiffs) {
    if (tableDiff.type === 'added') {
      const pkColumns = tableDiff.table.columns.filter((c) => c.primaryKey);
      const hasCompositePk = pkColumns.length > 1;
      const createColumns = tableDiff.table.columns
        .map((column) => `  ${formatColumnDefinition(column, !hasCompositePk)}`)
        .join(',\n');
      const pkClause = hasCompositePk
        ? `,\n  PRIMARY KEY (${pkColumns.map((c) => quoteIdent(c.name)).join(', ')})`
        : '';
      statements.push(`CREATE TABLE ${quoteTableId(tableDiff.tableId)} (\n${createColumns}${pkClause}\n);`);
      for (const index of tableDiff.table.indexes.filter((value) => !value.primary))
        statements.push(buildCreateIndex(tableDiff.tableId, index));
      statements.push('');
    }
    if (tableDiff.type === 'removed') {
      statements.push(`DROP TABLE IF EXISTS ${quoteTableId(tableDiff.tableId)};`);
      statements.push('');
    }
    if (tableDiff.type !== 'changed') continue;

    for (const columnDiff of tableDiff.columnDiffs)
      pushColumnChangeStatements(statements, tableDiff.tableId, columnDiff);
    for (const indexDiff of tableDiff.indexDiffs) {
      // Skip primary-key indexes — they should be handled as PK constraint
      // changes (or left for manual review) rather than emitted as DDL that
      // could drop PK semantics.
      const isPrimaryIndex =
        (indexDiff.type === 'added' && indexDiff.index.primary) ||
        (indexDiff.type === 'removed' && indexDiff.index.primary) ||
        (indexDiff.type === 'changed' && (indexDiff.before.primary || indexDiff.after.primary));
      if (isPrimaryIndex) {
        const pkName = indexDiff.type === 'changed' ? indexDiff.indexName : indexDiff.index.name;
        statements.push(`-- Review primary key index "${pkName}" manually.`);
        continue;
      }

      if (indexDiff.type === 'added') statements.push(buildCreateIndex(tableDiff.tableId, indexDiff.index));
      if (indexDiff.type === 'removed') statements.push(buildDropIndex(tableDiff.tableId, indexDiff.index, dialect));
      if (indexDiff.type === 'changed') {
        statements.push(buildDropIndex(tableDiff.tableId, indexDiff.before, dialect));
        statements.push(buildCreateIndex(tableDiff.tableId, indexDiff.after));
      }
    }
    if (tableDiff.columnDiffs.length > 0 || tableDiff.indexDiffs.length > 0) statements.push('');
  }

  return {
    statements,
    dialect,
    fromSnapshot: diff.fromSnapshot.capturedAt,
    toSnapshot: diff.toSnapshot.capturedAt,
  };
}
