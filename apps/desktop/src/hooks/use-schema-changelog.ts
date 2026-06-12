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

export function useCaptureSchemaSnapshot() {
  return useMutation({
    mutationFn: (connectionId: string) => api.captureSchemaSnapshot(connectionId),
  });
}
