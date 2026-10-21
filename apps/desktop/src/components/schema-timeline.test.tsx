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

const mockChangelog = vi.hoisted(() => vi.fn());
const mockSnapshots = vi.hoisted(() => vi.fn());
const mockWatcherStatus = vi.hoisted(() => vi.fn());
const mockConnections = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-schema-changelog', () => ({
  useSchemaChangelog: () => mockChangelog(),
  useCaptureSchemaSnapshot: () => ({ mutate: vi.fn(), isPending: false }),
  useSchemaSnapshots: () => mockSnapshots(),
  useSchemaWatcherStatus: () => mockWatcherStatus(),
  useStartSchemaWatcher: () => ({ mutate: vi.fn(), isPending: false }),
  useStopSchemaWatcher: () => ({ mutate: vi.fn(), isPending: false }),
  useStartSchemaNotifyWatcher: () => ({ mutate: vi.fn(), isPending: false }),
  useStopSchemaNotifyWatcher: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-connections', () => ({
  useConnections: () => mockConnections(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { SchemaTimeline } from './schema-timeline';

describe('SchemaTimeline', () => {
  it('renders initial snapshot with null changes without throwing TypeError', () => {
    mockConnections.mockReturnValue({
      data: [{ id: 'conn-1', kind: 'postgres', name: 'Postgres' }],
    });
    mockSnapshots.mockReturnValue({
      data: [{ id: 'snap-1', connectionId: 'conn-1', capturedAt: '2026-10-20T10:00:00Z', tableCount: 1 }],
    });
    mockWatcherStatus.mockReturnValue({
      data: { notifyRunning: false, cadenceRunning: false },
    });
    // Simulate initial snapshot where changes is null/undefined
    mockChangelog.mockReturnValue({
      data: {
        entries: [
          {
            snapshotId: 'snap-1',
            capturedAt: '2026-10-20T10:00:00Z',
            changes: null as never,
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    const html = renderToStaticMarkup(<SchemaTimeline connectionId="conn-1" />);
    expect(html).toContain('initial');
    expect(html).toContain('0 changes');
  });
});
