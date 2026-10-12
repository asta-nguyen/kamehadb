import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    configurable: true,
  });
});

import { containsMultipleStatements, normalizeSqlForSafety } from './sql-editor';
import { isQuerySafe } from '@kamehadb/shared';

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
