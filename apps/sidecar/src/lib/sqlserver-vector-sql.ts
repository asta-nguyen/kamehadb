import { type CompiledFilter, type SafeFilterValue, parseFilterClause, splitFilterClauses } from './filter-parser.js';

export { type CompiledFilter, type SafeFilterValue };

export function buildSafeFilterClauseSqlServer(filter: string, startIndex = 0): CompiledFilter | null {
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
      sql = `t.${quotedColumn} ${operator} @p${nextIndex}`;
      params.push(literal.value);
      nextIndex += 1;
    }

    sqlParts.push(`(${sql})`);
  }

  return { sql: sqlParts.join(' AND '), params };
}
