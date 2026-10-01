import { describe, expect, it } from 'vitest';
import { getIndicatorColor } from './sidebar.helpers';

describe('getIndicatorColor', () => {
  it('falls back to the status color while the connection profile is loading', () => {
    expect(getIndicatorColor(undefined, 'connected')).toBe('var(--success)');
  });
});
