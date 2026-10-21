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

const mockTerminalSession = vi.hoisted(() => vi.fn());
const mockConnections = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-terminal-session', () => ({
  useTerminalSession: () => mockTerminalSession(),
}));

vi.mock('@/hooks/use-connections', () => ({
  useConnections: () => mockConnections(),
}));

vi.mock('../../wailsjs/go/api/TerminalService', () => ({
  StartPostgresPsqlSession: vi.fn(),
}));

vi.mock('@/components/terminal-pane', () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { PostgresPsqlTab } from './postgres-psql-tab';

describe('PostgresPsqlTab', () => {
  it('displays clear error when psql binary is missing', () => {
    mockConnections.mockReturnValue({
      data: [{ id: 'conn-pg', name: 'Postgres', kind: 'postgres' }],
    });
    mockTerminalSession.mockReturnValue({
      state: {
        status: 'error',
        message: 'exec: "psql": executable file not found in $PATH',
      },
      start: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
    });

    const tab = {
      id: 'tab-psql-1',
      type: 'postgres-psql' as const,
      title: 'PSQL',
      connectionId: 'conn-pg',
    };

    const html = renderToStaticMarkup(<PostgresPsqlTab active={true} tab={tab} />);
    expect(html).toContain('Could not start psql');
    expect(html).toContain('psql is not installed or was not found in PATH');
    expect(html).toContain('Retry');
  });
});
