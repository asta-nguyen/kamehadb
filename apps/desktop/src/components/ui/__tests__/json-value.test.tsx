import { describe, it, expect } from 'vitest';
import { JsonValue } from '../json-value';

describe('JsonValue', () => {
  it('is a function', () => {
    expect(typeof JsonValue).toBe('function');
  });

  it('handles null and undefined', () => {
    // These just verify the component doesn't throw — no DOM rendering
    expect(() => JsonValue({ value: null })).not.toThrow();
    expect(() => JsonValue({ value: undefined })).not.toThrow();
  });

  it('handles primitives', () => {
    expect(() => JsonValue({ value: 'hello' })).not.toThrow();
    expect(() => JsonValue({ value: 42 })).not.toThrow();
    expect(() => JsonValue({ value: true })).not.toThrow();
  });

  it('handles arrays', () => {
    expect(() => JsonValue({ value: [1, 2, 3] })).not.toThrow();
    expect(() => JsonValue({ value: [] })).not.toThrow();
  });

  it('handles objects', () => {
    expect(() => JsonValue({ value: { a: 1, b: 'two' } })).not.toThrow();
    expect(() => JsonValue({ value: {} })).not.toThrow();
  });

  it('handles nested structures', () => {
    expect(() => JsonValue({ value: { arr: [1, { nested: true }], str: 'hello', n: null } })).not.toThrow();
  });

  it('handles large arrays with overflow', () => {
    const large = Array.from({ length: 50 }, (_, i) => i);
    expect(() => JsonValue({ value: large })).not.toThrow();
  });

  it('accepts maxExpandDepth prop', () => {
    expect(() => JsonValue({ value: { a: { b: { c: 1 } } }, maxExpandDepth: 1 })).not.toThrow();
    expect(() => JsonValue({ value: { a: { b: { c: 1 } } }, maxExpandDepth: 0 })).not.toThrow();
  });
});
