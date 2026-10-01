import { getApiHeaders, setApiBase } from '@/lib/api-client';
import { invokeTauri, isTauriRuntime, listenTauri } from '@/lib/tauri';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface SidecarInfo {
  port: number;
  pid: number;
  token: string;
}

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
    const readyTasks = new Map<number, Promise<void>>();

    const handleReady = (info: SidecarInfo): Promise<void> => {
      const previous = readyTasks.get(info.pid);
      if (previous) return previous;
      const task = (async () => {
        if (cancelled) return;
        setReady(false);
        setApiBase(info.port, info.token);
        const ok = await waitForSidecar(info.port);
        if (cancelled) return;
        if (!ok) {
          setError('Sidecar started but health check failed');
          return;
        }
        if (cancelled) return;
        setError(null);
        setReady(true);
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MCP_ACCOUNTS });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MCP_SETTINGS });
      })();
      readyTasks.set(info.pid, task);
      return task;
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
        // Ask Rust to start sidecar (it may already be auto-started from setup hook)
        const info = await invokeTauri<SidecarInfo>('start_sidecar');
        if (cancelled) return;
        await handleReady(info);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queryClient]);

  return { ready, error };
}
