import { getApiHeaders, setApiBase } from '@/lib/api-client';
import { invokeTauri, isTauriRuntime, listenTauri } from '@/lib/tauri';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

type SidecarInfo = {
  port: number;
  pid: number;
  token: string;
};

async function waitForSidecar(port: number, maxAttempts = 30): Promise<boolean> {
  const url = `http://127.0.0.1:${port}/health`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { headers: getApiHeaders() });
      if (res.ok) return true;
    } catch {
      // Sidecar not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export function useSidecar() {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      // Dev mode (Vite without Tauri) — sidecar is started manually via pnpm dev
      setReady(true);
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let sidecarCheck: Promise<void> | undefined;
    let activeGeneration: string | undefined;
    let latestGeneration: string | undefined;
    const readyTasks = new Map<string, Promise<void>>();

    const handleReady = (info: SidecarInfo): Promise<void> => {
      if (cancelled) return Promise.resolve();
      const generation = `${info.pid}:${info.port}`;
      const previous = readyTasks.get(generation);
      if (previous) return previous;
      latestGeneration = generation;
      if (activeGeneration !== generation) setReady(false);
      const task = (async () => {
        try {
          if (cancelled) return;
          setApiBase(info.port, info.token);
          const ok = await waitForSidecar(info.port);
          if (cancelled || latestGeneration !== generation) return;
          if (!ok) {
            setReady(false);
            setError('Sidecar started but health check failed');
            return;
          }
          const newGeneration = activeGeneration !== generation;
          const replacedProcess = activeGeneration !== undefined && newGeneration;
          activeGeneration = generation;
          setError(null);
          setReady(true);
          if (replacedProcess) {
            // The new sidecar has fresh in-memory caches, so workspace queries need to reload.
            void queryClient.invalidateQueries();
          }
          if (newGeneration) {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MCP_ACCOUNTS });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MCP_SETTINGS });
          }
        } finally {
          // Keep only in-flight checks so a later wake can probe the same process again.
          readyTasks.delete(generation);
        }
      })();
      readyTasks.set(generation, task);
      return task;
    };

    // Focus and connectivity events can arrive together; one native check handles both.
    const checkSidecar = (): Promise<void> => {
      if (sidecarCheck) return sidecarCheck;

      const task = (async () => {
        try {
          const info = await invokeTauri<SidecarInfo>('start_sidecar');
          if (cancelled) return;
          await handleReady(info);
        } catch (e) {
          if (cancelled) return;
          setReady(false);
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          sidecarCheck = undefined;
        }
      })();
      sidecarCheck = task;
      return task;
    };

    // macOS may leave the window alive after its sidecar child exits during sleep.
    // The native start command detects that stale child and starts a replacement.
    const checkAfterResume = () => {
      void checkSidecar();
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkAfterResume();
    };

    (async () => {
      try {
        unlisten = await listenTauri<SidecarInfo>('sidecar-ready', (info) => {
          void handleReady(info);
        });
        if (cancelled) {
          unlisten();
          return;
        }
        window.addEventListener('focus', checkAfterResume);
        window.addEventListener('online', checkAfterResume);
        document.addEventListener('visibilitychange', checkWhenVisible);
        // Rust reuses the live child and restarts it if the previous process exited.
        await checkSidecar();
      } catch (e) {
        if (cancelled) return;
        setReady(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener('focus', checkAfterResume);
      window.removeEventListener('online', checkAfterResume);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [queryClient]);

  return { ready, error };
}
