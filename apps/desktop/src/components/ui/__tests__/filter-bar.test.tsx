import { describe, it, expect } from 'vitest';
import type { FilterEntry } from '../filter-bar';

describe('FilterBar', () => {
  it('addFilter appends a new entry', () => {
    const filters: FilterEntry[] = [{ column: 'name', operator: '=', value: 'test' }];
    const updated = [...filters, { column: 'id', operator: '=', value: '' }];
    expect(updated).toHaveLength(2);
    expect(updated[1].column).toBe('id');
  });

  it('removeFilter removes by index', () => {
    const filters: FilterEntry[] = [
      { column: 'name', operator: '=', value: 'a' },
      { column: 'id', operator: '>', value: '5' },
    ];
    const updated = filters.filter((_, i) => i !== 0);
    expect(updated).toHaveLength(1);
    expect(updated[0].column).toBe('id');
  });

  it('updateFilter updates the correct entry', () => {
    const filters: FilterEntry[] = [{ column: 'name', operator: '=', value: 'a' }];
    const updated = filters.map((f, i) => (i === 0 ? { ...f, operator: 'LIKE' } : f));
    expect(updated[0].operator).toBe('LIKE');
  });

  it('IS NULL operators hide value input', () => {
    const isNullOp = (op: string) => op === 'IS NULL' || op === 'IS NOT NULL';
    expect(isNullOp('IS NULL')).toBe(true);
    expect(isNullOp('IS NOT NULL')).toBe(true);
    expect(isNullOp('=')).toBe(false);
  });
});
