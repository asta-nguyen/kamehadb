import type { Query, QueryClient } from '@tanstack/react-query';
import type { AppStoreState } from '@/lib/types';
import { PREVIEW_CACHE_BYTES, PREVIEW_HEAP_BYTES_PER_ROW, PREVIEW_STRING_STORAGE_FACTOR } from '@/lib/constants';

type WorkspaceSource = {
  readonly state: Pick<AppStoreState, 'openedTabs' | 'activeTabId'>;
  subscribe: (listener: () => void) => () => void;
};

// Match only result queries; schema metadata and other engine caches have
// independent lifetimes and must not be collateral damage of SQL eviction.
function previewIdentity(query: Query): string | null {
  const [family, connectionId, input] = query.queryKey;
  if (
    family !== 'preview' ||
    typeof connectionId !== 'string' ||
    typeof input !== 'object' ||
    input === null ||
    !('tableId' in input) ||
    typeof input.tableId !== 'string'
  )
    return null;
  return JSON.stringify([connectionId, input.tableId]);
}

// Wire bytes conservatively cover UTF-16 string storage, with a per-row
// allowance for objects. This is a retention estimate, not a JS heap reading.
function retainedBytes(data: unknown): number {
  if (typeof data !== 'object' || data === null || !('rows' in data) || !Array.isArray(data.rows)) return 0;
  const payload = 'payloadBytes' in data && typeof data.payloadBytes === 'number' ? data.payloadBytes : 0;
  return payload * PREVIEW_STRING_STORAGE_FACTOR + data.rows.length * PREVIEW_HEAP_BYTES_PER_ROW;
}

// The workspace owns result lifetime: switching tabs keeps a bounded warm
// cache, but closing any table (including bulk close) releases all variants.
export function installPreviewCacheOwner(client: QueryClient, source: WorkspaceSource): () => void {
  const touched = new Map<string, number>();
  let pruning = false;
  const prune = (): void => {
    if (pruning) return;
    pruning = true;
    try {
      const open = new Set(
        source.state.openedTabs.flatMap((tab) =>
          tab.type === 'table' && 'connectionId' in tab ? [JSON.stringify([tab.connectionId, tab.title])] : [],
        ),
      );
      const inactive: { query: Query; bytes: number }[] = [];
      let bytes = 0;
      for (const query of client.getQueryCache().getAll()) {
        const identity = previewIdentity(query);
        if (!identity) continue;
        if (!open.has(identity)) {
          client.removeQueries({ queryKey: query.queryKey, exact: true });
          touched.delete(query.queryHash);
          continue;
        }
        const size = retainedBytes(query.state.data);
        bytes += size;
        if (query.getObserversCount() === 0 && query.state.fetchStatus !== 'fetching') {
          inactive.push({ query, bytes: size });
        }
      }
      inactive.sort(
        (a, b) =>
          (touched.get(a.query.queryHash) ?? a.query.state.dataUpdatedAt) -
          (touched.get(b.query.queryHash) ?? b.query.state.dataUpdatedAt),
      );
      for (const entry of inactive) {
        if (bytes <= PREVIEW_CACHE_BYTES) break;
        client.removeQueries({ queryKey: entry.query.queryKey, exact: true });
        touched.delete(entry.query.queryHash);
        bytes -= entry.bytes;
      }
    } finally {
      pruning = false;
    }
  };
  const unsubscribeCache = client.getQueryCache().subscribe((event) => {
    if (event.type === 'removed') touched.delete(event.query.queryHash);
    else if (event.type === 'observerAdded' || (event.type === 'updated' && event.action.type === 'success')) {
      touched.set(event.query.queryHash, Date.now());
    }
    prune();
  });
  const unsubscribeStore = source.subscribe(prune);
  prune();
  return () => {
    unsubscribeCache();
    unsubscribeStore();
    touched.clear();
  };
}
