import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorkspaceTab } from '@kamehadb/shared';
import { TerminalPane } from '@/components/terminal-pane';
import { useConnections } from '@/hooks/use-connections';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import { startPostgresPsqlSession } from '@/lib/postgres-psql';
import type { TerminalSize } from '@/lib/terminal-session';
import { appStore } from '@/store';
import { useStore } from '@tanstack/react-store';

type PostgresPsqlTabProps = {
  readonly active: boolean;
  readonly tab: Extract<WorkspaceTab, { readonly type: 'postgres-psql' }>;
};

type TerminalPaneApi = {
  readonly focus: () => void;
  readonly getSize: () => TerminalSize;
  readonly reset: () => void;
  readonly write: (data: Uint8Array | string) => void;
};

export function PostgresPsqlTab({ active, tab }: PostgresPsqlTabProps) {
  const theme = useStore(appStore, (state) => state.theme);
  const { data: connections } = useConnections();
  const connection = useMemo(
    () => connections?.find((item) => item.id === tab.connectionId) ?? null,
    [connections, tab.connectionId],
  );
  const terminalRef = useRef<TerminalPaneApi | null>(null);
  const [activated, setActivated] = useState(active);
  const [terminalReady, setTerminalReady] = useState(false);
  const session = useTerminalSession({
    kind: 'postgresPsql',
    onData: (data) => {
      terminalRef.current?.write(data);
    },
    startSession: (size) =>
      startPostgresPsqlSession({
        connectionId: tab.connectionId,
        cols: size.cols,
        rows: size.rows,
      }),
  });

  useEffect(() => {
    if (active) {
      setActivated(true);
    }
  }, [active]);

  const start = useCallback(async () => {
    const api = terminalRef.current;
    if (!api) return;
    api.reset();
    await session.start(api.getSize());
  }, [session]);

  useEffect(() => {
    if (!active || !terminalReady) return;
    terminalRef.current?.focus();
    if (activated && session.state.status === 'idle') {
      void start();
    }
  }, [activated, active, session.state.status, start, terminalReady]);

  const handleReady = useCallback((api: TerminalPaneApi) => {
    terminalRef.current = api;
    setTerminalReady(true);
  }, []);

  const dark = theme === 'dark' || document.documentElement.classList.contains('dark');

  if (!connection) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        The PostgreSQL connection for this tab was not found.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-black">
      {activated ? (
        <TerminalPane
          active={active}
          dark={dark}
          onInput={(data) => {
            void session.write(data);
          }}
          onReady={handleReady}
          onResize={(size) => {
            void session.resize(size);
          }}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          Activate this tab to start the psql session.
        </div>
      )}
    </div>
  );
}
