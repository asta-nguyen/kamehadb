/** LRUCache max entries for schema/metadata caching. */
export const CACHE_MAX_ENTRIES = 100;

/** LRU cache TTL for AI settings (5 minutes). */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** Mongo shell session timeout (30 minutes). */
export const SHELL_TIMEOUT_MS = 30 * 60 * 1000;

/** Interval for cleaning up expired shell sessions (1 minute). */
export const SHELL_CLEANUP_INTERVAL = 60 * 1000;

/** Connection test timeout per check (5 seconds). */
export const CONNECTION_TEST_TIMEOUT_MS = 5_000;

/** Connection timeouts for database adapters (milliseconds). */
export const ADAPTER_TIMEOUTS = {
  CONNECT_SHORT: 3_000,
  CONNECT_DEFAULT: 5_000,
  CONNECT_LONG: 10_000,
  IDLE: 30_000,
  REQUEST: 30_000,
  BUSY: 5_000,
} as const;

/** TigerBeetle "created" status code (0xFFFF_FFFF as u32). */
export const TB_CREATED = 4294967295;

/** Regex for parsing safe SQL filter clauses. */
export const CLAUSE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|<>|>=|<=|>|<|ILIKE|LIKE|IS NULL|IS NOT NULL)\s*(.*)$/i;
export const NUMERIC_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Column fields tracked for schema diff. */
export const COLUMN_FIELDS = ['type', 'nullable', 'default', 'primaryKey'] as const;
export const INDEX_FIELDS = ['columns', 'unique', 'primary'] as const;

/** File database related suffixes. */
export const SQLITE_RELATED_SUFFIXES = ['-wal', '-shm'] as const;
export const DUCKDB_RELATED_SUFFIXES = ['.wal'] as const;

/** Default AI provider. */
export const DEFAULT_AI_PROVIDER = 'openai';
