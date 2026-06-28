import { type CompiledFilter, type SafeFilterValue, splitFilterClauses, parseFilterClause } from './filter-parser.js';

export { type CompiledFilter, type SafeFilterValue };

export function buildSafeFilterClauseSqlite(filter: string): CompiledFilter | null {
  const trimmed = filter.trim();
  if (!trimmed) return null;

  const clauses = splitFilterClauses(trimmed);
  if (clauses.length === 0) return null;

  const sqlParts: string[] = [];
  const params: SafeFilterValue[] = [];

  for (const clause of clauses) {
    const { operator, quotedColumn, literal } = parseFilterClause(clause);

    let sql: string;
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      sql = `${quotedColumn} ${operator}`;
    } else if (literal.kind === 'null') {
      sql = operator === '=' ? `${quotedColumn} IS NULL` : `${quotedColumn} IS NOT NULL`;
    } else {
      const sqlOp = operator === 'ILIKE' ? 'LIKE' : operator;
      const collation = operator === 'ILIKE' ? ' COLLATE NOCASE' : '';
      sql = `${quotedColumn} ${sqlOp} ?${collation}`;
      params.push(literal.value);
    }

    sqlParts.push(`(${sql})`);
  }

  return { sql: sqlParts.join(' AND '), params };
}
