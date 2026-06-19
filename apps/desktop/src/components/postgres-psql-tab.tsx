import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorkspaceTab } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TerminalPane } from '@/components/terminal-pane';
import { useConnections } from '@/hooks/use-connections';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import { startPostgresPsqlSession } from '@/lib/postgres-psql';
import type { TerminalSize } from '@/lib/terminal-session';
import { appStore } from '@/store';
import { useStore } from '@tanstack/react-store';
import { AlertTriangle, Loader2, RotateCcw, Terminal } from 'lucide-react';

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

function statusLabel(status: 'idle' | 'starting' | 'running' | 'exited' | 'error') {
  if (status === 'starting') return 'Starting';
  if (status === 'running') return 'Connected';
  if (status === 'exited') return 'Exited';
  if (status === 'error') return 'Failed';
  return 'Idle';
}

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

  const retry = useCallback(async () => {
    session.reset();
    await start();
  }, [session, start]);

  const dark = theme === 'dark' || document.documentElement.classList.contains('dark');
  const canRetry = session.state.status === 'error' || session.state.status === 'exited';

  if (!connection) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        The PostgreSQL connection for this tab was not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-3">
        <div className="flex items-center min-w-0 gap-2">
          <Terminal className="size-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{connection.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {connection.database || 'postgres'} · {connection.host || 'localhost'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={session.state.status === 'running' ? 'default' : 'secondary'}>
            {session.state.status === 'starting' ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
            {statusLabel(session.state.status)}
          </Badge>
          {canRetry ? (
            <Button size="sm" variant="outline" onClick={() => void retry()}>
              <RotateCcw className="mr-1.5 size-3.5" />
              Reconnect
            </Button>
          ) : null}
        </div>
      </div>
      {session.state.message && session.state.status !== 'running' ? (
        <div className="flex items-center px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border gap-2">
          {session.state.status === 'error' ? <AlertTriangle className="size-3.5 text-destructive" /> : null}
          <span>{session.state.message}</span>
        </div>
      ) : null}
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
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Activate this tab to start the psql session.
        </div>
      )}
    </div>
  );
}
