import { useCallback, useEffect, useMemo } from 'react';
import { requestAbortError } from '@/lib/gui-request';

type GUIRequests = {
  run: <T>(invoke: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  cancel: () => void;
  isCurrent: () => boolean;
};

// Mutations have no TanStack AbortSignal. Give each mounted context its own
// controllers so cleanup cannot cancel another tab or admit queued old work.
export function useGUIRequests(scope: string | null): GUIRequests {
  const owner = useMemo(() => ({ active: true, controllers: new Set<AbortController>() }), [scope]);
  const cancel = useCallback((): void => {
    for (const controller of owner.controllers) controller.abort();
  }, [owner]);
  useEffect(() => {
    owner.active = true;
    return () => {
      owner.active = false;
      cancel();
    };
  }, [owner, cancel]);
  const run = useCallback(
    async <T>(invoke: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      if (!owner.active) throw requestAbortError();
      const controller = new AbortController();
      owner.controllers.add(controller);
      try {
        const result = await invoke(controller.signal);
        if (!owner.active || controller.signal.aborted) throw requestAbortError();
        return result;
      } finally {
        owner.controllers.delete(controller);
      }
    },
    [owner],
  );
  const isCurrent = useCallback((): boolean => owner.active, [owner]);
  return { run, cancel, isCurrent };
}
