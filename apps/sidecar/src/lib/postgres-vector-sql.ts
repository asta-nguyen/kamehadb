type SafeFilterValue = string | number | boolean;

type CompiledFilter = {
  sql: string;
  params: SafeFilterValue[];
};

const CLAUSE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|<>|>=|<=|>|<|ILIKE|LIKE|IS NULL|IS NOT NULL)\s*(.*)$/i;
const NUMERIC_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function quoteSqlIdentifier(identifier: string): string {
  if (!identifier.trim()) {
    throw filterError('SQL identifier cannot be empty');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
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
    throw filterError('Filter must use simple comparisons joined with AND');
  }

  const column = match[1];
  const operator = match[2].toUpperCase();
  const rawValue = match[3].trim();
  const quotedColumn = `t.${quoteSqlIdentifier(column)}`;

  if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
    if (rawValue.length > 0) {
      throw filterError('IS NULL / IS NOT NULL filters do not take a value');
    }
    return { sql: `${quotedColumn} ${operator}`, params: [] };
  }

  const literal = parseFilterLiteral(rawValue);
  if (literal.kind === 'null') {
    if (operator === '=') return { sql: `${quotedColumn} IS NULL`, params: [] };
    if (operator === '!=' || operator === '<>') return { sql: `${quotedColumn} IS NOT NULL`, params: [] };
    throw filterError('NULL values can only be used with =, !=, or <>');
  }

  if ((operator === 'LIKE' || operator === 'ILIKE') && typeof literal.value !== 'string') {
    throw filterError('LIKE filters require a string value');
  }

  return {
    sql: `${quotedColumn} ${operator} $${paramIndex}`,
    params: [literal.value],
  };
}

function parseFilterLiteral(rawValue: string): { kind: 'value'; value: SafeFilterValue } | { kind: 'null' } {
  if (!rawValue) {
    throw filterError('Filter value is required');
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
      throw filterError('Unterminated string literal in filter');
    }
    const inner = rawValue.slice(1, -1).replace(/''/g, "'");
    return { kind: 'value', value: inner };
  }

  if (!NUMERIC_RE.test(rawValue)) {
    throw filterError('Filter value must be a quoted string, number, boolean, or NULL');
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

function filterError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}
