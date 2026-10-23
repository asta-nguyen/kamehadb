import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { Store } from '@tanstack/store';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@/lib/types';
import { QUERY_KEYS } from '@/lib/query-keys';
import { installPreviewCacheOwner } from './preview-cache';

const releaseRedisCursor = vi.hoisted(() => vi.fn().mockResolvedValue({ released: true }));

vi.mock('@/lib/api', () => ({
  api: { releaseRedisCursor },
}));

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });
});

function table(id: string, title = id, connectionId = 'connection'): WorkspaceTab {
  return { id, title, connectionId, type: 'table' };
}

// Drive the same store/cache subscriptions as production without mounting a
// browser: observer and close semantics come from the actual query library.
function setup(tabs: WorkspaceTab[]) {
  const client = new QueryClient();
  const source = new Store({ openedTabs: tabs, activeTabId: tabs[0]?.id ?? null });
  const dispose = installPreviewCacheOwner(client, source);
  const seed = (tab: WorkspaceTab, offset = 0, payloadBytes = 100): readonly unknown[] => {
    if (!('connectionId' in tab)) throw new Error('Expected a connected table');
    const key = QUERY_KEYS.PREVIEW(tab.connectionId, { tableId: tab.title, offset });
    client.setQueryData(key, { rows: [{ id: offset }], payloadBytes });
    return key;
  };
  return { client, source, dispose, seed };
}

