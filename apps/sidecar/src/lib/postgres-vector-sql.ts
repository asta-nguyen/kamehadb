import { CLAUSE_RE, NUMERIC_RE } from './constants.js';
import { quoteSqlIdentifier as sharedQuoteSqlIdentifier } from '@kamehadb/shared';
import { httpError } from './route-utils.js';

type SafeFilterValue = string | number | boolean;

type CompiledFilter = {
  sql: string;
  params: SafeFilterValue[];
};

export function quoteSqlIdentifier(identifier: string): string {
  if (!identifier.trim()) {
    throw httpError('SQL identifier cannot be empty', 400);
  }
  return sharedQuoteSqlIdentifier(identifier);
}

export function buildSafeFilterClause(filter: string, startIndex = 1): CompiledFilter | null {
  const trimmed = filter.trim();
  if (!trimmed) return null;

  const clauses = splitFilterClauses(trimmed);
  if (clauses.length === 0) return null;

  const sqlParts: string[] = [];
  const params: SafeFilterValue[] = [];
  let nextIndex = startIndex;

  for (const clause of clauses) {
    const compiled = compileFilterClause(clause, nextIndex);
    sqlParts.push(`(${compiled.sql})`);
    params.push(...compiled.params);
    nextIndex += compiled.params.length;
  }

  return { sql: sqlParts.join(' AND '), params };
}

function compileFilterClause(clause: string, paramIndex: number): CompiledFilter {
  const match = clause.match(CLAUSE_RE);
  if (!match) {
    throw httpError('Filter must use simple comparisons joined with AND', 400);
  }

  const column = match[1];
  const operator = match[2].toUpperCase();
  const rawValue = match[3].trim();
  const quotedColumn = `t.${quoteSqlIdentifier(column)}`;

  if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
    if (rawValue.length > 0) {
      throw httpError('IS NULL / IS NOT NULL filters do not take a value', 400);
    }
    return { sql: `${quotedColumn} ${operator}`, params: [] };
  }

  const literal = parseFilterLiteral(rawValue);
  if (literal.kind === 'null') {
    if (operator === '=') return { sql: `${quotedColumn} IS NULL`, params: [] };
    if (operator === '!=' || operator === '<>') return { sql: `${quotedColumn} IS NOT NULL`, params: [] };
    throw httpError('NULL values can only be used with =, !=, or <>', 400);
  }

  if ((operator === 'LIKE' || operator === 'ILIKE') && typeof literal.value !== 'string') {
    throw httpError('LIKE filters require a string value', 400);
  }

  return {
    sql: `${quotedColumn} ${operator} $${paramIndex}`,
    params: [literal.value],
  };
}

function parseFilterLiteral(rawValue: string): { kind: 'value'; value: SafeFilterValue } | { kind: 'null' } {
  if (!rawValue) {
    throw httpError('Filter value is required', 400);
  }

  if (rawValue.toLowerCase() === 'null') {
    return { kind: 'null' };
  }

  if (rawValue.toLowerCase() === 'true') {
    return { kind: 'value', value: true };
  }

  if (rawValue.toLowerCase() === 'false') {
    return { kind: 'value', value: false };
  }

  if (rawValue.startsWith("'")) {
    if (!rawValue.endsWith("'") || rawValue.length < 2) {
      throw httpError('Unterminated string literal in filter', 400);
    }
    const inner = rawValue.slice(1, -1).replace(/''/g, "'");
    return { kind: 'value', value: inner };
  }

  if (!NUMERIC_RE.test(rawValue)) {
    throw httpError('Filter value must be a quoted string, number, boolean, or NULL', 400);
  }

  return { kind: 'value', value: Number(rawValue) };
}

function splitFilterClauses(filter: string): string[] {
  const clauses: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < filter.length; i++) {
    const char = filter[i];

    if (char === "'") {
      current += char;
      if (inString && filter[i + 1] === "'") {
        current += "'";
        i += 1;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (!inString && isStandaloneAnd(filter, i)) {
      if (current.trim()) {
        clauses.push(current.trim());
      }
      current = '';
      i += 2;
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    clauses.push(current.trim());
  }

  return clauses;
}

function isStandaloneAnd(input: string, index: number): boolean {
  if (input.slice(index, index + 3).toUpperCase() !== 'AND') return false;

  const before = index === 0 ? ' ' : input[index - 1];
  const after = index + 3 >= input.length ? ' ' : input[index + 3];

  return /\s/.test(before) && /\s/.test(after);
}
