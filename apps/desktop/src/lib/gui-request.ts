import { CancelRequest } from '../../wailsjs/go/api/SqlService';

export function requestAbortError(): DOMException {
  return new DOMException(
    'Request cancelled; a command may already have executed. Cancellation is not rollback.',
    'AbortError',
  );
}

// Keep IDs at the binding boundary, not in cache keys. A native call is not
// replayed, and a late result cannot become the response of an aborted view.
export async function runGUIRequest<T>(
  invoke: (requestId: string) => Promise<T>,
  signal?: AbortSignal,
  suppliedId?: string,
): Promise<T> {
  if (signal?.aborted) throw requestAbortError();
  const requestId = suppliedId ?? crypto.randomUUID();
  const cancel = (): void => {
    void CancelRequest(requestId)
      .then((accepted) => {
        if (!accepted)
          console.warn('Native cancellation was not registered; the request may still be running', requestId);
      })
      .catch((error: unknown) => console.error('Native request cancellation failed', error));
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await invoke(requestId);
    if (signal?.aborted) throw requestAbortError();
    return result;
  } catch (error) {
    if (signal?.aborted) throw requestAbortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
