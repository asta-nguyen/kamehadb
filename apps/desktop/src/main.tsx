import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_STALE_TIME, SCHEMA_CACHE_TIME } from '@/lib/constants';
import App from './App';
import { ErrorBoundary } from './components/error-boundary';
import './index.css';

interface QueryErrorMeta {
  readonly onError?: (error: Error, id?: string) => void;
}

interface MutationErrorMeta {
  readonly onError?: (error: Error) => void;
}

// Normalize unknown throw values so the global cache handlers never explode on
// non-Error payloads while trying to report the original failure.
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const onError = (query.meta as QueryErrorMeta | undefined)?.onError;
      if (typeof onError === 'function') {
        const queryId = typeof query.queryKey[1] === 'string' ? query.queryKey[1] : undefined;
        onError(toError(error), queryId);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _data, _variables, _context, mutation) => {
      const onError = (mutation.meta as MutationErrorMeta | undefined)?.onError;
      if (typeof onError === 'function') {
        onError(toError(error));
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      gcTime: SCHEMA_CACHE_TIME,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
