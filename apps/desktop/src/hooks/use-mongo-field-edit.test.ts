import { describe, expect, it } from 'vitest';
import { parseEditValue } from './use-mongo-field-edit';

describe('parseEditValue', () => {
  it('parses boolean strings into booleans', () => {
    expect(parseEditValue('true')).toBe(true);
    expect(parseEditValue('false')).toBe(false);
  });

  it('parses null string into null', () => {
    expect(parseEditValue('null')).toBeNull();
  });

  it('parses numbers into numbers', () => {
    expect(parseEditValue('42')).toBe(42);
    expect(parseEditValue('3.14')).toBe(3.14);
  });

  it('parses JSON objects and arrays', () => {
    expect(parseEditValue('{"key":"value"}')).toEqual({ key: 'value' });
    expect(parseEditValue('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('falls back to string for plain text that is not JSON', () => {
    expect(parseEditValue('hello world')).toBe('hello world');
  });
});
