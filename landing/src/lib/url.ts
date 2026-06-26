import { headers } from 'next/headers';

/** Canonical production URL — safe to use at build time when headers() is unavailable. */
export const PRODUCTION_URL = 'https://kamehadb.astalife.co';

/** Allowed hostnames for the landing site. */
const ALLOWED_HOSTS = new Set(['kamehadb.astalife.co', 'www.kamehadb.astalife.co']);

/** Protocols we accept from the x-forwarded-proto header. */
const ALLOWED_PROTOCOLS = new Set(['http', 'https']);

/**
 * Resolve the base URL from the incoming request headers.
 * Works correctly across preview deployments and production.
 * Falls back to the production URL when headers are unavailable (build time).
 * Rejects localhost and unrecognised hosts in production to prevent open-redirect
 * or metadata poisoning via crafted Host / x-forwarded-proto headers.
 */
export async function getBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const protocol = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('host');

    // Validate protocol — only allow http/https
    if (!ALLOWED_PROTOCOLS.has(protocol)) {
      return PRODUCTION_URL;
    }

    // Validate host — reject localhost and unrecognised domains in production
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return PRODUCTION_URL;
    }

    return `${protocol}://${host}`;
  } catch {
    // headers() throws during static generation; fall back to production URL
    return PRODUCTION_URL;
  }
}
