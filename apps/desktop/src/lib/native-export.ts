import { KIND, quoteSqlIdentifier } from '@kamehadb/shared';

// PostgreSQL IDs carry schema + table; SQLite names can contain literal dots.
// Quote each verified identifier without turning table names into SQL syntax.
export function nativeTableExportQuery(tableId: string, kind: typeof KIND.POSTGRES | typeof KIND.SQLITE): string {
  const separator = kind === KIND.POSTGRES ? tableId.indexOf('.') : -1;
  const name =
    separator < 0
      ? quoteSqlIdentifier(tableId)
      : `${quoteSqlIdentifier(tableId.slice(0, separator))}.${quoteSqlIdentifier(tableId.slice(separator + 1))}`;
  return `SELECT * FROM ${name}`;
}
