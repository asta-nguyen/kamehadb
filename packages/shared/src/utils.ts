/**
 * Safely extract a message from an unknown error value.
 * Returns the fallback string when the error is not an Error instance.
 */
export function safeErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  return err instanceof Error ? err.message : fallback;
}
