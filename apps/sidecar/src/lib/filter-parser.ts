import { CLAUSE_RE, NUMERIC_RE } from './constants.js';
import { httpError, quoteSqlIdentifier } from './route-utils.js';

export type SafeFilterValue = string | number | boolean;

export type CompiledFilter = {
  sql: string;
  params: SafeFilterValue[];
};

export type FilterLiteral = { kind: 'value'; value: SafeFilterValue } | { kind: 'null' };

/**
 * Shared filter-clause parsing, splitting, and literal validation.
 * Engine-specific files use these to build safe WHERE clauses without
 * duplicating the parsing logic.
 */

export function splitFilterClauses(filter: string): string[] {
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
      } else {
        throw httpError('Filter has an empty clause around AND', 400);
      }
      current = '';
      i += 2;
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    clauses.push(current.trim());
  } else if (clauses.length > 0) {
    throw httpError('Filter has an empty clause after AND', 400);
  }

  return clauses;
}

export function parseFilterLiteral(rawValue: string): FilterLiteral {
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

/**
 * Parse a single filter clause into column, operator, and raw value.
 * Throws httpError(400) if the clause doesn't match the expected pattern.
 */
export function parseFilterClause(clause: string): {
  column: string;
  operator: string;
  rawValue: string;
  quotedColumn: string;
  literal: FilterLiteral;
} {
  const match = clause.match(CLAUSE_RE);
  if (!match) {
    throw httpError('Filter must use simple comparisons joined with AND', 400);
  }

  const column = match[1];
  const operator = match[2].toUpperCase();
  const rawValue = match[3].trim();
  const quotedColumn = quoteSqlIdentifier(column);

  if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
    if (rawValue.length > 0) {
      throw httpError('IS NULL / IS NOT NULL filters do not take a value', 400);
    }
    return { column, operator, rawValue, quotedColumn, literal: { kind: 'null' } };
  }

  const literal = parseFilterLiteral(rawValue);

  if (literal.kind === 'null') {
    if (operator !== '=' && operator !== '!=' && operator !== '<>') {
      throw httpError('NULL values can only be used with =, !=, or <>', 400);
    }
  }

  if ((operator === 'LIKE' || operator === 'ILIKE') && literal.kind === 'value' && typeof literal.value !== 'string') {
    throw httpError('LIKE filters require a string value', 400);
  }

  return { column, operator, rawValue, quotedColumn, literal };
}

function isStandaloneAnd(input: string, index: number): boolean {
  if (input.slice(index, index + 3).toUpperCase() !== 'AND') return false;

  const before = index === 0 ? ' ' : input[index - 1];
  const after = index + 3 >= input.length ? ' ' : input[index + 3];

  return /\s/.test(before) && /\s/.test(after);
}
