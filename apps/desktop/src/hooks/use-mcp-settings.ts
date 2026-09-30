import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { toastError, toastSuccess } from '@/lib/toast';
import { safeErrorMessage } from '@kamehadb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Read the current MCP listener settings (status, port, token, enabled profiles).
export function useMcpSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.MCP_SETTINGS,
    queryFn: api.getMcpSettings,
  });
}

export function useUpdateMcpPort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (port: number) => api.updateMcpPort(port),
    onSuccess: (settings) => {
      queryClient.setQueryData(QUERY_KEYS.MCP_SETTINGS, settings);
      toastSuccess('MCP port saved');
    },
    onError: (err) => toastError(safeErrorMessage(err, 'Failed to save MCP port')),
  });
}

export function useRetryMcpListener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.retryMcpListener,
    onSuccess: (settings) => {
      queryClient.setQueryData(QUERY_KEYS.MCP_SETTINGS, settings);
      if (settings.status === 'listening') toastSuccess('MCP listener is running');
      else toastError(settings.message ?? 'MCP listener is still unavailable');
    },
    onError: (err) => toastError(safeErrorMessage(err, 'Failed to retry MCP listener')),
  });
}

export function useRotateMcpToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.rotateMcpToken,
    onSuccess: (settings) => {
      queryClient.setQueryData(QUERY_KEYS.MCP_SETTINGS, settings);
      toastSuccess('MCP token rotated; update your client configs');
    },
    onError: (err) => toastError(safeErrorMessage(err, 'Failed to rotate MCP token')),
  });
}

export function useSetConnectionMcpEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.setConnectionMcpEnabled(id, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MCP_SETTINGS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONNECTIONS });
    },
    onError: (err) => toastError(safeErrorMessage(err, 'Failed to update MCP access')),
  });
}
