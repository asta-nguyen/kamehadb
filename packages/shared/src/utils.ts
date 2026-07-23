/**
 * Safely extract a message from an unknown error value.
 * Returns the fallback string when the error is not an Error instance.
 */
export function safeErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Hash-based local embedding for fallback when no embedding API is available.
 * Normalizes to a unit vector. Not a real semantic embedding.
 *
 * Tokenization preserves Unicode letters and numbers (\\p{L}\\p{N}) so that
 * non-ASCII text still yields tokens instead of an all-zero vector. The
 * `[^a-z0-9]+` split pattern is a subset for ASCII-only input, so ASCII
 * queries produce identical tokens/hashes to the previous implementation —
 * only non-ASCII input changes behavior (from degenerate to functional).
 *
 * When no tokens can be extracted (e.g. purely symbolic/punctuation input),
 * a defined unit vector along the first axis is returned so cosine-based
 * search does not degenerate against an all-zero vector.
 */
export function localEmbedding(text: string, dimensions = 256): number[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const vec = new Array(dimensions).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0;
    }
    const idx = ((hash % dimensions) + dimensions) % dimensions;
    vec[idx] += 1;
  }
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (mag === 0) {
    // No tokens extracted: return a defined unit vector instead of all zeros
    // so the documented unit-vector contract holds and cosine search stays
    // non-degenerate.
    const fallback = new Array(dimensions).fill(0);
    fallback[0] = 1;
    return fallback;
  }
  return vec.map((v) => v / mag);
}
