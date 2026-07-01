import { useMutation, useQuery } from '@tanstack/react-query';

export function createVecHooks<TInput, TSampleInput, TSampleQueryInput, TCapabilities, TSearchResult>(config: {
  readonly capabilitiesKey: (id: string | null) => readonly unknown[];
  readonly capabilitiesFn: (id: string) => Promise<TCapabilities>;
  readonly searchFn: (id: string, input: TInput) => Promise<TSearchResult>;
  readonly sampleFn: (id: string, input: TSampleInput) => Promise<unknown>;
  readonly sampleQueryKey: (id: string | null, input: TSampleQueryInput | null) => readonly unknown[];
  readonly sampleQueryFn: (id: string, input: TSampleQueryInput) => Promise<unknown>;
}) {
  function useCapabilities(connectionId: string | null) {
    return useQuery({
      queryKey: config.capabilitiesKey(connectionId),
      queryFn: () => config.capabilitiesFn(connectionId!),
      enabled: !!connectionId,
      staleTime: 30_000,
      retry: 1,
    });
  }

  function useSearch(connectionId: string | null) {
    return useMutation({
      mutationFn: (input: TInput) => {
        if (!connectionId) return Promise.reject(new Error('No connectionId'));
        return config.searchFn(connectionId, input);
      },
    });
  }

  function useSampleMutation(connectionId: string | null) {
    return useMutation({
      mutationFn: (input: TSampleInput) => {
        if (!connectionId) return Promise.reject(new Error('No connectionId'));
        return config.sampleFn(connectionId, input);
      },
    });
  }

  function useSampleQuery(connectionId: string | null, input: TSampleQueryInput | null) {
    return useQuery({
      queryKey: config.sampleQueryKey(connectionId, input),
      queryFn: () => {
        if (!connectionId || !input) throw new Error('Missing sample input');
        return config.sampleQueryFn(connectionId, input);
      },
      enabled: !!connectionId && !!input,
      staleTime: 30_000,
      retry: 1,
    });
  }

  return { useCapabilities, useSearch, useSampleMutation, useSampleQuery };
}
