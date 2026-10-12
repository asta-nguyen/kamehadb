import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    configurable: true,
  });
});

import { applyQueryLimit, containsMultipleStatements, normalizeSqlForSafety, stripLeadingComments } from './sql-editor';
import { isQuerySafe, KIND } from '@kamehadb/shared';

describe('SQL editor statement detection', () => {
  it('does not treat semicolons inside literals or comments as statement separators', () => {
    expect(containsMultipleStatements("SELECT ';' AS value")).toBe(false);
    expect(containsMultipleStatements('SELECT 1 -- ; still a comment')).toBe(false);
    expect(containsMultipleStatements('SELECT 1 /* ; still a comment */')).toBe(false);
  });

  it('detects an actual second statement', () => {
    expect(containsMultipleStatements('SELECT 1; SELECT 2')).toBe(true);
  });

  it('allows repeated trailing semicolons through the safety check', () => {
    expect(isQuerySafe(normalizeSqlForSafety('SELECT 1;;')).safe).toBe(true);
  });
});

describe('SQL editor dialect-aware query limiting', () => {
  it('strips leading single and multi-line comments', () => {
    expect(stripLeadingComments('-- hello\nSELECT 1')).toBe('SELECT 1');
    expect(stripLeadingComments('/* hello */ SELECT 1')).toBe('SELECT 1');
    expect(stripLeadingComments('/* c1 */ -- c2\n/* c3 */ SELECT 1')).toBe('SELECT 1');
  });

  it('applies standard LIMIT for Postgres / MySQL / SQLite', () => {
    expect(applyQueryLimit('SELECT * FROM users', 100)).toBe('SELECT * FROM users LIMIT 100');
    expect(applyQueryLimit('SELECT * FROM users', 100, 50)).toBe('SELECT * FROM users LIMIT 100 OFFSET 50');
    expect(applyQueryLimit('SELECT * FROM users LIMIT 10', 100)).toBe('SELECT * FROM users LIMIT 10');
  });

  it('recognizes SELECT preceded by comments and applies limit', () => {
    expect(applyQueryLimit('/* bypass comment */ SELECT * FROM users', 100)).toBe(
      '/* bypass comment */ SELECT * FROM users LIMIT 100',
    );
    expect(applyQueryLimit('-- bypass comment\nSELECT * FROM users', 100)).toBe(
      '-- bypass comment\nSELECT * FROM users LIMIT 100',
    );
  });

  it('applies T-SQL OFFSET...FETCH for SQL Server', () => {
    // Without ORDER BY: injects ORDER BY (SELECT NULL)
    expect(applyQueryLimit('SELECT * FROM users', 100, undefined, KIND.SQLSERVER)).toBe(
      'SELECT * FROM users\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
    );
    // With ORDER BY: appends OFFSET without duplicating ORDER BY
    expect(applyQueryLimit('SELECT * FROM users ORDER BY id ASC', 100, 50, KIND.SQLSERVER)).toBe(
      'SELECT * FROM users ORDER BY id ASC\nOFFSET 50 ROWS FETCH NEXT 100 ROWS ONLY',
    );
    // Already has TOP: does not inject
    expect(applyQueryLimit('SELECT TOP 10 * FROM users', 100, undefined, KIND.SQLSERVER)).toBe(
      'SELECT TOP 10 * FROM users',
    );
  });

  it('applies OFFSET...FETCH for Oracle', () => {
    expect(applyQueryLimit('SELECT * FROM users', 100, undefined, KIND.ORACLE)).toBe(
      'SELECT * FROM users\nOFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
    );
    // Already has ROWNUM: does not inject
    expect(applyQueryLimit('SELECT * FROM users WHERE ROWNUM <= 10', 100, undefined, KIND.ORACLE)).toBe(
      'SELECT * FROM users WHERE ROWNUM <= 10',
    );
  });

  it('does not apply limits to non-SELECT or multiple statements', () => {
    expect(applyQueryLimit('INSERT INTO users VALUES (1)', 100)).toBe('INSERT INTO users VALUES (1)');
    expect(applyQueryLimit('SELECT 1; SELECT 2', 100)).toBe('SELECT 1; SELECT 2');
    expect(applyQueryLimit('SELECT 1', 0)).toBe('SELECT 1');
  });
});
