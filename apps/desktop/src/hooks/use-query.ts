import { api } from '@/lib/api';
import type { QueryResult } from '@kamehadb/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Commands that definitely don't modify data — skip metadata invalidation for these.
// WITH and EXPLAIN are excluded because they can precede write CTEs / DML.
const READONLY_COMMANDS = new Set(['SELECT', 'SHOW', 'DESCRIBE']);

function isReadOnlyQuery(sql: string): boolean {
  const trimmed = sql.trimStart();
  const firstWord = trimmed.length > 0 ? trimmed.split(/[\s(]/)[0].toUpperCase() : '';
  return READONLY_COMMANDS.has(firstWord);
}

export function useRunQuery(connectionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ query, params }: { query: string; params?: unknown[] }): Promise<QueryResult> => {
      if (!connectionId) throw new Error('No active connection');
      return api.request<QueryResult>('POST', `/sql/${connectionId}/query`, { query, params });
    },
    onSuccess: (_data, variables) => {
      // Read-only queries (SELECT, WITH, etc.) don't change schema — skip invalidating metadata
      if (isReadOnlyQuery(variables.query)) return;

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.includes(connectionId) &&
            (key[0] === 'schema' ||
              key[0] === 'tables' ||
              key[0] === 'columns' ||
              key[0] === 'indexes' ||
              key[0] === 'preview' ||
              key[0] === 'databases' ||
              key[0] === 'schemas' ||
              key[0] === 'autocomplete')
          );
        },
      });
    },
  });
}
