/**
 * Execute a function with an adapter and ensure the adapter is closed afterward.
 *
 * Wraps the pervasive try { … } finally { adapter.close() } pattern that
 * appears in every route handler.  The outer try/catch for error handling
 * stays in each handler because error responses vary by route module.
 */
export async function useAdapter<T extends { close(): Promise<void> }, R>(
  adapter: T,
  fn: (a: T) => Promise<R>,
): Promise<R> {
  try {
    return await fn(adapter);
  } finally {
    // close errors are not actionable - the adapter is done being used
    await adapter.close().catch(() => {});
  }
}
