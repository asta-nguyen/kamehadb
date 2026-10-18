import { api } from '@/lib/api';
import { useGUIRequests } from './use-gui-requests';
import { SQL_RESULT_GC_TIME_MS } from '@/lib/constants';
import type { QueryResult, RunQueryInput } from '@kamehadb/shared';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

// Commands that definitely don't modify data — skip metadata invalidation for these.
// WITH and EXPLAIN are excluded because they can precede write CTEs / DML.
const READONLY_COMMANDS = new Set(['SELECT', 'SHOW', 'DESCRIBE']);

function isReadOnlyQuery(sql: string): boolean {
  const trimmed = sql.trimStart();
  const firstWord = trimmed.length > 0 ? trimmed.split(/[\s(]/)[0].toUpperCase() : '';
  return READONLY_COMMANDS.has(firstWord);
}

type RunQueryMutation = UseMutationResult<QueryResult, Error, RunQueryInput> & { cancel: () => void };

export function useRunQuery(connectionId: string | null): RunQueryMutation {
  const queryClient = useQueryClient();
  const requests = useGUIRequests(connectionId);
  const mutation = useMutation({
    retry: false,
    // TanStack keeps active/pending mutations; collect settled results once unobserved.
    gcTime: SQL_RESULT_GC_TIME_MS,
    mutationFn: async ({ query, params }: RunQueryInput): Promise<QueryResult> => {
      if (!connectionId) throw new Error('No active connection');
      return requests.run((signal) => api.runQuery(connectionId, query, params, signal));
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
  return { ...mutation, cancel: requests.cancel };
}
