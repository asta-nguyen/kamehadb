import { useEffect, useRef, useCallback } from 'react';
import { safeErrorMessage } from '@kamehadb/shared';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useConnections } from '@/hooks/use-connections';
import { api } from '@/lib/api';
import { updateTabShellSessionId } from '@/store';
import type { WorkspaceTab } from '@/lib/types';
import '@xterm/xterm/css/xterm.css';

interface MongoShellProps {
  tab: Extract<WorkspaceTab, { type: 'mongo-shell' }>;
  connectionId: string;
}

export function MongoShell({ tab, connectionId }: MongoShellProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(tab.sessionId ?? null);

  const { data: connections } = useConnections();
  const profile = connections?.find((c) => c.id === connectionId);
  const connectionString = profile?.connectionString ?? '';

  // Forward keystrokes to the running shell session.
  const handleData = useCallback((data: string) => {
    const sid = sessionIdRef.current;
    if (sid) {
      api.writeMongoShell(sid, data).catch(() => {});
    }
  }, []);

  // Forward terminal resize to the PTY backend.
  const handleResize = useCallback((_cols: number, _rows: number) => {
    const sid = sessionIdRef.current;
    if (sid) {
      api.resizeMongoShell(sid, _cols, _rows).catch(() => {});
    }
  }, []);

  // Combined effect: create xterm.js terminal AND start/reconnect the
  // mongosh shell in one shot.  Having a single effect (not two separate
  // ones) is critical because React StrictMode double-invokes effects:
  // a second effect guarded by `startedRef` would skip starting the
  // shell for the second (live) terminal, leaving a ghost "Starting
  // mongosh..." screen.
  useEffect(() => {
    const terminalContainer = terminalRef.current;
    if (!terminalContainer || !connectionString) return;

    // ---- xterm.js terminal setup ----
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      allowProposedApi: true,
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer);
    fitAddon.fit();

    term.onData(handleData);
    term.onResize(({ cols, rows }) => handleResize(cols, rows));

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        /* teardown */
      }
    });
    resizeObserver.observe(terminalContainer);

    term.write('\x1b[32mStarting mongosh\x1b[0m...\r\n');

    // ---- Shell start / reconnect ----
    const abort = new AbortController();

    // Keep the ref in sync with the current tab's sessionId so handleData
    // and handleResize always route I/O to the right session.
    sessionIdRef.current = tab.sessionId ?? null;

    (async () => {
      try {
        let sessionId = sessionIdRef.current;

        // Verify an existing session is still alive before reusing it.
        if (sessionId) {
          const alive = await api.pingMongoShell(sessionId).catch(() => false);
          if (!alive) sessionId = null;
        }

        if (abort.signal.aborted) return;

        // Spawn a fresh mongosh process if no viable session exists.
        if (!sessionId) {
          const result = await api.startMongoShell(connectionId, term.cols, term.rows);
          sessionId = result.sessionId;
          sessionIdRef.current = sessionId;
          updateTabShellSessionId(tab.id, sessionId);
        } else {
          sessionIdRef.current = sessionId;
        }

        // If the component unmounted while we were waiting for the shell to
        // start, stop the PTY we just created so it doesn't leak.
        if (abort.signal.aborted) {
          api.stopMongoShell(sessionId).catch(() => {});
          return;
        }

        // Warn if no PTY output arrives within 15 seconds.
        const outputTimeout = setTimeout(() => {
          term.write(
            '\r\n\x1b[33m[No output from mongosh for 15s. Check that mongosh is installed and the connection details are correct.]\x1b[0m\r\n',
          );
        }, 15000);

        // Open the SSE stream for PTY output.
        const streamUrl = api.getShellStreamUrl(connectionId, sessionId);
        const es = new EventSource(streamUrl);

        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'output') {
              clearTimeout(outputTimeout);
              term.write(payload.data);
            } else if (payload.type === 'exit') {
              clearTimeout(outputTimeout);
              term.write(`\r\n\x1b[31m[mongosh exited (code: ${payload.code ?? '?'})]\x1b[0m\r\n`);
              es.close();
            }
          } catch {
            // Ignore malformed SSE data
          }
        };

        // On cleanup (StrictMode unmount / dependency change): close SSE
        // and clear the no-output timer so re-mount starts fresh.
        abort.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(outputTimeout);
            es.close();
          },
          { once: true },
        );
      } catch (err) {
        if (!abort.signal.aborted) {
          term.write(`\r\n\x1b[31mFailed to start mongosh: ${safeErrorMessage(err, String(err))}\x1b[0m\r\n`);
        }
      }
    })();

    return () => {
      // Tear down everything — StrictMode double-invoke means this runs
      // once (disposing the first instance) before the second mount's
      // effect fires with a clean slate.
      abort.abort();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [connectionString, connectionId, tab.id, handleData, handleResize]);

  return (
    <div className="h-full w-full overflow-hidden bg-black">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
}
