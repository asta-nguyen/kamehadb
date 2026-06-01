import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function textResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

export const DEFAULT_MAX_BYTES = 50_000;
export const DEFAULT_MAX_ROWS = 5000;

export interface TruncationResult<T> {
  rows: T[];
  truncated: boolean;
  totalRows: number;
  keptRows: number;
}

export function truncateRows<T>(
  rows: T[],
  maxBytes: number = DEFAULT_MAX_BYTES,
  maxRows: number = DEFAULT_MAX_ROWS,
): TruncationResult<T> {
  const totalRows = rows.length;
  if (totalRows === 0) {
    return { rows: [], truncated: false, totalRows: 0, keptRows: 0 };
  }
  const rowCapped = rows.slice(0, maxRows);
  if (JSON.stringify(rowCapped).length <= maxBytes) {
    return {
      rows: rowCapped,
      truncated: totalRows > rowCapped.length,
      totalRows,
      keptRows: rowCapped.length,
    };
  }
  // Binary-search the largest prefix that fits within maxBytes.
  let lo = 0;
  let hi = rowCapped.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (JSON.stringify(rowCapped.slice(0, mid)).length <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return {
    rows: rowCapped.slice(0, lo),
    truncated: lo < totalRows,
    totalRows,
    keptRows: lo,
  };
}
