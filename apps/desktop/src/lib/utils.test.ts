import { describe, expect, it } from 'vitest';
import { formatBytes, formatNumber } from './utils';

describe('formatters', () => {
  it('returns safe fallbacks for non-finite values', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('0');
  });
});
