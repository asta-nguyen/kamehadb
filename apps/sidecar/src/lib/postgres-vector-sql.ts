import { type CompiledFilter, type SafeFilterValue, splitFilterClauses, parseFilterClause } from './filter-parser.js';

export { type CompiledFilter, type SafeFilterValue };

export function buildSafeFilterClause(filter: string, startIndex = 1): CompiledFilter | null {
  const trimmed = filter.trim();
  if (!trimmed) return null;

  const clauses = splitFilterClauses(trimmed);
  if (clauses.length === 0) return null;

  const sqlParts: string[] = [];
  const params: SafeFilterValue[] = [];
  let nextIndex = startIndex;

  for (const clause of clauses) {
    const { operator, quotedColumn, literal } = parseFilterClause(clause);

    let sql: string;
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      sql = `t.${quotedColumn} ${operator}`;
    } else if (literal.kind === 'null') {
      sql = operator === '=' ? `t.${quotedColumn} IS NULL` : `t.${quotedColumn} IS NOT NULL`;
    } else {
      sql = `t.${quotedColumn} ${operator} $${nextIndex}`;
      params.push(literal.value);
      nextIndex++;
    }

    sqlParts.push(`(${sql})`);
  }

  return { sql: sqlParts.join(' AND '), params };
}
