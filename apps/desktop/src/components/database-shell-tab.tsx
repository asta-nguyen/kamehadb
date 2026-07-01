import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TerminalPane, type TerminalPaneApi } from '@/components/terminal-pane';
import { useConnections } from '@/hooks/use-connections';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import type { TerminalSessionStarted, TerminalSize } from '@/lib/terminal-session';
import type { TerminalSessionKind } from '@/lib/terminal-session-state';
import { appStore } from '@/store';
import { useStore } from '@tanstack/react-store';

type StartShellSession = (request: {
  readonly connectionId: string;
  readonly cols: number;
  readonly rows: number;
}) => Promise<TerminalSessionStarted>;

type DatabaseShellTabProps = {
  readonly active: boolean;
  readonly connectionId: string;
  readonly inactiveMessage: string;
  readonly missingConnectionMessage: string;
  readonly sessionKind: TerminalSessionKind;
  readonly startShellSession: StartShellSession;
};

export function DatabaseShellTab({
  active,
  connectionId,
  inactiveMessage,
  missingConnectionMessage,
  sessionKind,
  startShellSession,
}: DatabaseShellTabProps) {
  const theme = useStore(appStore, (state) => state.theme);
  const { data: connections } = useConnections();
  const connection = useMemo(
    () => connections?.find((item) => item.id === connectionId) ?? null,
    [connectionId, connections],
  );
  const terminalRef = useRef<TerminalPaneApi | null>(null);
  const [activated, setActivated] = useState(active);
  const [terminalReady, setTerminalReady] = useState(false);
  const session = useTerminalSession({
    kind: sessionKind,
    onData: (data) => {
      terminalRef.current?.write(data);
    },
    startSession: (size) =>
      startShellSession({
        connectionId,
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
  const hasTerminalFailure = session.state.status === 'error' || session.state.status === 'exited';

  if (!connection) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        {missingConnectionMessage}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black">
      {activated ? (
        <div className="relative min-h-0 flex-1 w-full">
          <TerminalPane
            active={active}
            dark={dark}
            onInput={(data) => {
              void session.write(data);
            }}
            onReady={handleReady}
            onResize={(size: TerminalSize) => {
              void session.resize(size);
            }}
          />
          {hasTerminalFailure ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
              <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-950/95 p-4 text-center text-sm text-zinc-200 shadow-lg">
                <p className="font-medium">{session.state.message ?? 'The terminal session ended.'}</p>
                <Button className="mt-3" size="sm" onClick={() => void start()}>
                  Start again
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <ShellTabNotice message={inactiveMessage} />
      )}
    </div>
  );
}

function ShellTabNotice({ message }: { readonly message: string }) {
  return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{message}</div>;
}
