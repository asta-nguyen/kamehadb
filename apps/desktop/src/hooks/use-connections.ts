import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { setConnectionStatus } from '@/store';
import type {
  ConnectionProfile,
  CreateConnectionProfileInput,
  TestConnectionResult,
  UpdateConnectionProfileInput,
} from '@kamehadb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useConnections() {
  return useQuery({
    queryKey: QUERY_KEYS.CONNECTIONS,
    queryFn: api.listConnections,
  });
}

export function useConnectionHealth(connectionId: string | null) {
  return useQuery<TestConnectionResult, Error, 'connected' | 'disconnected'>({
    queryKey: QUERY_KEYS.CONNECTION_HEALTH(connectionId),
    queryFn: () => api.checkConnectionHealth(connectionId!),
    enabled: Boolean(connectionId),
    refetchInterval: 60_000,
    retry: 2,
    retryDelay: 1000,
    select: (result) => (result.success ? 'connected' : 'disconnected'),
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectionProfileInput) => api.createConnection(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConnectionProfileInput }) => api.updateConnection(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS }),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectionProfileInput) => api.testConnection(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS }),
  });
}

// Reload a connection: re-test health, then invalidate every TanStack cache
// entry scoped to that connection id. Open tabs are not touched; they refetch
// on next render.
export function useRefreshConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await api.checkConnectionHealth(id);
      return { id, result };
    },
    onMutate: (id) => {
      const name =
        (qc.getQueryData<ConnectionProfile[]>(QUERY_KEYS.CONNECTIONS) ?? []).find((c) => c.id === id)?.name ?? id;
      return { toastId: toast.loading(`Reloading "${name}"...`) };
    },
    onSuccess: ({ id, result }, _vars, context) => {
      setConnectionStatus(id, result.success ? 'connected' : 'disconnected');

      // Invalidate every connection-scoped cache entry so any future mount
      // fetches fresh data, and force-refetch the ones backing currently
      // visible views so the user sees new tables/collections/keys right
      // away without having to collapse-and-reopen the tree.
      const keysToInvalidate = [
        QUERY_KEYS.CONNECTION(id),
        QUERY_KEYS.DATABASES(id),
        QUERY_KEYS.SCHEMAS(id),
        QUERY_KEYS.TABLES(id),
        QUERY_KEYS.COLUMNS(id),
        QUERY_KEYS.INDEXES(id),
        QUERY_KEYS.PREVIEW(id),
        ['table-stats', id],
        ['index-stats', id],
        ['db-sizes', id],
        ['completions', id],
        ['active-connections', id],
        ['redis-keys', id],
        ['redis-key', id],
        ['redis-stats', id],
        ['mongo', id],
        ['mongo-stats', id],
        ['mongo-databases', id],
        ['mongo-collections', id],
        ['mongo-documents', id],
        ['qdrant-collections', id],
      ];
      keysToInvalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      // Refetch only the keys that map to currently-mounted views.
      // `type: 'active'` skips the work when no observer is mounted, so
      // future keys added to keysToInvalidate but not to this set are
      // fine — they'll just lazily refetch on next mount.
      const refetchable = new Set([
        'databases',
        'schemas',
        'tables',
        'columns',
        'mongo-databases',
        'mongo-collections',
        'mongo',
        'redis-keys',
        'redis-stats',
        'active-connections',
        'qdrant-collections',
      ]);
      void Promise.all(
        keysToInvalidate
          .filter(([prefix]) => refetchable.has(prefix))
          .map((queryKey) => qc.refetchQueries({ queryKey, type: 'active' })),
      );
      const message = result.success ? 'Reloaded' : result.message || 'Connection failed';
      const kind = result.success ? 'success' : 'error';
      if (context?.toastId !== undefined) toast[kind](message, { id: context.toastId });
    },
    onError: (err, vars, context) => {
      setConnectionStatus(vars, 'disconnected');
      if (context?.toastId !== undefined) {
        toast.error(err instanceof Error ? err.message : 'Reload failed', { id: context.toastId });
      }
    },
  });
}
