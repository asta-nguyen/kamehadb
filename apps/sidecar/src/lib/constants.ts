/** LRUCache max entries for schema/metadata caching. */
export const CACHE_MAX_ENTRIES = 100;

/** Mongo shell session timeout (30 minutes). */
export const SHELL_TIMEOUT_MS = 30 * 60 * 1000;

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
