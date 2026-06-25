import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.onError) {
        (query.meta.onError as (error: Error, id: string) => void)(error as Error, query.queryKey[1] as string);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _data, _variables, _context, mutation) => {
      if (mutation.meta?.onError) {
        (mutation.meta.onError as (error: Error) => void)(error as Error);
      }
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
