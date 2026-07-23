import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useSchemaWatcherStatus } from './use-schema-changelog';

/**
 * Detect auto-capture events by tracking lastCaptureAt changes from the
 * watcher status poll. When a new capture is detected, invalidate the
 * changelog and snapshots queries so views refresh, and show a toast.
 *
 * Shared by SchemaTimeline and SchemaDiffView to avoid duplicating the
 * ref/effect logic. The hasSeenFirstStatusRef guard skips the initial
 * status load so a spurious toast/invalidation doesn't fire on mount.
 */
export function useAutoCaptureInvalidation(connectionId: number): void {
  const queryClient = useQueryClient();
  const { data: watcherStatus } = useSchemaWatcherStatus(connectionId);
  const prevLastCaptureRef = useRef<string | null>(null);
  const hasSeenFirstStatusRef = useRef(false);
  const prevConnectionIdRef = useRef(connectionId);

  useEffect(() => {
    // Reset tracking refs when the active connection changes so stale
    // lastCaptureAt values from the previous connection don't suppress
    // or spuriously trigger invalidations for the new one.
    if (prevConnectionIdRef.current !== connectionId) {
      prevConnectionIdRef.current = connectionId;
      hasSeenFirstStatusRef.current = false;
      prevLastCaptureRef.current = null;
    }

    const currentCapture = watcherStatus?.lastCaptureAt ?? null;
    if (!hasSeenFirstStatusRef.current) {
      hasSeenFirstStatusRef.current = true;
      prevLastCaptureRef.current = currentCapture;
      return;
    }
    if (currentCapture && currentCapture !== prevLastCaptureRef.current) {
      prevLastCaptureRef.current = currentCapture;
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_CHANGELOG(connectionId) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHEMA_SNAPSHOTS(connectionId) });
      toast.success(`Auto-snapshot captured — ${new Date(currentCapture).toLocaleTimeString()}`);
    } else if (!currentCapture) {
      prevLastCaptureRef.current = null;
    }
  }, [watcherStatus?.lastCaptureAt, connectionId, queryClient]);
}
