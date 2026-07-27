import { describe, expect, it } from 'vitest';
import { normalizeQuery, computeP95 } from './query-normalize';

describe('normalizeQuery', () => {
  it('replaces single-quoted strings (including escaped quotes)', () => {
    expect(normalizeQuery("SELECT * FROM t WHERE name = 'o''brien'")).toBe('SELECT * FROM t WHERE name = ?');
  });

  it('preserves double-quoted identifiers (object names, not literals)', () => {
    expect(normalizeQuery('SELECT "id" FROM "public"."users"')).toBe('SELECT "id" FROM "public"."users"');
    // Distinct quoted tables must NOT collapse into the same pattern key.
    expect(normalizeQuery('SELECT * FROM "users"')).not.toBe(normalizeQuery('SELECT * FROM "orders"'));
  });

  it('replaces decimal and integer numbers', () => {
    expect(normalizeQuery('WHERE price > 19.99 AND id = 42')).toBe('WHERE price > ? AND id = ?');
  });

  it('replaces hex literals', () => {
    expect(normalizeQuery('WHERE flags = 0x1F AND mask = 0xff')).toBe('WHERE flags = ? AND mask = ?');
  });

  it('replaces booleans and NULL (case-insensitive)', () => {
    expect(normalizeQuery('WHERE active = TRUE AND deleted = Null OR ok = false')).toBe(
      'WHERE active = ? AND deleted = ? OR ok = ?',
    );
  });

  it('collapses IN-lists into a single placeholder', () => {
    expect(normalizeQuery('WHERE id IN (1, 2, 3, 4)')).toBe('WHERE id IN (?)');
    expect(normalizeQuery('WHERE id IN (1)')).toBe('WHERE id IN (?)');
    expect(normalizeQuery('WHERE id IN (1, 2) AND x IN (3,4,5)')).toBe('WHERE id IN (?) AND x IN (?)');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeQuery('  SELECT   *\n  FROM\t t  ')).toBe('SELECT * FROM t');
  });

  it('is idempotent', () => {
    const sql = "SELECT * FROM users WHERE id IN (1,2,3) AND name = 'bob' AND active = true";
    const once = normalizeQuery(sql);
    expect(normalizeQuery(once)).toBe(once);
  });

  it('replaces dollar-quoted strings (untagged and tagged)', () => {
    expect(normalizeQuery('SELECT $$hello world$$')).toBe('SELECT ?');
    expect(normalizeQuery("SELECT $tag$it's a tag$tag$")).toBe('SELECT ?');
  });

  it('handles dollar-quoted strings containing single quotes', () => {
    expect(normalizeQuery("SELECT $$WHERE x = 'foo'$$ FROM t")).toBe('SELECT ? FROM t');
  });

  it('groups queries differing only in dollar-quoted content', () => {
    const a = 'SELECT $body$ SELECT 1 $body$ FROM t';
    const b = 'SELECT $body$ SELECT 2 $body$ FROM t';
    expect(normalizeQuery(a)).toBe(normalizeQuery(b));
  });

  it('groups semantically equivalent queries to the same pattern', () => {
    const a = "SELECT * FROM orders WHERE total > 100 AND status = 'shipped'";
    const b = "SELECT * FROM orders WHERE total > 250 AND status = 'pending'";
    expect(normalizeQuery(a)).toBe(normalizeQuery(b));
  });
});

describe('computeP95', () => {
  it('returns null for empty input', () => {
    expect(computeP95([])).toBeNull();
  });

  it('returns the single value for a one-element list', () => {
    expect(computeP95([42])).toBe(42);
  });

  it('computes nearest-rank p95 for 10 values', () => {
    // ceil(0.95 * 10) - 1 = 9 -> sorted[9] = 10
    expect(computeP95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
  });

  it('computes p95 for 20 values', () => {
    // ceil(0.95 * 20) - 1 = 18 -> sorted[18] = 19
    const vals = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(computeP95(vals)).toBe(19);
  });

  it('filters out non-finite values before ranking', () => {
    expect(computeP95([1, 2, 3, Number.NaN, 4, 5, 6, 7, 8, 9, 10, Number.POSITIVE_INFINITY])).toBe(10);
  });

  it('returns null when all values are non-finite', () => {
    expect(computeP95([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });
});
