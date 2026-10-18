import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryResult } from '@kamehadb/shared';
import { api } from '@/lib/api';
import { useRunQuery } from './use-query';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    configurable: true,
  });
});
vi.mock('@/lib/api', () => ({ api: { runQuery: vi.fn() } }));

const RESULT: QueryResult = {
  columns: [{ name: 'payload', type: 'text' }],
  rows: [{ payload: 'synthetic result' }],
  rowCount: 1,
  durationMs: 0.041,
  truncated: false,
};

// Capture the real hook through SSR without adding a DOM test dependency.
// reset() removes its mutation observer, exercising the same GC path as unmount.
function renderMutation(client: QueryClient): ReturnType<typeof useRunQuery> {
  let mutation: ReturnType<typeof useRunQuery> | undefined;
  function Probe(): null {
    mutation = useRunQuery('connection-1');
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  if (!mutation) throw new Error('Query hook did not render');
  return mutation;
}

describe('SQL mutation result lifetime', () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = new QueryClient();
  });
  afterEach(() => {
    client.clear();
    vi.useRealTimers();
  });

  it('keeps the active result but releases it when its observer is removed', async () => {
    vi.mocked(api.runQuery).mockResolvedValue(RESULT);
    const mutation = renderMutation(client);
    expect(await mutation.mutateAsync({ query: 'SELECT payload' })).toBe(RESULT);
    await vi.runOnlyPendingTimersAsync();
    expect(client.getMutationCache().getAll()[0]?.state.data).toBe(RESULT);

    mutation.reset();
    await vi.runOnlyPendingTimersAsync();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it('does not remove a pending execution, but releases it after completion', async () => {
    let resolveQuery: ((result: QueryResult) => void) | undefined;
    vi.mocked(api.runQuery).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );
    const mutation = renderMutation(client);
    const running = mutation.mutateAsync({ query: 'SELECT payload' });
    await Promise.resolve();
    await Promise.resolve();
    mutation.reset();
    expect(client.getMutationCache().getAll()[0]?.state.status).toBe('pending');
    if (!resolveQuery) throw new Error('Query request did not start');
    resolveQuery(RESULT);
    expect(await running).toBe(RESULT);
    await vi.runOnlyPendingTimersAsync();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it('releases failed executions after their observer is removed', async () => {
    vi.mocked(api.runQuery).mockRejectedValue(new Error('query failed'));
    const mutation = renderMutation(client);
    await expect(mutation.mutateAsync({ query: 'SELECT payload' })).rejects.toThrow('query failed');
    mutation.reset();
    await vi.runOnlyPendingTimersAsync();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });
});
