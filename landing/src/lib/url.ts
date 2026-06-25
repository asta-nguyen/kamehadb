import { headers } from 'next/headers';

/**
 * Resolve the base URL from the incoming request headers.
 * Works correctly across local dev, preview deployments, and production.
 * Falls back to the production URL when headers are unavailable (build time).
 */
export async function getBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const protocol = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('host') ?? 'kamehadb.astalife.co';
    return `${protocol}://${host}`;
  } catch {
    // headers() throws during static generation; fall back to production URL
    return 'https://kamehadb.astalife.co';
  }
}
