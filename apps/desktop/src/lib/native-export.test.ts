import { describe, expect, it } from 'vitest';
import { KIND } from '@kamehadb/shared';
import { nativeTableExportQuery } from './native-export';

describe('full-table native export SQL', () => {
  it('quotes PostgreSQL schema/table including punctuation without a preview LIMIT', () => {
    expect(nativeTableExportQuery('public.strange.table"name', KIND.POSTGRES)).toBe(
      'SELECT * FROM "public"."strange.table""name"',
    );
  });
  it('keeps literal SQLite dots and injection-shaped names inside the identifier', () => {
    expect(nativeTableExportQuery('table.name"; DROP TABLE x;--', KIND.SQLITE)).toBe(
      'SELECT * FROM "table.name""; DROP TABLE x;--"',
    );
  });
});
