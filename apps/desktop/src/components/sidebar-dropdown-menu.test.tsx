import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionProfile } from '@kamehadb/shared';
import { KIND } from '@/lib/kinds';
import { ConnectionDropdownMenu } from './sidebar-dropdown-menu';

const storeMocks = vi.hoisted(() => ({
  appStore: { state: { openedTabs: [] } },
  setActiveConnection: vi.fn(),
  togglePinnedConnection: vi.fn(),
  openAiChatPanel: vi.fn(),
  closeTabsForConnection: vi.fn(),
  openNewQueryTab: vi.fn(),
  openGraphTab: vi.fn(),
  openDatabaseStatsTab: vi.fn(),
  openSchemaTimelineTab: vi.fn(),
  openMongoQueryTab: vi.fn(),
  openMongoShellTab: vi.fn(),
  openRedisQueryTab: vi.fn(),
  openRedisTab: vi.fn(),
}));

vi.mock('@/store', () => storeMocks);

describe('ConnectionDropdownMenu', () => {
  const dummyConn: ConnectionProfile = {
    id: 'conn-1',
    name: 'Test DB',
    kind: KIND.POSTGRES,
    host: 'localhost',
    port: 5432,
    database: 'test',
    mcpEnabled: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('renders trigger button with accessible label and event isolation container', () => {
    const html = renderToStaticMarkup(
      <ConnectionDropdownMenu
        conn={dummyConn}
        refreshConnection={{ mutate: vi.fn(), isPending: false }}
        pinned={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenPsql={vi.fn()}
        onBackup={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    // Verify accessible name and shadcn button rendering
    expect(html).toContain('aria-label="Connection actions"');
    expect(html).toContain('shrink-0');
  });
});
