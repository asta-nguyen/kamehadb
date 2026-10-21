import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    configurable: true,
  });
});

import {
  applyQueryLimit,
  containsMultipleStatements,
  hasTopLevelOrderBy,
  normalizeSqlForSafety,
  splitSqlStatements,
  stripLeadingComments,
} from './sql-editor';
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

  it('ignores ORDER BY in window expressions, comments and literals for T-SQL', () => {
    // A window function's ORDER BY does not satisfy OFFSET...FETCH's outer clause.
    expect(
      applyQueryLimit('SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) AS rn FROM users', 100, 0, KIND.SQLSERVER),
    ).toBe(
      'SELECT ROW_NUMBER() OVER (PARTITION BY a ORDER BY b) AS rn FROM users\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
    );
    // Comment / literal occurrences must not be mistaken for a real clause.
    expect(applyQueryLimit('SELECT * FROM users -- order by id', 100, 0, KIND.SQLSERVER)).toBe(
      'SELECT * FROM users -- order by id\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
    );
    expect(applyQueryLimit('SELECT * FROM users /* ORDER BY id */', 100, 0, KIND.SQLSERVER)).toBe(
      'SELECT * FROM users /* ORDER BY id */\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
    );
    expect(applyQueryLimit("SELECT 'ORDER BY' AS x FROM users", 100, 0, KIND.SQLSERVER)).toBe(
      "SELECT 'ORDER BY' AS x FROM users\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY",
    );
  });

  it('finds only a top-level ORDER BY for T-SQL pagination', () => {
    expect(hasTopLevelOrderBy('SELECT * FROM users ORDER BY id')).toBe(true);
    expect(hasTopLevelOrderBy('SELECT * FROM users\nORDER\nBY id')).toBe(true);
    expect(hasTopLevelOrderBy('SELECT ROW_NUMBER() OVER (ORDER BY id) FROM users')).toBe(false);
    expect(hasTopLevelOrderBy('SELECT * FROM users -- ORDER BY id')).toBe(false);
    expect(hasTopLevelOrderBy('SELECT [ORDER BY] FROM users')).toBe(false);
    expect(hasTopLevelOrderBy("SELECT 'it''s ORDER BY' FROM users")).toBe(false);
  });

  it('does not expose an escaped bracket inside a quoted identifier for T-SQL', () => {
    // ]] inside [..] is an escaped ], not the terminator, so this whole token
    // is one identifier and the query has no outer ORDER BY.
    expect(hasTopLevelOrderBy('SELECT [name]] ORDER BY text] FROM t')).toBe(false);
    expect(hasTopLevelOrderBy('SELECT [a]]] FROM t ORDER BY id')).toBe(true);
    expect(applyQueryLimit('SELECT [name]] ORDER BY text] FROM t', 100, 0, KIND.SQLSERVER)).toBe(
      'SELECT [name]] ORDER BY text] FROM t\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
    );
  });

  it('handles nested T-SQL block comments', () => {
    // T-SQL block comments nest, so ORDER BY text after an inner close is
    // still inside the comment and must not count as a real clause.
    expect(hasTopLevelOrderBy('SELECT * FROM users /* outer /* inner ORDER BY id */ still comment */ WHERE 1=1')).toBe(
      false,
    );
    expect(hasTopLevelOrderBy('SELECT * FROM users /* a /* b */ c */ ORDER BY id')).toBe(true);
    expect(applyQueryLimit('SELECT * FROM users /* a /* b */ c */', 100, 0, KIND.SQLSERVER)).toBe(
      'SELECT * FROM users /* a /* b */ c */\nORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY',
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

describe('SQL editor query history statement preservation', () => {
  it('preserves the user-typed statement without synthesized limit clauses', () => {
    const rawSql = 'SELECT * FROM large';
    const stmts = splitSqlStatements(rawSql);
    expect(stmts).toEqual(['SELECT * FROM large']);
    // Applying the dialect limit rewrites the statement for execution
    const executedStmt = applyQueryLimit(stmts[0], 100);
    expect(executedStmt).toBe('SELECT * FROM large LIMIT 100');
    // But the statement that gets recorded to query history must remain the user-typed form
    expect(stmts[0]).toBe('SELECT * FROM large');
    expect(stmts[0]).not.toContain('LIMIT');
  });

  it('separates executed SQL with limit/offset from history SQL across pagination cycles', () => {
    // Simulates the executeQuery logic in sql-editor.tsx:
    // User types: "SELECT * FROM large"
    const userSql = 'SELECT * FROM large';
    const limit = 100;
    const historyEntries: string[] = [];
    const executedQueries: string[] = [];

    function simulateExecuteQuery(querySql: string, isPagination = false, pageOffset = 0) {
      const statements = splitSqlStatements(querySql);
      for (const stmt of statements) {
        const executedStmt = applyQueryLimit(stmt, limit, pageOffset > 0 ? pageOffset : undefined);
        executedQueries.push(executedStmt);
        if (!isPagination) {
          historyEntries.push(stmt);
        }
      }
    }

    // 1. Initial user run (isPagination = false, pageOffset = 0)
    simulateExecuteQuery(userSql, false, 0);
    expect(executedQueries[0]).toBe('SELECT * FROM large LIMIT 100');
    expect(historyEntries[0]).toBe('SELECT * FROM large');
    expect(historyEntries).toHaveLength(1);

    // 2. Next page click (isPagination = true, pageOffset = 100)
    simulateExecuteQuery(userSql, true, 100);
    expect(executedQueries[1]).toBe('SELECT * FROM large LIMIT 100 OFFSET 100');
    // History must NOT record pagination queries
    expect(historyEntries).toHaveLength(1);

    // 3. Next page click again (isPagination = true, pageOffset = 200)
    simulateExecuteQuery(userSql, true, 200);
    expect(executedQueries[2]).toBe('SELECT * FROM large LIMIT 100 OFFSET 200');
    expect(historyEntries).toHaveLength(1);

    // 4. Prev page click (isPagination = true, pageOffset = 100)
    simulateExecuteQuery(userSql, true, 100);
    expect(executedQueries[3]).toBe('SELECT * FROM large LIMIT 100 OFFSET 100');
    expect(historyEntries).toHaveLength(1);
  });

  it('preserves multi-statement individual user queries in history while limiting each for execution', () => {
    const multiSql = 'SELECT * FROM users;\nSELECT * FROM orders';
    const limit = 50;
    const historyEntries: string[] = [];
    const executedQueries: string[] = [];

    const statements = splitSqlStatements(multiSql);
    expect(statements).toEqual(['SELECT * FROM users', 'SELECT * FROM orders']);

    for (const stmt of statements) {
      executedQueries.push(applyQueryLimit(stmt, limit));
      historyEntries.push(stmt);
    }

    expect(executedQueries).toEqual(['SELECT * FROM users LIMIT 50', 'SELECT * FROM orders LIMIT 50']);
    expect(historyEntries).toEqual(['SELECT * FROM users', 'SELECT * FROM orders']);
  });
});
