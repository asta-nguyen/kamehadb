import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { Store } from '@tanstack/store';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@/lib/types';
import { QUERY_KEYS } from '@/lib/query-keys';
import { installPreviewCacheOwner } from './preview-cache';

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
});
