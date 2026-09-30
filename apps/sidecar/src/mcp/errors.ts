import { McpTimeoutUnavailableError, QueryTimeoutError } from './types.js';
import { MCP_QUERY_TIMEOUT_MS } from '../lib/constants.js';

/** Stable tool error codes shared with clients and tests. */
export const MCP_ERROR_CODE = {
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  PROFILE_NOT_ENABLED: 'PROFILE_NOT_ENABLED',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  MANAGED_ACCOUNT_NOT_READY: 'MANAGED_ACCOUNT_NOT_READY',
  MANAGED_CREDENTIAL_UNAVAILABLE: 'MANAGED_CREDENTIAL_UNAVAILABLE',
  MANAGED_ACCOUNT_EXISTS: 'MANAGED_ACCOUNT_EXISTS',
  PROVISIONING_FAILED: 'PROVISIONING_FAILED',
  REVOKE_FAILED: 'REVOKE_FAILED',
  READ_ONLY_QUERY_REQUIRED: 'READ_ONLY_QUERY_REQUIRED',
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  TIMEOUT_UNAVAILABLE: 'TIMEOUT_UNAVAILABLE',
  BUSY: 'BUSY',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type McpErrorCode = (typeof MCP_ERROR_CODE)[keyof typeof MCP_ERROR_CODE];

/** Error carrying a stable MCP code. Messages must never include tokens or credentials. */
export class McpToolError extends Error {
  readonly code: McpErrorCode;

  constructor(code: McpErrorCode, message: string) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
  }
}

// Strip credential-bearing substrings from driver errors before they reach a
// client: userinfo in URLs (scheme://user:pass@host) and password key-values.
function redactCredentials(message: string): string {
  return message
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, '$1***@')
    .replace(/(password|pwd|passwd)\s*[=:]\s*\S+/gi, '$1=***');
}

// Drivers expose native timeout failures with engine-specific codes.
function isNativeTimeoutError(err: Error): boolean {
  const details = err as Error & {
    code?: unknown;
    errno?: unknown;
    codeName?: unknown;
  };
  return (
    details.code === '57014' ||
    details.code === 'ER_QUERY_TIMEOUT' ||
    details.code === 'ER_STATEMENT_TIMEOUT' ||
    details.errno === 3024 ||
    details.errno === 1969 ||
    details.code === 'ETIMEOUT' ||
    details.code === 50 ||
    details.codeName === 'MaxTimeMSExpired'
  );
}

// Map reader/driver failures to the stable error contract without leaking
// credentials. Unknown errors become DATABASE_ERROR with a redacted message.
export function toMcpToolError(err: unknown): McpToolError {
  if (err instanceof McpToolError) return err;
  if (err instanceof McpTimeoutUnavailableError) {
    return new McpToolError(MCP_ERROR_CODE.TIMEOUT_UNAVAILABLE, err.message);
  }
  if (err instanceof Error) {
    if (err instanceof QueryTimeoutError || isNativeTimeoutError(err)) {
      const timeoutSeconds = MCP_QUERY_TIMEOUT_MS / 1000;
      return new McpToolError(
        MCP_ERROR_CODE.QUERY_TIMEOUT,
        `Query exceeded the ${timeoutSeconds}-second MCP time budget`,
      );
    }
    return new McpToolError(MCP_ERROR_CODE.DATABASE_ERROR, redactCredentials(err.message));
  }
  return new McpToolError(MCP_ERROR_CODE.DATABASE_ERROR, 'Database operation failed');
}

/** Render a tool error as a stable single-line `CODE: message` string. */
export function formatToolError(err: McpToolError): string {
  return `${err.code}: ${err.message}`;
}
