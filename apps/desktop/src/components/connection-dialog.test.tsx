import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionProfile } from '@kamehadb/shared';
import { KIND } from '@/lib/kinds';
import { ConnectionDialog } from './connection-dialog';

// Render dialog parts inline so the switch markup is reachable in Vitest's
// Node-only setup; the real dialog portals out of the server-rendered tree.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => <>{render ?? children}</>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/hooks/use-connections', () => ({
  useCreateConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestConnection: () => ({ mutateAsync: vi.fn(), isPending: false, reset: vi.fn(), data: undefined }),
}));

const storeMocks = vi.hoisted(() => ({
  openNewQueryTab: vi.fn(),
  openGraphTab: vi.fn(),
  openDatabaseStatsTab: vi.fn(),
  openSchemaTimelineTab: vi.fn(),
  openMongoQueryTab: vi.fn(),
  openMongoShellTab: vi.fn(),
  openRedisQueryTab: vi.fn(),
  openRedisTab: vi.fn(),
  appStore: { state: { activeMongoDatabase: null as string | null } },
}));

vi.mock('@/store', () => storeMocks);

function profile(overrides: Partial<ConnectionProfile>): ConnectionProfile {
  return {
    id: 'conn-1',
    name: 'Test',
    kind: KIND.POSTGRES,
    host: 'localhost',
    readOnly: true,
    mcpEnabled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SQLReadOnlySwitch', () => {
  it('defaults on for a new SQL connection', () => {
    const html = renderToStaticMarkup(<ConnectionDialog open />);
    expect(html).toContain('Read-only');
    expect(html).toContain('MCP stays read-only');
    expect(html).toMatch(/id="read-only"[^>]*checked=""/);
  });

  it('defaults on for a saved profile missing the readOnly field', () => {
    const legacy = { ...profile({}), readOnly: undefined } as unknown as ConnectionProfile;
    const html = renderToStaticMarkup(<ConnectionDialog open editConnection={legacy} />);
    expect(html).toMatch(/id="read-only"[^>]*checked=""/);
  });

  it('restores an explicit off value when editing', () => {
    const html = renderToStaticMarkup(<ConnectionDialog open editConnection={profile({ readOnly: false })} />);
    expect(html).toContain('id="read-only"');
    expect(html).not.toMatch(/id="read-only"[^>]*checked=""/);
  });

  it('hides the switch for non-SQL kinds', () => {
    for (const kind of [KIND.MONGODB, KIND.REDIS]) {
      const html = renderToStaticMarkup(<ConnectionDialog open editConnection={profile({ kind })} />);
      expect(html).not.toContain('id="read-only"');
      expect(html).not.toContain('MCP stays read-only');
    }
  });
});
