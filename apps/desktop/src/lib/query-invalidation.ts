import { QUERY_KEYS } from '@/lib/query-keys';
import type { QueryClient } from '@tanstack/react-query';

function queryKeyIncludesConnectionId(queryKey: readonly unknown[], connectionId: string): boolean {
  return queryKey.some((part) => typeof part === 'string' && part === connectionId);
}

export function invalidateConnectionQueries(queryClient: QueryClient, connectionId: string): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS }),
    queryClient.invalidateQueries({
      predicate: (query) => queryKeyIncludesConnectionId(query.queryKey, connectionId),
    }),
  ]).then(() => undefined);
}
