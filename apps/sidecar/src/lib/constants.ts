/** LRUCache max entries for schema/metadata caching. */
export const CACHE_MAX_ENTRIES = 100;

/** Mongo shell session timeout (30 minutes). */
export const SHELL_TIMEOUT_MS = 30 * 60 * 1000;

/** Regex for parsing safe SQL filter clauses. */
export const CLAUSE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|<>|>=|<=|>|<|ILIKE|LIKE|IS NULL|IS NOT NULL)\s*(.*)$/i;
export const NUMERIC_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Column fields tracked for schema diff. */
export const COLUMN_FIELDS = ['type', 'nullable', 'default', 'primaryKey'] as const;
export const INDEX_FIELDS = ['columns', 'unique', 'primary'] as const;

/** File database related suffixes. */
export const SQLITE_RELATED_SUFFIXES = ['-wal', '-shm'] as const;
export const DUCKDB_RELATED_SUFFIXES = ['.wal'] as const;

/** Adapter connection/query timeouts (ms). */
export const ADAPTER_TIMEOUTS = {
  CONNECT_SHORT: 3_000,
  CONNECT_DEFAULT: 5_000,
  CONNECT_LONG: 10_000,
  IDLE: 30_000,
  BUSY: 5_000,
} as const;

/** Timeout for a single connection test probe (ms). */
export const CONNECTION_TEST_TIMEOUT_MS = 5_000;

/** Delay between connection health stream probes (ms). */
export const CONNECTION_HEALTH_INTERVAL_MS = 60_000;
/** Schema watcher defaults and limits. */
export const WATCHER_DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const WATCHER_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — prevents excessive snapshot churn
export const WATCHER_MAX_SNAPSHOTS = 50; // matches existing deleteOldSchemaSnapshots cap

/** PostgreSQL pg_notify channel name for schema-change events. */
export const SCHEMA_NOTIFY_CHANNEL = 'kamehadb_schema_change';

/** pg_notify listener reconnection backoff (ms). Linear backoff up to max. */
export const WATCHER_RECONNECT_INITIAL_MS = 5_000;
export const WATCHER_RECONNECT_MAX_MS = 60_000;
