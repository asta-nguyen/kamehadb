import { headers } from 'next/headers';

const PRODUCTION_URL = 'https://kamehadb.astalife.co';

const ALLOWED_HOSTS = new Set(['kamehadb.astalife.co', 'www.kamehadb.astalife.co', 'localhost:3000', '127.0.0.1:3000']);

/**
 * Resolve the base URL from the incoming request headers.
 * The Host header is validated against an allowlist to prevent
 * canonical/OpenGraph URL poisoning from crafted requests.
 * Falls back to the production URL when headers are unavailable (build time)
 * or the host is not recognized.
 */
export async function getBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('host');
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return PRODUCTION_URL;
    }
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const protocol = proto.split(',')[0].trim();
    return `${protocol}://${host}`;
  } catch {
    // headers() throws during static generation; fall back to production URL
    return PRODUCTION_URL;
  }
}
