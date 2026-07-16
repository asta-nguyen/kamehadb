// Query normalization + p95 helpers for the Slow-Query Insights feature.
//
// normalizeQuery is a HEURISTIC, not a SQL parser: it strips literal values
// (strings, numbers, booleans, NULL, hex) and collapses IN-lists so that
// semantically equivalent queries with different bind values share one
// pattern key. Two queries that differ only in casing or aliases will NOT
// merge — this is acceptable for a "find performance hotspots" grouping key.

/** p95 percentile (nearest-rank method). Named constant per AGENTS.md rule 6. */
export const P95_PERCENTILE = 0.95;

/**
 * Normalize a SQL string into a pattern key by replacing literal values with
 * `?` and collapsing IN-lists. Whitespace is collapsed to a single space.
 *
 * Order matters: strings first (so commas inside string literals don't confuse
 * the IN-list collapse), then numbers, then booleans/NULL, then the IN-list
 * collapse runs last over the placeholder sequence. Double-quoted identifiers
 * are intentionally NOT replaced — they are object names, not literals, so
 * collapsing them would merge queries against different quoted tables/columns.
 */
export function normalizeQuery(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, '?') // single-quoted strings ('it''s' -> ?)
    .replace(/0x[0-9a-fA-F]+/g, '?') // hex literals
    .replace(/\b\d+\.\d+\b/g, '?') // decimal numbers
    .replace(/\b\d+\b/g, '?') // integers
    .replace(/\b(?:true|false)\b/gi, '?') // booleans
    .replace(/\bnull\b/gi, '?') // NULL
    .replace(/IN\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)') // collapse IN (?, ?, ?) -> IN (?)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute the p95 duration via the nearest-rank method: sort ascending, pick
 * the value at index `ceil(0.95 * n) - 1`. Returns `null` when there are no
 * finite durations. Non-finite/undefined values are filtered out before
 * ranking so a single bad entry doesn't poison the percentile.
 */
export function computeP95(durations: number[]): number | null {
  const finite = durations.filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  // ceil(0.95 * n) - 1, clamped to the last index for safety.
  const idx = Math.min(Math.ceil(P95_PERCENTILE * n) - 1, n - 1);
  return sorted[idx];
}
