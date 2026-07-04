import { log } from '../lib/logger.js';
import { quoteSqlIdentifier as sharedQuoteSqlIdentifier, safeErrorMessage } from '@kamehadb/shared';
import type { ConnectionProfile } from '@kamehadb/shared';
import * as metadataStore from '../db/metadata-store.js';

/**
 * Create an HTTP error with a statusCode for the Hono error handler chain.
 * The statusCode is extracted by handleError() to return appropriate HTTP status.
 */
export function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Unify error handling across all route files.
 *
 * Extracts statusCode from error objects (where applicable), logs the error
 * with pino, and returns a structured JSON error response.
 *
 * - 4xx status codes → { error: 'BAD_REQUEST', message }
 * - 5xx status codes → { error: 'INTERNAL_ERROR', message }
 */
export function handleError(c: any, err: unknown, context: string) {
  const statusCode =
    typeof err === 'object' && err && 'statusCode' in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500;
  const message = safeErrorMessage(err, 'An internal error occurred');
  log.error({ err }, `${context}`);
  return c.json({ error: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message }, statusCode);
}

/**
 * Quote a SQL identifier (column name, table name) with double quotes,
 * escaping any embedded double quotes by doubling them.
 *
 * Throws with a 400 status code if the identifier is empty or whitespace-only.
 */
export function quoteSqlIdentifier(identifier: string): string {
  if (!identifier.trim()) {
    throw httpError('SQL identifier cannot be empty', 400);
  }
  return sharedQuoteSqlIdentifier(identifier);
}

/**
 * Load a non-SQL adapter from a connection profile, validating that the
 * connection exists and its kind matches the expected type.
 *
 * Throws httpError with 404 for missing connections and 400 for kind
 * mismatches, so the error flows through handleError() with proper status
 * codes instead of generic 500s.
 */
export async function getNonSqlAdapter<T>(
  connectionId: string,
  expectedKind: ConnectionProfile['kind'],
  factory: (profile: ConnectionProfile) => Promise<T> | T,
): Promise<T> {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw httpError('Connection not found', 404);
  if (profile.kind !== expectedKind) {
    throw httpError(`This endpoint is for ${expectedKind} connections only`, 400);
  }
  return factory(profile);
}

/**
 * Wrap an adapter lifecycle: load the adapter, run the callback, and always
 * close the adapter in a finally block (swallowing close errors so they never
 * mask the original result or error).
 *
 * Used by non-SQL route files (mongo, redis, qdrant, tigerbeetle) to eliminate
 * the repeated getAdapter + try/finally + adapter.close() boilerplate.
 */
export async function withAdapter<TAdapter extends { close(): Promise<unknown> }, T>(
  loadAdapter: (connectionId: string) => Promise<TAdapter>,
  connectionId: string,
  fn: (adapter: TAdapter) => Promise<T>,
): Promise<T> {
  const adapter = await loadAdapter(connectionId);
  try {
    return await fn(adapter);
  } finally {
    await adapter.close().catch((err) => {
      log.warn({ err }, 'Adapter close failed');
    });
  }
}
