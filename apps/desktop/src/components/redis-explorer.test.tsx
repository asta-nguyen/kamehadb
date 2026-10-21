import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return storage;
});

const mockInfiniteKeys = vi.hoisted(() => vi.fn());
const mockKeyDetails = vi.hoisted(() => vi.fn());
const mockStats = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-redis', () => ({
  useRedisInfiniteKeys: () => mockInfiniteKeys(),
  useRedisKeyDetails: () => mockKeyDetails(),
  useRedisStats: () => mockStats(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ resetQueries: vi.fn() }),
}));

import { RedisExplorer } from './redis-explorer';

describe('RedisExplorer', () => {
  it('renders keys and the "Load more keys" button when hasNextPage is true', () => {
    mockInfiniteKeys.mockReturnValue({
      data: {
        pages: [
          {
            keys: [
              { key: 'user:1', type: 'string', ttl: -1 },
              { key: 'user:2', type: 'hash', ttl: 3600 },
            ],
            cursor: 42,
            done: false,
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
    });
    mockKeyDetails.mockReturnValue({ data: null });
    mockStats.mockReturnValue({ data: null, isLoading: false, error: null });

    const html = renderToStaticMarkup(<RedisExplorer connectionId="conn-1" />);

    expect(html).toContain('user:1');
    expect(html).toContain('user:2');
    expect(html).toContain('Load more keys');
    expect(html).toContain('Showing 2 keys (more available)');
  });

  it('does not render "Load more keys" when hasNextPage is false', () => {
    mockInfiniteKeys.mockReturnValue({
      data: {
        pages: [
          {
            keys: [{ key: 'user:1', type: 'string', ttl: -1 }],
            cursor: 0,
            done: true,
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockKeyDetails.mockReturnValue({ data: null });
    mockStats.mockReturnValue({ data: null, isLoading: false, error: null });

    const html = renderToStaticMarkup(<RedisExplorer connectionId="conn-1" />);

    expect(html).toContain('user:1');
    expect(html).not.toContain('Load more keys');
  });
});
