import { describe, expect, it, vi } from 'vitest';
import type { QueryResult } from '@kamehadb/shared';
import {
  INITIAL_PREVIEW_NAVIGATION,
  canAdvancePreview,
  nextPreviewPage,
  previousPreviewPage,
  jumpPreviewPage,
} from './preview-navigation';
import { MAX_PREVIEW_BOOKMARKS } from '@/lib/constants';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });
});

function page(mode: 'keyset' | 'offset', rows = 50, nextCursor = 'opaque-bigint-cursor'): QueryResult {
  return {
    columns: [],
    rows: Array.from({ length: rows }, (_, i) => ({ id: i })),
    rowCount: rows,
    durationMs: 1,
    truncated: true,
    hasMore: true,
    paginationMode: mode,
    nextCursor,
  };
}

describe('preview navigation', () => {
  it('uses opaque backend keys and actual admitted row counts', () => {
    const result = page('keyset', 31);
    const next = nextPreviewPage(INITIAL_PREVIEW_NAVIGATION, result);
    expect(next.position).toEqual({ offset: 31, paginationMode: 'auto', cursor: result.nextCursor });
    expect(next.pageIndex).toBe(1);
    expect(previousPreviewPage(next, 50)).toEqual(INITIAL_PREVIEW_NAVIGATION);
  });

  it('keeps exact byte-shortened boundaries in offset fallback', () => {
    const first = nextPreviewPage(INITIAL_PREVIEW_NAVIGATION, page('offset', 17));
    const second = nextPreviewPage(first, page('offset', 13));
    expect(second.position.offset).toBe(30);
    expect(second.position.cursor).toBeUndefined();
    expect(previousPreviewPage(second, 50)).toEqual(first);
  });

  it('does not navigate on pending, placeholder, empty, terminal or missing-key results', () => {
    expect(nextPreviewPage(INITIAL_PREVIEW_NAVIGATION, page('keyset'), true)).toBe(INITIAL_PREVIEW_NAVIGATION);
    expect(canAdvancePreview(page('keyset', 0), false)).toBe(false);
    expect(canAdvancePreview(page('keyset', 50, ''), false)).toBe(false);
    expect(canAdvancePreview({ ...page('keyset'), hasMore: false }, false)).toBe(false);
    expect(canAdvancePreview(undefined, false)).toBe(false);
  });

  it('bounds bookmarks and retains no result datasets in them', () => {
    let state = INITIAL_PREVIEW_NAVIGATION;
    for (let i = 0; i <= MAX_PREVIEW_BOOKMARKS; i++) state = nextPreviewPage(state, page('keyset'));
    expect(state.previous).toHaveLength(MAX_PREVIEW_BOOKMARKS);
    expect(state.previous[0]).not.toHaveProperty('rows');
    expect(state.previous[0].offset).toBe(50);
  });

  it('retains direct offset jumps and resets all bookmarks at first page', () => {
    const jump = jumpPreviewPage(500, 50);
    expect(jump.position).toEqual({ offset: 500, paginationMode: 'offset' });
    expect(previousPreviewPage(jump, 50).position.offset).toBe(450);
    expect(jumpPreviewPage(0, 50)).toBe(INITIAL_PREVIEW_NAVIGATION);
  });
});
