import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ConnectionProfile, CreateConnectionProfileInput, UpdateConnectionProfileInput } from '@kamehadb/shared';

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: api.listConnections,
  });
}

export function useConnection(id: string | null) {
  return useQuery({
    queryKey: ['connection', id],
    queryFn: () => api.getConnection(id!),
    enabled: !!id,
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectionProfileInput) => api.createConnection(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConnectionProfileInput }) => api.updateConnection(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (input: CreateConnectionProfileInput) => api.testConnection(input),
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
      const name = (qc.getQueryData<ConnectionProfile[]>(['connections']) ?? []).find((c) => c.id === id)?.name ?? id;
      return { toastId: toast.loading(`Reloading "${name}"...`) };
    },
    onSuccess: ({ id, result }, _vars, context) => {
      // Invalidate every connection-scoped cache entry so any future mount
      // fetches fresh data, and force-refetch the ones backing currently
      // visible views so the user sees new tables/collections/keys right
      // away without having to collapse-and-reopen the tree.
      const keysToInvalidate = [
        ['connection', id],
        ['databases', id],
        ['schemas', id],
        ['tables', id],
        ['columns', id],
        ['indexes', id],
        ['preview', id],
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
      ];
      qc.invalidateQueries({ queryKey: keysToInvalidate });
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
    onError: (err, _vars, context) => {
      if (context?.toastId !== undefined) {
        toast.error(err instanceof Error ? err.message : 'Reload failed', { id: context.toastId });
      }
    },
  });
}
