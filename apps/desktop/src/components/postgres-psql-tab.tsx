import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

import type { WorkspaceTab } from '@/lib/types';
import { TerminalPane } from '@/components/terminal-pane';
import { useConnections } from '@/hooks/use-connections';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import type { TerminalSessionStarted, TerminalSize } from '@/lib/terminal-session';
import { StartPostgresPsqlSession } from '../../wailsjs/go/api/TerminalService';
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
      StartPostgresPsqlSession(tab.connectionId, size.cols, size.rows) as Promise<TerminalSessionStarted>,
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

  // Write error to terminal if psql fails to spawn, matching Mongo Shell error feedback. (How / Why / What)
  useEffect(() => {
    if (session.state.status === 'error' && terminalReady && terminalRef.current) {
      terminalRef.current.write(`\r\n\x1b[31mError: ${session.state.message}\x1b[0m\r\n`);
    }
  }, [session.state.status, session.state.message, terminalReady]);

  const dark =
    theme === 'dark' || (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  if (!connection) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        The PostgreSQL connection for this tab was not found.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {session.state.status === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 p-6 text-center">
          <div className="max-w-md space-y-3">
            <AlertCircle className="size-8 mx-auto text-destructive" />
            <h3 className="text-sm font-semibold text-foreground">Could not start psql</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {session.state.message?.toLowerCase().includes('not found') ||
              session.state.message?.toLowerCase().includes('executable')
                ? 'psql is not installed or was not found in PATH. Install PostgreSQL client tools or add psql to PATH to use the embedded shell.'
                : (session.state.message ?? 'An unknown error occurred while starting psql.')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void start()}>
              Retry
            </Button>
          </div>
        </div>
      )}
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
