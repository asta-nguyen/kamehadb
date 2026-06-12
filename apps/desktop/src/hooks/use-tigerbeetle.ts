import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateTigerBeetleAccountInput, CreateTigerBeetleTransferInput } from '@kamehadb/shared';

export function useTbAccounts(connectionId: string | null, limit?: number) {
  return useQuery({
    queryKey: ['tigerbeetle', connectionId, 'accounts', limit],
    queryFn: () => api.tbListAccounts(connectionId!, limit),
    enabled: !!connectionId,
  });
}

export function useTbAccount(connectionId: string | null, id: string | null) {
  return useQuery({
    queryKey: ['tigerbeetle', connectionId, 'account', id],
    queryFn: () => api.tbLookupAccount(connectionId!, id!),
    enabled: !!connectionId && !!id,
  });
}

export function useTbTransfers(connectionId: string | null, accountId: string | null) {
  return useQuery({
    queryKey: ['tigerbeetle', connectionId, 'transfers', accountId],
    queryFn: () => api.tbGetTransfers(connectionId!, accountId!),
    enabled: !!connectionId && !!accountId,
  });
}

export function useTbBalances(connectionId: string | null, accountId: string | null) {
  return useQuery({
    queryKey: ['tigerbeetle', connectionId, 'balances', accountId],
    queryFn: () => api.tbGetBalances(connectionId!, accountId!),
    enabled: !!connectionId && !!accountId,
  });
}

export function useTbCreateAccounts(connectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accounts: CreateTigerBeetleAccountInput[]) => api.tbCreateAccounts(connectionId, accounts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tigerbeetle', connectionId, 'accounts'] });
    },
  });
}

export function useTbCreateTransfers(connectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transfers: CreateTigerBeetleTransferInput[]) => api.tbCreateTransfers(connectionId, transfers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tigerbeetle', connectionId, 'transfers'] });
      queryClient.invalidateQueries({ queryKey: ['tigerbeetle', connectionId, 'balances'] });
    },
  });
}