describe('bounded workspace preview ownership', () => {
  it('keeps previews on tab switch and removes every variant on actual close', () => {
    const users = table('users');
    const orders = table('orders');
    const { client, source, dispose, seed } = setup([users, orders]);
    const first = seed(users);
    const next = seed(users, 50);
    const other = seed(orders);
    const metadata = QUERY_KEYS.COLUMNS('connection', 'users');
    client.setQueryData(metadata, []);
    source.setState((s) => ({ ...s, activeTabId: orders.id }));
    expect(client.getQueryData(first)).toBeDefined();
    source.setState((s) => ({ ...s, openedTabs: [orders] }));
    expect(client.getQueryData(first)).toBeUndefined();
    expect(client.getQueryData(next)).toBeUndefined();
    expect(client.getQueryData(other)).toBeDefined();
    expect(client.getQueryData(metadata)).toBeDefined();
    dispose();
    client.clear();
  });

  it('respects other connections and any surviving duplicate table tab', () => {
    const a = table('a', 'users');
    const duplicate = table('duplicate', 'users');
    const b = table('b', 'users', 'another-connection');
    const { client, source, dispose, seed } = setup([a, duplicate, b]);
    const first = seed(a);
    const other = seed(b);
    source.setState((s) => ({ ...s, openedTabs: [duplicate, b] }));
    expect(client.getQueryData(first)).toBeDefined();
    source.setState((s) => ({ ...s, openedTabs: [b] }));
    expect(client.getQueryData(first)).toBeUndefined();
    expect(client.getQueryData(other)).toBeDefined();
    dispose();
    client.clear();
  });

  it.each(['all', 'others', 'right'])('observes %s bulk close without a separate close-path patch', (kind) => {
    const tabs = [table('a'), table('b'), table('c')];
    const { client, source, dispose, seed } = setup(tabs);
    const keys = tabs.map((tab) => seed(tab));
    const survivors = kind === 'all' ? [] : kind === 'others' ? [tabs[1]] : tabs.slice(0, 2);
    source.setState((s) => ({ ...s, openedTabs: survivors }));
    for (let i = 0; i < tabs.length; i++) {
      expect(client.getQueryData(keys[i]) !== undefined).toBe(survivors.includes(tabs[i]));
    }
    dispose();
    client.clear();
  });

  it('evicts oldest inactive data but preserves observed and fetching results', () => {
    const tabs = Array.from({ length: 10 }, (_, i) => table(`table-${i}`));
    const { client, dispose, seed } = setup(tabs);
    const activeKey = seed(tabs[0], 0, 2 << 20);
    const observer = new QueryObserver(client, { queryKey: activeKey, enabled: false });
    const unsubscribe = observer.subscribe(() => undefined);
    const pendingKey = seed(tabs[1], 0, 2 << 20);
    client.getQueryCache().find({ queryKey: pendingKey })?.setState({ fetchStatus: 'fetching' });
    const keys = tabs.slice(2).map((tab) => seed(tab, 0, 2 << 20));
    expect(client.getQueryData(activeKey)).toBeDefined();
    expect(client.getQueryData(pendingKey)).toBeDefined();
    expect(client.getQueryData(keys[0])).toBeUndefined();
    expect(client.getQueryData(keys[keys.length - 1])).toBeDefined();
    unsubscribe();
    dispose();
    client.clear();
  });

  it('disposes subscriptions without continuing to evict results', () => {
    const tab = table('users');
    const { client, source, dispose, seed } = setup([tab]);
    const key = seed(tab);
    dispose();
    source.setState((s) => ({ ...s, openedTabs: [] }));
    expect(client.getQueryData(key)).toBeDefined();
    client.clear();
  });

  function mongoTab(id: string, connectionId = 'connection'): WorkspaceTab {
    return { id, title: id, connectionId, type: 'mongo', database: 'db', collection: 'items' };
  }

  function redisTab(id: string, connectionId = 'connection'): WorkspaceTab {
    return { id, title: id, connectionId, type: 'redis' };
  }

  it('shares the byte budget and tab ownership across SQL, Mongo and Redis', () => {
    const sql = table('orders');
    const mongo = mongoTab('mongo-tab');
    const redis = redisTab('redis-tab');
    const client = new QueryClient();
    const source = new Store({ openedTabs: [sql, mongo, redis], activeTabId: sql.id });
    const dispose = installPreviewCacheOwner(client, source);

    const sqlKey = QUERY_KEYS.PREVIEW('connection', { tableId: 'orders', offset: 0 });
    const mongoKey = QUERY_KEYS.MONGO_DOCUMENTS('connection', 'db', 'items', {}, {}, 100, 0, '');
    const redisKey = QUERY_KEYS.REDIS_KEYS('connection', '*', undefined);
    const redisPage = QUERY_KEYS.REDIS_KEY_PAGE('connection', 'mykey', undefined, 100);
    client.setQueryData(sqlKey, { rows: [{}], payloadBytes: 10 });
    client.setQueryData(mongoKey, { documents: [{ _id: 1 }], payloadBytes: 10 });
    client.setQueryData(redisKey, { keys: [{ key: 'a', type: 'string', ttl: -1 }], done: false });
    client.setQueryData(redisPage, { key: 'mykey', type: 'list', complete: true, value: ['a'], hasMore: false });
    const metaKey = QUERY_KEYS.REDIS_STATS('connection');
    client.setQueryData(metaKey, { totalKeys: 1 });

    source.setState((s) => ({ ...s, openedTabs: [sql] }));
    expect(client.getQueryData(sqlKey)).toBeDefined();
    expect(client.getQueryData(mongoKey)).toBeUndefined();
    expect(client.getQueryData(redisKey)).toBeUndefined();
    expect(client.getQueryData(redisPage)).toBeUndefined();
    // Stats/metadata entries are not browse results and survive tab closes.
    expect(client.getQueryData(metaKey)).toBeDefined();
    dispose();
    client.clear();
  });

  it('releases a Redis remainder lease only when no retained page references it', () => {
    const redis = redisTab('redis-tab');
    const client = new QueryClient();
    const source = new Store({ openedTabs: [redis], activeTabId: redis.id });
    const dispose = installPreviewCacheOwner(client, source);
    releaseRedisCursor.mockClear();

    // A lease cursor is base64url JSON; the owner only reads the lease id.
    const leaseCursor = (pos: number) =>
      btoa(JSON.stringify({ v: 1, kind: 'lease', lease: 'L1', pos, c: 'x' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const page1 = QUERY_KEYS.REDIS_KEY_PAGE('connection', 'big', undefined, 100);
    const page2 = QUERY_KEYS.REDIS_KEY_PAGE('connection', 'big', leaseCursor(0), 100);
    client.setQueryData(page1, {
      key: 'big',
      type: 'hash',
      complete: false,
      value: [],
      hasMore: true,
      nextCursor: leaseCursor(0),
    });
    client.setQueryData(page2, {
      key: 'big',
      type: 'hash',
      complete: false,
      value: [],
      hasMore: true,
      nextCursor: leaseCursor(50),
    });

    // Closing the explorer removes every variant: the shared lease is
    // released exactly once even though two cursors reference it.
    source.setState((s) => ({ ...s, openedTabs: [] }));
    expect(client.getQueryData(page1)).toBeUndefined();
    expect(client.getQueryData(page2)).toBeUndefined();
    expect(releaseRedisCursor).toHaveBeenCalledTimes(1);
    expect(releaseRedisCursor.mock.calls[0][0]).toBe('connection');
    dispose();
    client.clear();
  });

  it('keeps the lease while a retained page still consumes it', () => {
    const redis = redisTab('redis-tab');
    const client = new QueryClient();
    const source = new Store({ openedTabs: [redis], activeTabId: redis.id });
    const dispose = installPreviewCacheOwner(client, source);
    releaseRedisCursor.mockClear();

    const leaseCursor = (pos: number) =>
      btoa(JSON.stringify({ v: 1, kind: 'lease', lease: 'L2', pos, c: 'x' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const page1 = QUERY_KEYS.REDIS_KEY_PAGE('connection', 'big', undefined, 100);
    const page2 = QUERY_KEYS.REDIS_KEY_PAGE('connection', 'big', leaseCursor(0), 100);
    client.setQueryData(page1, {
      key: 'big',
      type: 'hash',
      complete: false,
      value: [],
      hasMore: true,
      nextCursor: leaseCursor(0),
    });
    client.setQueryData(page2, {
      key: 'big',
      type: 'hash',
      complete: false,
      value: [],
      hasMore: true,
      nextCursor: leaseCursor(50),
    });

    // Removing the first page while the second still consumes the lease must
    // not drop the shared remainder.
    client.removeQueries({ queryKey: page1, exact: true });
    expect(releaseRedisCursor).not.toHaveBeenCalled();
    dispose();
    client.clear();
  });
});

describe('browse-owned mutation GC', () => {
  // Settled browse-owned results are swept immediately once unobserved;
  // pending work, observed results, and foreign mutations survive. (What)
  it('retains pending and observed results; sweeps only unobserved settled browse-owned mutations', async () => {
    const { MutationObserver } = await import('@tanstack/react-query');
    const { client, source, dispose } = setup([table('t')]);
    const cache = client.getMutationCache();
    const ids = () => cache.getAll().map((m) => m.mutationId);

    // An unobserved browse-owned mutation is swept as soon as it settles.
    const settled = cache.build(client, {
      meta: { browseOwned: true },
      mutationFn: async () => 'done',
    });
    await settled.execute(undefined);
    expect(ids()).not.toContain(settled.mutationId);

    // An observed browse-owned mutation survives while pending and after it
    // settles — matching a mounted useMutation holding its result.
    let release!: () => void;
    const observer = new MutationObserver(client, {
      meta: { browseOwned: true },
      mutationFn: () => new Promise<string>((res) => (release = () => res('late'))),
    });
    const done = observer.mutate(undefined).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    const observed = cache.getAll().find((m) => m.options.meta?.browseOwned === true)!;
    expect(observed.state.status).toBe('pending');
    source.setState((s) => ({ ...s }));
    expect(ids()).toContain(observed.mutationId);
    release();
    await done;
    source.setState((s) => ({ ...s }));
    expect(ids()).toContain(observed.mutationId);

    // Untagged mutations from other features are never swept.
    const foreign = cache.build(client, { mutationFn: async () => 'other' });
    await foreign.execute(undefined);
    source.setState((s) => ({ ...s }));
    expect(ids()).toContain(foreign.mutationId);

    // Once the observer detaches, the settled browse-owned result is swept.
    observed.removeObserver(observer);
    source.setState((s) => ({ ...s }));
    expect(ids()).not.toContain(observed.mutationId);
    expect(ids()).toContain(foreign.mutationId);
    dispose();
    client.clear();
  });
});
