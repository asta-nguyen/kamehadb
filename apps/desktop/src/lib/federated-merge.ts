import type { QueryColumn, QueryResult } from '@kamehadb/shared';

// One connection's outcome from the parallel federated dispatch.
// `result` is null when the query failed for that connection; `error` carries the message.
export type PerConnectionResult = {
  readonly connectionId: number;
  readonly connectionName: string;
  readonly result: QueryResult | null;
  readonly error: string | null;
};

// The output of mergeQueryResults — a single merged QueryResult (or null if
// every connection failed) plus the per-connection breakdown for error display.
export type MergedFederatedResult = {
  readonly result: QueryResult | null;
  readonly perConnection: readonly PerConnectionResult[];
};

// Merge multiple per-connection QueryResults into a single UNION ALL result set.
// Columns are unioned by name (first appearance order); missing columns in a
// connection's rows are filled with null. Failed connections (result: null)
// are omitted from the merged rows but retained in perConnection for error
// display. rowCount is summed, durationMs is the max, truncated is true if any
// connection was truncated. Returns result: null when all connections failed.
export function mergeQueryResults(perConnection: readonly PerConnectionResult[]): MergedFederatedResult {
  const successful = perConnection.filter((r) => r.result !== null);

  if (successful.length === 0) {
    return { result: null, perConnection };
  }

  // Union of columns, ordered by first appearance across all successful results.
  const columnNames: string[] = [];
  const columnMap = new Map<string, QueryColumn>();
  for (const entry of successful) {
    for (const col of entry.result!.columns) {
      if (!columnMap.has(col.name)) {
        columnMap.set(col.name, col);
        columnNames.push(col.name);
      }
    }
  }
  const columns = columnNames.map((name) => columnMap.get(name)!);

  // Concatenate rows from each successful connection, filling missing columns
  // with null so every row has the full union column set.
  const rows: Record<string, unknown>[] = [];
  let rowCount = 0;
  let durationMs = 0;
  let truncated = false;

  for (const entry of successful) {
    const res = entry.result!;
    for (const row of res.rows) {
      const mergedRow: Record<string, unknown> = Object.create(null);
      for (const name of columnNames) {
        mergedRow[name] = Object.prototype.hasOwnProperty.call(row, name) ? row[name] : null;
      }
      rows.push(mergedRow);
    }
    rowCount += res.rowCount;
    durationMs = Math.max(durationMs, res.durationMs);
    truncated = truncated || res.truncated;
  }

  return {
    result: { columns, rows, rowCount, durationMs, truncated },
    perConnection,
  };
}
