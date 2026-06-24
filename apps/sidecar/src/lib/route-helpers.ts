import type { Context } from 'hono';
import * as metadataStore from '../db/metadata-store.js';
import type { ConnectionProfile, DbKind } from '@kamehadb/shared';

/**
 * Shared error handler for route handlers. Logs the error with a context
 * prefix and returns a JSON error response with the appropriate status code.
 *
 * If the error has a `statusCode` property (set via `Object.assign`), it is
 * used as the HTTP status; otherwise 500 is assumed.
 */
export function handleError(c: Context, err: unknown, context: string): Response {
  const statusCode = err && typeof err === 'object' && 'statusCode' in err ? (err as any).statusCode : 500;
  const message = err instanceof Error ? err.message : 'An internal error occurred';
  console.error(`[${context}]`, err instanceof Error ? err.stack || err.message : err);
  return c.json({ error: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message }, statusCode);
}

/**
 * Shared adapter resolver for kind-specific route files. Looks up the
 * connection profile, validates that it matches the expected `kind`, and
 * invokes the provided factory function to create the adapter.
 *
 * Throws an error with `statusCode: 404` if the profile is not found, or
 * `statusCode: 400` if the profile kind doesn't match.
 */
export async function getKindAdapter<T>(
  connectionId: string,
  expectedKind: DbKind,
  factory: (profile: ConnectionProfile) => T,
  label: string,
): Promise<T> {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) {
    throw Object.assign(new Error('Connection not found'), { statusCode: 404 });
  }
  if (profile.kind !== expectedKind) {
    throw Object.assign(new Error(`This endpoint is for ${label} connections only`), { statusCode: 400 });
  }
  return factory(profile);
}
