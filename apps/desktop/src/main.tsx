import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/error-boundary';
import { appendFrontendLog } from './lib/app-logs';
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
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return new Error((error as { message: string }).message);
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const normalized = toError(error);
      const onError = (query.meta as QueryErrorMeta | undefined)?.onError;
      if (typeof onError === 'function') {
        const queryId = typeof query.queryKey[1] === 'string' ? query.queryKey[1] : undefined;
        onError(normalized, queryId);
      } else {
        void appendFrontendLog({
          level: 'error',
          scope: 'tanstack-query',
          message: `Query error [${String(query.queryKey[0] ?? 'unknown')}]: ${normalized.message}`,
          stack: normalized.stack,
        });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      const normalized = toError(error);
      const onError = (mutation.meta as MutationErrorMeta | undefined)?.onError;
      if (typeof onError === 'function') {
        onError(normalized);
      } else {
        void appendFrontendLog({
          level: 'error',
          scope: 'tanstack-mutation',
          message: `Mutation error: ${normalized.message}`,
          stack: normalized.stack,
        });
      }
    },
  }),
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
