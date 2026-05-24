import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateConnectionProfileInput, UpdateConnectionProfileInput } from "@kamehadb/shared";

export function useConnections() {
  return useQuery({
    queryKey: ["connections"],
    queryFn: api.listConnections,
  });
}

export function useConnection(id: string | null) {
  return useQuery({
    queryKey: ["connection", id],
    queryFn: () => api.getConnection(id!),
    enabled: !!id,
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectionProfileInput) => api.createConnection(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConnectionProfileInput }) =>
      api.updateConnection(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (input: CreateConnectionProfileInput) => api.testConnection(input),
  });
}
