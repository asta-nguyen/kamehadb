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
