import type { PreviewRowsInput, QueryResult } from '@kamehadb/shared';
import { MAX_PREVIEW_BOOKMARKS } from '@/lib/constants';

type PreviewPosition = Pick<PreviewRowsInput, 'cursor' | 'paginationMode'> & { offset: number };
export type PreviewNavigation = {
  position: PreviewPosition;
  previous: PreviewPosition[];
  pageIndex: number;
};

export const INITIAL_PREVIEW_NAVIGATION: PreviewNavigation = {
  position: { offset: 0, paginationMode: 'auto' },
  previous: [],
  pageIndex: 0,
};

export function canAdvancePreview(result: QueryResult | undefined, pending: boolean): boolean {
  return (
    !pending &&
    !!result &&
    result.rows.length > 0 &&
    (result.hasMore ?? result.truncated) &&
    (result.paginationMode !== 'keyset' || !!result.nextCursor)
  );
}

// Advance by admitted rows, not requested page size. A byte-shortened page
// must not skip records; opaque cursors are never constructed from JS cells.
export function nextPreviewPage(state: PreviewNavigation, result: QueryResult, pending = false): PreviewNavigation {
  if (!canAdvancePreview(result, pending)) return state;
  const keyset = result.paginationMode === 'keyset';
  return {
    position: {
      offset: state.position.offset + result.rows.length,
      paginationMode: keyset ? 'auto' : 'offset',
      cursor: keyset ? result.nextCursor : undefined,
    },
    previous: [...state.previous, state.position].slice(-MAX_PREVIEW_BOOKMARKS),
    pageIndex: state.pageIndex + 1,
  };
}

export function canGoBackPreview(state: PreviewNavigation): boolean {
  return state.previous.length > 0 || (state.position.paginationMode === 'offset' && state.position.offset > 0);
}

// Revisit the exact previous request, including byte-shortened boundaries.
// Direct numeric jumps retain legacy offset behavior; seek never guesses a key.
export function previousPreviewPage(state: PreviewNavigation, pageSize: number): PreviewNavigation {
  const bookmark = state.previous.at(-1);
  if (bookmark) return { position: bookmark, previous: state.previous.slice(0, -1), pageIndex: state.pageIndex - 1 };
  if (!canGoBackPreview(state)) return state;
  const offset = Math.max(0, state.position.offset - pageSize);
  return { position: { offset, paginationMode: 'offset' }, previous: [], pageIndex: Math.floor(offset / pageSize) };
}

export function jumpPreviewPage(offset: number, pageSize: number): PreviewNavigation {
  return offset === 0
    ? INITIAL_PREVIEW_NAVIGATION
    : {
        position: { offset, paginationMode: 'offset' },
        previous: [],
        pageIndex: Math.floor(offset / pageSize),
      };
}
