import type { Query, QueryClient } from '@tanstack/react-query';
import type { AppStoreState } from '@/lib/types';
import { api } from '@/lib/api';
import { PREVIEW_CACHE_BYTES, PREVIEW_HEAP_BYTES_PER_ROW, PREVIEW_STRING_STORAGE_FACTOR } from '@/lib/constants';

type WorkspaceSource = {
  readonly state: Pick<AppStoreState, 'openedTabs' | 'activeTabId'>;
  subscribe: (listener: () => void) => () => void;
};

// Browse-result identity shared across engines: SQL by connection+table,
// Mongo by connection+database+collection, Redis by connection (the explorer
// owns the key namespace). Metadata caches (columns, indexes, stats,
// databases, collections) have independent lifetimes and are excluded. (What)
function browseIdentity(query: Query): string | null {
  const [family, connectionId, a, b, c] = query.queryKey;
  if (typeof connectionId !== 'string') return null;
  if (family === 'preview') {
    if (typeof a !== 'object' || a === null || !('tableId' in a) || typeof a.tableId !== 'string') return null;
    return JSON.stringify([connectionId, 'sql', a.tableId]);
  }
  if (family === 'mongo' && c === 'documents' && typeof a === 'string' && typeof b === 'string') {
    return JSON.stringify([connectionId, 'mongo', a, b]);
  }
  if (family === 'redis-keys' || family === 'redis-key' || family === 'redis-key-page') {
    return JSON.stringify([connectionId, 'redis']);
  }
  return null;
}

// Which browse identities an open tab still owns.
function tabIdentities(tab: AppStoreState['openedTabs'][number]): string[] {
  if (!('connectionId' in tab)) return [];
  if (tab.type === 'table') return [JSON.stringify([tab.connectionId, 'sql', tab.title])];
  if (tab.type === 'mongo') return [JSON.stringify([tab.connectionId, 'mongo', tab.database, tab.collection])];
  if (tab.type === 'redis') return [JSON.stringify([tab.connectionId, 'redis'])];
  return [];
}

// Wire bytes conservatively cover UTF-16 string storage, with a per-item
// allowance for objects. This is a retention estimate, not a JS heap reading.
function retainedBytes(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  const payload = 'payloadBytes' in data && typeof data.payloadBytes === 'number' ? data.payloadBytes : 0;
  let items = 0;
  if ('rows' in data && Array.isArray(data.rows)) items = data.rows.length;
  else if ('documents' in data && Array.isArray(data.documents)) items = data.documents.length;
  else if ('keys' in data && Array.isArray(data.keys)) items = data.keys.length;
  else if ('value' in data && Array.isArray(data.value)) items = data.value.length;
  return payload * PREVIEW_STRING_STORAGE_FACTOR + items * PREVIEW_HEAP_BYTES_PER_ROW;
}

// The workspace owns result lifetime: switching tabs keeps a bounded warm
// cache across SQL, Mongo and Redis, but closing the last owning tab releases
// every variant. One shared byte budget covers all three so a Redis explorer
// can't grow the footprint the SQL cap was meant to bound. (What/Why)
export function installPreviewCacheOwner(client: QueryClient, source: WorkspaceSource): () => void {
  const touched = new Map<string, number>();
  let pruning = false;
  // Mutation exposes no observer count, so the owner tracks observer add/remove
  // events to distinguish observed from unobserved results.
  const mutationObservers = new Map<number, number>();
  const prune = (): void => {
    if (pruning) return;
    pruning = true;
    try {
      const open = new Set(source.state.openedTabs.flatMap(tabIdentities));
      const removed: Query[] = [];
      const inactive: { query: Query; bytes: number }[] = [];
      let bytes = 0;
      for (const query of client.getQueryCache().getAll()) {
        const identity = browseIdentity(query);
        if (!identity) continue;
        if (!open.has(identity)) {
          client.removeQueries({ queryKey: query.queryKey, exact: true });
          touched.delete(query.queryHash);
          removed.push(query);
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
        removed.push(entry.query);
        bytes -= entry.bytes;
      }
      releaseObsoleteLeases(client, removed);
      // Only settled mutations that opted into browse GC (meta.browseOwned)
      // and have no live observer are swept — observed results stay alive, and
      // other features' mutations (e.g. AI chat) are never touched. (What/Why)
      for (const mutation of client.getMutationCache().getAll()) {
        // Only truly settled results sweep: a newly added mutation enters as
        // 'idle' before its observer/execute arrive, so 'idle' must survive.
        if (
          (mutation.state.status === 'success' || mutation.state.status === 'error') &&
          mutation.options.meta?.browseOwned === true &&
          (mutationObservers.get(mutation.mutationId) ?? 0) === 0
        ) {
          client.getMutationCache().remove(mutation);
        }
      }
    } finally {
      pruning = false;
    }
  };
  const unsubscribeMutations = client.getMutationCache().subscribe((event) => {
    if (event.type === 'observerAdded') {
      mutationObservers.set(event.mutation.mutationId, (mutationObservers.get(event.mutation.mutationId) ?? 0) + 1);
    } else if (event.type === 'observerRemoved') {
      mutationObservers.set(
        event.mutation.mutationId,
        Math.max(0, (mutationObservers.get(event.mutation.mutationId) ?? 0) - 1),
      );
    } else if (event.type === 'removed') {
      mutationObservers.delete(event.mutation.mutationId);
    }
    prune();
  });
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
    unsubscribeMutations();
    unsubscribeStore();
    touched.clear();
    mutationObservers.clear();
  };
}

// Extract the remainder-lease id from an opaque continuation. Cursor shapes
// belong to the backend; decoding is only a GC correlation hint — anything
// unreadable or lease-less is skipped and the server-side release is a no-op
// for non-lease cursors anyway. (How)
function leaseIdOf(cursor: unknown): string | null {
  if (typeof cursor !== 'string' || !cursor) return null;
  try {
    const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const decoded: unknown = JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
    if (typeof decoded === 'object' && decoded !== null && 'lease' in decoded && typeof decoded.lease === 'string') {
      return decoded.lease;
    }
  } catch {
    /* not a base64 continuation — nothing to correlate */
  }
  return null;
}

// A removed Redis page may still hold a lease cursor that some retained page
// consumes, and one lease is referenced by several position cursors. Release
// only leases no retained query still reaches — input cursors are the forward
// frontier, retained nextCursors the stored boundary. (Why)
function releaseObsoleteLeases(client: QueryClient, removed: Query[]): void {
  if (removed.length === 0) return;
  const liveLeases = new Set<string>();
  for (const q of client.getQueryCache().getAll()) {
    const [family] = q.queryKey;
    if (family !== 'redis-keys' && family !== 'redis-key-page') continue;
    const input = leaseIdOf(q.queryKey[3]);
    if (input) liveLeases.add(input);
    const data = q.state.data;
    if (typeof data === 'object' && data !== null && 'nextCursor' in data) {
      const next = leaseIdOf(data.nextCursor);
      if (next) liveLeases.add(next);
    }
  }
  const released = new Set<string>();
  for (const q of removed) {
    const connectionId = q.queryKey[1];
    if (typeof connectionId !== 'string') continue;
    const data = q.state.data;
    const cursors: unknown[] = [q.queryKey[3]];
    if (typeof data === 'object' && data !== null && 'nextCursor' in data) cursors.push(data.nextCursor);
    for (const cursor of cursors) {
      const lease = leaseIdOf(cursor);
      if (!lease || liveLeases.has(lease) || released.has(lease)) continue;
      released.add(lease);
      void api.releaseRedisCursor(connectionId, cursor as string).catch(() => undefined);
    }
  }
}
