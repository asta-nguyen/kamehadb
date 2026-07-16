import { setApiBase } from '@/lib/api-client';
import { invokeTauri, isTauriRuntime } from '@/lib/tauri';
import { useEffect, useState } from 'react';

interface SidecarInfo {
  port: number;
  pid: number;
}

async function waitForSidecar(port: number, maxAttempts = 30): Promise<boolean> {
  const url = `http://127.0.0.1:${port}/health`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Sidecar not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export function useSidecar() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) {
      // Dev mode (Vite without Tauri) — sidecar is started manually via pnpm dev
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Ask Rust to start sidecar (it may already be auto-started from setup hook)
        const info = await invokeTauri<SidecarInfo>('start_sidecar');
        if (cancelled) return;

        // Update API base to the actual port
        setApiBase(info.port);

        // Wait for sidecar to be ready
        const ok = await waitForSidecar(info.port);
        if (cancelled) return;

        if (ok) {
          setReady(true);
        } else {
          setError('Sidecar started but health check failed');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}
