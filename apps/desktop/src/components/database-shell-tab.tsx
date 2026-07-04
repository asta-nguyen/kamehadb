import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TerminalPane, type TerminalPaneApi } from '@/components/terminal-pane';
import { useConnections } from '@/hooks/use-connections';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import { checkToolInstalled, type ToolInstallStatus } from '@/lib/terminal-session';
import type { TerminalSize } from '@/lib/terminal-session';
import type { TerminalSessionKind } from '@/lib/terminal-session-state';
import { appStore, navigateTo } from '@/store';
import { useStore } from '@tanstack/react-store';

type ShellTab = {
  readonly connectionId: string;
};

type DatabaseShellTabProps<TTab extends ShellTab> = {
  readonly active: boolean;
  readonly tab: TTab;
  readonly sessionKind: TerminalSessionKind;
  readonly inactiveMessage: string;
  readonly missingConnectionMessage: string;
  readonly startSession: (tab: TTab, size: TerminalSize) => Promise<{ readonly sessionId: string }>;
  // When set, the tab proactively checks the CLI binary is installed before
  // launching and shows an install-reminder overlay if it is missing. (Why:
  // avoids a confusing spawn failure inside the terminal for sqlite3/sqlcmd.)
  readonly toolName?: string;
  readonly toolDisplayName?: string;
};

type ToolCheckState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'missing'; readonly hint: string }
  | { readonly status: 'ready' };

export function DatabaseShellTab<TTab extends ShellTab>({
  active,
  tab,
  sessionKind,
  inactiveMessage,
  missingConnectionMessage,
  startSession,
  toolName,
  toolDisplayName,
}: DatabaseShellTabProps<TTab>) {
  const theme = useStore(appStore, (state) => state.theme);
  const { data: connections } = useConnections();
  const connection = useMemo(
    () => connections?.find((item) => item.id === tab.connectionId) ?? null,
    [connections, tab.connectionId],
  );
  const terminalRef = useRef<TerminalPaneApi | null>(null);
  const [activated, setActivated] = useState(active);
  const [terminalReady, setTerminalReady] = useState(false);
  const [toolCheck, setToolCheck] = useState<ToolCheckState>({ status: 'idle' });
  const session = useTerminalSession({
    kind: sessionKind,
    onData: (data) => {
      terminalRef.current?.write(data);
    },
    startSession: (size) => startSession(tab, size),
  });

  useEffect(() => {
    if (active) {
      setActivated(true);
    }
  }, [active]);

  // Run the proactive tool-installed check once the tab is activated and a
  // tool name is configured. Skips the check entirely when no toolName is
  // provided so existing tabs (e.g. psql) keep their original behavior.
  // (How: invoke the Tauri check_tool_installed command and map the result.)
  useEffect(() => {
    if (!activated || !toolName) return;
    if (toolCheck.status !== 'idle') return;
    let cancelled = false;
    setToolCheck({ status: 'checking' });
    void checkToolInstalled(toolName)
      .then((result: ToolInstallStatus) => {
        if (cancelled) return;
        setToolCheck(result.installed ? { status: 'ready' } : { status: 'missing', hint: result.hint });
      })
      .catch(() => {
        if (cancelled) return;
        // If the check itself fails (e.g. non-Tauri dev runtime), fall back to
        // proceeding normally so we never block the terminal behind a false
        // negative. (Why: the spawn error overlay still handles real failures.)
        setToolCheck({ status: 'ready' });
      });
    return () => {
      cancelled = true;
    };
  }, [activated, toolName, toolCheck.status]);

  const start = useCallback(async () => {
    const api = terminalRef.current;
    if (!api) return;
    api.reset();
    await session.start(api.getSize());
  }, [session]);

  useEffect(() => {
    if (!active || !terminalReady) return;
    terminalRef.current?.focus();
    // Only auto-start once the proactive tool check (if any) reports ready.
    // (Why: avoids launching a session we already know will fail to spawn.)
    const toolReady = !toolName || toolCheck.status === 'ready';
    if (activated && toolReady && session.state.status === 'idle') {
      void start();
    }
  }, [activated, active, session.state.status, start, terminalReady, toolName, toolCheck.status]);

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
            onResize={(size) => {
              void session.resize(size);
            }}
          />
          {toolCheck.status === 'missing' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
              <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-950/95 p-4 text-center text-sm text-zinc-200 shadow-lg">
                <AlertTriangle className="mx-auto size-6 text-amber-500" />
                <p className="mt-2 font-medium">{toolDisplayName ?? toolName} is not installed on your system</p>
                {toolCheck.hint ? <p className="mt-1 font-mono text-xs text-zinc-400">{toolCheck.hint}</p> : null}
                <Button className="mt-3" size="sm" variant="outline" onClick={() => navigateTo('client-tools')}>
                  <Wrench className="size-3.5" />
                  Client Tools
                </Button>
              </div>
            </div>
          ) : null}
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
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{inactiveMessage}</div>
      )}
    </div>
  );
}
