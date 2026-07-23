import type { ColumnInfo, QueryColumn } from '@kamehadb/shared';
import { quoteSqlIdentifier } from '@kamehadb/shared';

export type TableEditabilityState = {
  readonly canEditCells: boolean;
  readonly warningMessage: string | null;
  readonly warningTone: 'info' | 'warning' | null;
};

export type QueryResultEditabilityState = TableEditabilityState & {
  readonly tableId: string | null;
};

export function getTableEditabilityState(input: {
  readonly hasPrimaryKey: boolean;
  readonly isReadOnly: boolean;
}): TableEditabilityState {
  if (input.isReadOnly) {
    return {
      canEditCells: false,
      warningMessage: 'Connection is read-only — disable read-only in connection settings to edit cells.',
      warningTone: 'warning',
    };
  }

  if (!input.hasPrimaryKey) {
    return {
      canEditCells: true,
      warningMessage:
        'No primary key detected — updates match rows by all columns, so duplicate rows can still be ambiguous.',
      warningTone: 'info',
    };
  }

  return {
    canEditCells: true,
    warningMessage: null,
    warningTone: null,
  };
}

const IDENTIFIER_PATTERN = /(?:"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)/;

export function inferSimpleSelectTableId(querySql: string): string | null {
  const sql = querySql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim()
    .replace(/;+\s*$/, '');

  if (!/^select\b/i.test(sql)) return null;
  if (/\b(join|union|intersect|except|group\s+by|having|distinct|returning|into)\b/i.test(sql)) return null;
  if (/\bfrom\s*\(/i.test(sql)) return null;

  const identifier = IDENTIFIER_PATTERN.source;
  const qualifiedIdentifier = `(${identifier}(?:\\s*\\.\\s*${identifier})?)`;
  const fromPattern = new RegExp(
    `\\bfrom\\s+${qualifiedIdentifier}(?:\\s+(?:as\\s+)?${identifier})?(?=\\s*(?:where|order\\s+by|limit|offset|fetch|for|$))`,
    'i',
  );
  const match = fromPattern.exec(sql);
  if (!match?.[1]) return null;

  const normalizedParts = match[1]
    .split('.')
    .map((part) => normalizeIdentifierPart(part.trim()))
    .filter((part) => part.length > 0);
  return normalizedParts.length > 0 ? normalizedParts.join('.') : null;
}

export function getQueryResultEditabilityState(input: {
  readonly querySql: string;
  readonly resultColumns: readonly QueryColumn[];
  readonly tableColumns: readonly ColumnInfo[] | null | undefined;
  readonly isReadOnly: boolean;
}): QueryResultEditabilityState {
  if (input.isReadOnly) {
    return {
      ...getTableEditabilityState({ hasPrimaryKey: false, isReadOnly: true }),
      tableId: null,
    };
  }

  const tableId = inferSimpleSelectTableId(input.querySql);
  if (!tableId) {
    return {
      canEditCells: false,
      warningMessage: 'Only direct single-table SELECT results are editable here.',
      warningTone: 'info',
      tableId: null,
    };
  }

  if (!input.tableColumns || input.tableColumns.length === 0) {
    return {
      canEditCells: false,
      warningMessage: 'Loading table metadata for inline edits.',
      warningTone: 'info',
      tableId,
    };
  }

  const tableColumnNames = new Set(input.tableColumns.map((column) => column.name));
  const resultColumnNames = input.resultColumns.map((column) => column.name);
  const hasDuplicateColumns = new Set(resultColumnNames).size !== resultColumnNames.length;
  const hasComputedColumns = resultColumnNames.some((columnName) => !tableColumnNames.has(columnName));
  if (hasDuplicateColumns || hasComputedColumns) {
    return {
      canEditCells: false,
      warningMessage:
        'Only direct table columns are editable here. Aliases, joins, and computed fields stay read-only.',
      warningTone: 'info',
      tableId,
    };
  }

  return {
    ...getTableEditabilityState({
      hasPrimaryKey: input.tableColumns.some((column) => column.primaryKey),
      isReadOnly: false,
    }),
    tableId,
  };
}

export function buildRowUpdateQuery(input: {
  readonly tableId: string;
  readonly row: Record<string, unknown>;
  readonly column: string;
  readonly newValue: string;
  readonly columnType?: string;
  readonly pkColumns: readonly string[];
  readonly allColumnNames: readonly string[];
  readonly dateColumns: ReadonlySet<string>;
}): string {
  const oldValue = input.row[input.column];
  const whereColumns = input.pkColumns.length > 0 ? input.pkColumns : input.allColumnNames;
  const whereClause = whereColumns
    .map((columnName) => {
      const value = columnName === input.column ? oldValue : input.row[columnName];
      const escapedValue = value === null || value === undefined ? 'NULL' : escapeSqlValue(value);
      return `${quoteSqlIdentifier(columnName)} IS NOT DISTINCT FROM ${escapedValue}`;
    })
    .join(' AND ');

  let setClause: string;
  if (input.newValue === '') {
    setClause = `${quoteSqlIdentifier(input.column)} = NULL`;
  } else if (input.columnType) {
    const lowerType = input.columnType.toLowerCase();
    if (lowerType === 'jsonb') {
      // jsonb is Postgres-exclusive and requires an explicit cast from text.
      setClause = `${quoteSqlIdentifier(input.column)} = '${input.newValue.replace(/'/g, "''")}'::jsonb`;
    } else if (input.dateColumns.has(input.column)) {
      const castTo = lowerType.includes('timestamp') || lowerType === 'timestamptz' ? 'timestamp' : 'date';
      setClause = `${quoteSqlIdentifier(input.column)} = '${input.newValue.replace(/'/g, "''")}'::${castTo}`;
    } else {
      // json (non-jsonb) and other types: plain string literal. Postgres has
      // an assignment cast from text to json; MySQL/SQLite/DuckDB/ClickHouse
      // all accept string literals for JSON columns without an explicit cast.
      setClause = `${quoteSqlIdentifier(input.column)} = ${escapeSqlValue(input.newValue)}`;
    }
  } else {
    setClause = `${quoteSqlIdentifier(input.column)} = ${escapeSqlValue(input.newValue)}`;
  }

  return `UPDATE ${quoteQualifiedTable(input.tableId)} SET ${setClause} WHERE ${whereClause}`;
}

function normalizeIdentifierPart(part: string): string {
  if (
    (part.startsWith('"') && part.endsWith('"')) ||
    (part.startsWith('`') && part.endsWith('`')) ||
    (part.startsWith('[') && part.endsWith(']'))
  ) {
    return part.slice(1, -1).replace(/""/g, '"');
  }
  return part;
}

function quoteQualifiedTable(tableId: string): string {
  return tableId
    .split('.')
    .map((part) => quoteSqlIdentifier(part))
    .join('.');
}

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}
