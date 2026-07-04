import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Wrench, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TerminalPane, type TerminalPaneApi } from '@/components/terminal-pane';
import { useConnections } from '@/hooks/use-connections';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import type { TerminalSessionStarted, TerminalSize } from '@/lib/terminal-session';
import type { TerminalSessionKind } from '@/lib/terminal-session-state';
import { checkToolInstalled } from '@/lib/tool-check';
import { appStore, navigateTo } from '@/store';
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
  // When set, the tab proactively checks that the CLI binary resolved from the
  // connection kind is installed before launching, and shows a reminder overlay
  // if it is missing. Returning `null` skips the check for that kind.
  readonly toolForKind?: (kind: string) => string | null;
};

// Tracks the proactive CLI tool presence check so the tab can show a
// "tool not installed" reminder before attempting to spawn the shell.
type ToolCheckState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'missing'; readonly hint: string }
  | { readonly status: 'ready' };

const INITIAL_TOOL_CHECK: ToolCheckState = { status: 'idle' };

export function DatabaseShellTab({
  active,
  connectionId,
  inactiveMessage,
  missingConnectionMessage,
  sessionKind,
  startShellSession,
  toolForKind,
}: DatabaseShellTabProps) {
  const theme = useStore(appStore, (state) => state.theme);
  const { data: connections } = useConnections();
  const connection = useMemo(
    () => connections?.find((item) => item.id === connectionId) ?? null,
    [connectionId, connections],
  );
  // Resolve the required CLI tool from the loaded connection kind so the check
  // only runs once the connection is available — the terminal is gated on the
  // same `connection`, which avoids a race where the session starts before the
  // tool presence check completes.
  const requiredTool = useMemo(() => {
    if (!connection || !toolForKind) return null;
    return toolForKind(connection.kind);
  }, [connection, toolForKind]);
  const terminalRef = useRef<TerminalPaneApi | null>(null);
  const [activated, setActivated] = useState(active);
  const [terminalReady, setTerminalReady] = useState(false);
  const [toolCheck, setToolCheck] = useState<ToolCheckState>(INITIAL_TOOL_CHECK);
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

  // Run the proactive tool presence check as soon as the tab is activated,
  // independent of terminal readiness, so the reminder appears immediately.
  const runToolCheck = useCallback(async () => {
    if (!requiredTool) {
      setToolCheck({ status: 'ready' });
      return;
    }
    setToolCheck({ status: 'checking' });
    try {
      const result = await checkToolInstalled(requiredTool);
      setToolCheck(result.installed ? { status: 'ready' } : { status: 'missing', hint: result.hint });
    } catch {
      // If the check itself fails (e.g. non-Tauri dev runtime), fall through to
      // the launch attempt so the existing error overlay can surface the real failure.
      setToolCheck({ status: 'ready' });
    }
  }, [requiredTool]);

  useEffect(() => {
    if (!activated || !requiredTool) return;
    if (toolCheck.status !== 'idle') return;
    void runToolCheck();
  }, [activated, requiredTool, toolCheck.status, runToolCheck]);

  // Only auto-start once the tool check (if any) reports ready, so a missing
  // tool surfaces the reminder instead of an immediate spawn failure.
  useEffect(() => {
    if (!active || !terminalReady) return;
    terminalRef.current?.focus();
    if (!activated || session.state.status !== 'idle') return;
    if (requiredTool && toolCheck.status !== 'ready') return;
    void start();
  }, [activated, active, session.state.status, start, terminalReady, requiredTool, toolCheck.status]);

  const handleReady = useCallback((api: TerminalPaneApi) => {
    terminalRef.current = api;
    setTerminalReady(true);
  }, []);

  const dark = theme === 'dark' || document.documentElement.classList.contains('dark');
  const hasTerminalFailure = session.state.status === 'error' || session.state.status === 'exited';
  const showToolReminder = toolCheck.status === 'missing';

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
          {showToolReminder && requiredTool ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black p-4">
              <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-950/95 p-4 text-center text-sm text-zinc-200 shadow-lg">
                <div className="flex flex-col items-center gap-2">
                  <XCircle className="size-6 text-destructive" />
                  <p className="font-medium">{requiredTool} is not installed on your system</p>
                  <p className="font-mono text-xs text-muted-foreground">{toolCheck.hint}</p>
                  <Button className="mt-2" size="sm" variant="outline" onClick={() => navigateTo('client-tools')}>
                    <Wrench className="size-3.5" />
                    Client Tools
                  </Button>
                </div>
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
