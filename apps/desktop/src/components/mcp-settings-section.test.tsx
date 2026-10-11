import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpSettingsSection } from './mcp-settings-section';

const hooks = vi.hoisted(() => ({
  useMcpSettings: vi.fn(),
  useMcpCallHistory: vi.fn(),
  useSetMcpHistoryEnabled: vi.fn(),
  useClearMcpCallHistory: vi.fn(),
  useRetryMcpListener: vi.fn(),
  useRotateMcpToken: vi.fn(),
  useSetConnectionMcpEnabled: vi.fn(),
  useUpdateMcpPort: vi.fn(),
  useMcpAccounts: vi.fn(),
  useCreateMcpManagedAccount: vi.fn(),
  useRevokeMcpManagedAccount: vi.fn(),
  useConnections: vi.fn(),
}));

vi.mock('@/hooks/use-mcp-settings', () => ({
  useMcpSettings: hooks.useMcpSettings,
  useMcpCallHistory: hooks.useMcpCallHistory,
  useSetMcpHistoryEnabled: hooks.useSetMcpHistoryEnabled,
  useClearMcpCallHistory: hooks.useClearMcpCallHistory,
  useRetryMcpListener: hooks.useRetryMcpListener,
  useRotateMcpToken: hooks.useRotateMcpToken,
  useSetConnectionMcpEnabled: hooks.useSetConnectionMcpEnabled,
  useUpdateMcpPort: hooks.useUpdateMcpPort,
  useMcpAccounts: hooks.useMcpAccounts,
  useCreateMcpManagedAccount: hooks.useCreateMcpManagedAccount,
  useRevokeMcpManagedAccount: hooks.useRevokeMcpManagedAccount,
}));

vi.mock('@/hooks/use-connections', () => ({ useConnections: hooks.useConnections }));

// Render inactive panels too so this static test can inspect the Logs panel.
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  hooks.useMcpSettings.mockReturnValue({
    data: {
      status: 'listening',
      port: 13979,
      endpoint: 'http://127.0.0.1:13979/mcp',
      token: 'local-token',
      historyEnabled: true,
      enabledProfiles: [],
    },
    isLoading: false,
  });
  hooks.useMcpCallHistory.mockReturnValue({
    data: {
      entries: [
        {
          id: 'call-1',
          profileId: 'removed-profile',
          toolName: 'sql_query',
          input: { sql: 'SELECT private_value' },
          executedAt: '2026-10-08T00:00:00.000Z',
          status: 'success',
          durationMs: 12,
          itemCount: 1,
          truncated: false,
        },
      ],
    },
    isLoading: false,
    isError: false,
  });
  hooks.useConnections.mockReturnValue({ data: [] });
  hooks.useMcpAccounts.mockReturnValue({ data: { accounts: [] } });
  hooks.useUpdateMcpPort.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useRetryMcpListener.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useRotateMcpToken.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useSetConnectionMcpEnabled.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useCreateMcpManagedAccount.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useRevokeMcpManagedAccount.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useSetMcpHistoryEnabled.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useClearMcpCallHistory.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe('McpSettingsSection call history', () => {
  it('shows local inputs and summaries without displaying database results', () => {
    const html = renderToStaticMarkup(<McpSettingsSection />);

    expect(html).toContain('Logs');
    expect(html).toContain('MCP call history');
    expect(html).toContain('stored locally in plain text for 30 days');
    expect(html).toContain('Record MCP call history');
    expect(html).toContain('Clear history');
    expect(html).toContain('removed-profile');
    expect(html).toContain('SELECT private_value');
    expect(html).toContain('Items: 1');
    expect(html).not.toContain('database result');
  });
});
