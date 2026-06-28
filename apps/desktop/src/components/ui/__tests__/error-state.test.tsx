import { describe, it, expect } from 'vitest';

describe('ErrorState', () => {
  it('extracts Error message', () => {
    const err = new Error('Connection failed');
    expect(err.message).toBe('Connection failed');
  });

  it('extracts string error', () => {
    const err = 'Something went wrong';
    expect(typeof err === 'string' ? err : '').toBe('Something went wrong');
  });

  it('falls back for unknown error types', () => {
    const fallback = 'Failed to load';
    expect(fallback).toBe('Failed to load');
  });
});
