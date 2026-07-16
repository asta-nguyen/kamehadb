import { api } from '@/lib/api';
import { SCHEMA_CACHE_TIME } from '@/lib/constants';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useSchemaChangelog(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMA_CHANGELOG(connectionId),
    queryFn: () => api.getSchemaChangelog(connectionId!),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useSchemaSnapshots(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMA_SNAPSHOTS(connectionId),
    queryFn: () => api.getSchemaSnapshots(connectionId!),
    enabled: !!connectionId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useSchemaDiff(connectionId: string | null, input: import('@kamehadb/shared').SchemaDiffInput | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMA_DIFF(connectionId, input),
    queryFn: () => api.getSchemaDiff(connectionId!, input!),
    enabled: !!connectionId && !!input && input.fromSnapshotId !== input.toSnapshotId,
    staleTime: SCHEMA_CACHE_TIME,
  });
}

export function useCaptureSchemaSnapshot() {
  return useMutation({
    mutationFn: (connectionId: string) => api.captureSchemaSnapshot(connectionId),
  });
}

export function useSchemaWatcherStatus(connectionId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMA_WATCHER(connectionId),
    queryFn: () => api.getSchemaWatcherStatus(connectionId!),
    enabled: !!connectionId,
    // Poll every 10s to pick up auto-capture timestamps and status changes.
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useStartSchemaWatcher() {
  return useMutation({
    mutationFn: ({ connectionId, intervalMs }: { connectionId: string; intervalMs?: number }) =>
      api.startSchemaWatcher(connectionId, intervalMs),
  });
}

export function useStopSchemaWatcher() {
  return useMutation({
    mutationFn: (connectionId: string) => api.stopSchemaWatcher(connectionId),
  });
}

export function useStartSchemaNotifyWatcher() {
  return useMutation({
    mutationFn: (connectionId: string) => api.startSchemaNotifyWatcher(connectionId),
  });
}

export function useStopSchemaNotifyWatcher() {
  return useMutation({
    mutationFn: (connectionId: string) => api.stopSchemaNotifyWatcher(connectionId),
  });
}
