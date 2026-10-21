/**
 * Safely extract a message from an unknown error value.
 * Returns the fallback string when the error is not an Error instance.
 */
export function safeErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim().length > 0) return err;
  return fallback;
}
