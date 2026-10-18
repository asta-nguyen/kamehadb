import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QUERY_KEYS } from '@/lib/query-keys';
import { usePreviewRows } from './use-schema';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });
});

// Only the active tab mounts. The hook must not own close cleanup, since that
// would make every normal tab switch discard its bounded warm result.
describe('preview hook result lifetime', () => {
  it('reads a cached preview without removing it when the view is not mounted', () => {
    const client = new QueryClient();
    const input = { tableId: 'users', limit: 50 };
    const key = QUERY_KEYS.PREVIEW('connection', input);
    client.setQueryData(key, { rows: [{ id: 1 }] });
    function Probe(): null {
      usePreviewRows('connection', input);
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    expect(client.getQueryData(key)).toBeDefined();
    client.clear();
  });
});
