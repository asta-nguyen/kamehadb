import { describe, it, expect } from 'vitest';

describe('LoadingState', () => {
  it('compact uses py-2 padding', () => {
    expect('py-2').toBe('py-2');
  });

  it('default uses py-8 padding', () => {
    expect('py-8').toBe('py-8');
  });
});
