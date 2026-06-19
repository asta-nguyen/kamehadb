import type { QueryColumn, QueryResult } from '@kamehadb/shared';

/**
 * Build QueryColumn metadata from the first row's keys.
 * Used by all adapters except PostgreSQL (which uses driver-level field info).
 */
export function columnsFromRows(rows: Record<string, unknown>[]): QueryColumn[] {
  return rows.length > 0 ? Object.keys(rows[0]).map((key) => ({ name: key, type: typeof rows[0][key] })) : [];
}

/**
 * Shape a database query result.
 *
 * Automatically derives column metadata from the row data unless `columns`
 * is provided explicitly (used by PostgreSQL for richer type info from
 * driver fields).
 */
export function queryResult(
  rows: Record<string, unknown>[],
  durationMs: number,
  truncated: boolean,
  columns?: QueryColumn[],
): QueryResult {
  return {
    columns: columns ?? columnsFromRows(rows),
    rows,
    rowCount: rows.length,
    durationMs: Math.round(durationMs),
    truncated,
  };
}
