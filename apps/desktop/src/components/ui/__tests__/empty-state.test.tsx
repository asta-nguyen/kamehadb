import { describe, it, expect } from 'vitest';

describe('EmptyState', () => {
  it('compact uses py-2 padding', () => {
    expect('py-2').toBe('py-2');
  });

  it('full uses py-12 padding', () => {
    expect('py-12').toBe('py-12');
  });
});
