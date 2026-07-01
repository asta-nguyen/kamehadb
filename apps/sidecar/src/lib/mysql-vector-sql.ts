import { type CompiledFilter, type SafeFilterValue, splitFilterClauses, parseFilterClause } from './filter-parser.js';

export { type CompiledFilter, type SafeFilterValue };

/** Quote a MySQL identifier using backticks (MySQL's default quoting style). */
export function quoteMysqlIdentifier(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`';
}

export function buildSafeFilterClauseMysql(filter: string): CompiledFilter | null {
  const trimmed = filter.trim();
  if (!trimmed) return null;

  const clauses = splitFilterClauses(trimmed);
  if (clauses.length === 0) return null;

  const sqlParts: string[] = [];
  const params: SafeFilterValue[] = [];

  for (const clause of clauses) {
    const { operator, column, literal } = parseFilterClause(clause);
    // Re-quote with backticks for MySQL (parseFilterClause uses double quotes)
    const quotedColumn = quoteMysqlIdentifier(column);

    let sql: string;
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      sql = `${quotedColumn} ${operator}`;
    } else if (literal.kind === 'null') {
      sql = operator === '=' ? `${quotedColumn} IS NULL` : `${quotedColumn} IS NOT NULL`;
    } else {
      // MySQL has no ILIKE; LOWER() both operands so case-insensitivity holds
      // regardless of the column's collation (which may be _cs or _bin).
      if (operator === 'ILIKE') {
        sql = `LOWER(${quotedColumn}) LIKE LOWER(?)`;
      } else {
        sql = `${quotedColumn} ${operator} ?`;
      }
      params.push(literal.value);
    }

    sqlParts.push(`(${sql})`);
  }

  return { sql: sqlParts.join(' AND '), params };
}
