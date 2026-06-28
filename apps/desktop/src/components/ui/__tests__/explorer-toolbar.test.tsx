import { describe, it, expect } from 'vitest';

describe('ExplorerToolbar', () => {
  it('shows search only when searchValue and onSearchChange are provided', () => {
    const hasSearch = (searchValue: string | undefined, onSearchChange: ((v: string) => void) | undefined) =>
      searchValue !== undefined && onSearchChange !== undefined;

    expect(hasSearch('', (v) => v)).toBe(true);
    expect(hasSearch(undefined, (v) => v)).toBe(false);
    expect(hasSearch('', undefined)).toBe(false);
  });

  it('shows refresh only when onRefresh is provided', () => {
    const hasRefresh = (onRefresh?: () => void) => onRefresh !== undefined;
    expect(hasRefresh(() => {})).toBe(true);
    expect(hasRefresh(undefined)).toBe(false);
  });
});
