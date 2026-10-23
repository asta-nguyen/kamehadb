import { describe, expect, it } from 'vitest';
import { pageOffsetsFor } from './page-offsets';

const PAGE = 20;

describe('pageOffsetsFor', () => {
  it('advances by admitted rows after a byte-shortened page', () => {
    // Regression: a 2 MiB-bounded page admitting 8 of 20 requested docs must
    // make the next page skip 8 — page*PAGE_LIMIT (20) would drop docs 8–19.
    const offsets = pageOffsetsFor([0], 1, 0, 8, PAGE);
    expect(offsets[1]).toBe(8);
    const next = pageOffsetsFor(offsets, 2, 1, 5, PAGE);
    expect(next[2]).toBe(13);
  });

  it('advances by page size for full pages', () => {
    expect(pageOffsetsFor([0], 1, 0, PAGE, PAGE)[1]).toBe(PAGE);
    expect(pageOffsetsFor([0, PAGE], 2, 1, PAGE, PAGE)[2]).toBe(2 * PAGE);
  });

  it('keeps recorded offsets when navigating back', () => {
    const offsets = [0, 8, 13];
    expect(pageOffsetsFor(offsets, 1, 2, 10, PAGE)).toBe(offsets);
  });

  it('synthesizes intermediate offsets with full pages on jumps', () => {
    expect(pageOffsetsFor([0], 3, 0, PAGE, PAGE)[3]).toBe(3 * PAGE);
  });
});
