import type { AcpAgentId } from './constants.js';

// Query result
export type QueryColumn = {
  name: string;
  type: string;
  nullable?: boolean;
};

export type QueryResult = {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  payloadBytes?: number;
  limitReason?: string;
  hasMore?: boolean;
  nextCursor?: string;
  paginationMode?: 'keyset' | 'offset';
};

// Database metadata types
export type DatabaseInfo = {
  name: string;
};

export type SchemaInfo = {
  name: string;
};

export type TableInfo = {
  id: string;
  name: string;
  schema?: string;
  type?: string;
  rowEstimate?: number;
};

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  primaryKey: boolean;
  foreignKey?: {
    schema?: string;
    table: string;
    column: string;
  };
  isVector?: boolean;
  vectorDimensions?: number;
};

export type TableCompletions = {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
};

export type IndexInfo = {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  method?: string;
};

// API input types
export type SchemaSearchMatch = {
  schema: string;
  table: string;
  column?: string;
  columnType?: string;
  matchType: 'table' | 'column';
};

export type SchemaSearchInput = {
  query: string;
  schema?: string;
  limit?: number;
};

export type PreviewRowsInput = {
  requestId?: string;
  tableId: string;
  schema?: string;
  offset?: number;
  limit?: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  searchColumn?: string;
  matchCase?: boolean;
  filters?: { column: string; operator: string; value: string }[];
  cursor?: string;
  paginationMode?: 'auto' | 'offset';
};

export type RunQueryInput = {
  requestId?: string;
  query: string;
  params?: unknown[];
};

export type QueryExportInput = Omit<RunQueryInput, 'requestId'> & {
  id: string;
  path: string;
};

export type QueryExportResult = {
  rows: number;
  bytes: number;
  path: string;
  cancelled: boolean;
};

export type TestConnectionResult = {
  success: boolean;
  message?: string;
  serverVersion?: string;
  latencyMs?: number;
};

// SQL adapter contract
export interface SqlAdapter {
  testConnection(): Promise<TestConnectionResult>;
  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database?: string): Promise<SchemaInfo[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  getTableColumns(tableId: string): Promise<ColumnInfo[]>;
  getTableIndexes(tableId: string): Promise<IndexInfo[]>;
  getCompletions(schema?: string): Promise<TableCompletions[]>;
  previewRows(input: PreviewRowsInput): Promise<QueryResult>;
  runQuery(input: RunQueryInput): Promise<QueryResult>;
  close(): Promise<void>;
  searchSchema?(input: SchemaSearchInput): Promise<SchemaSearchMatch[]>;
  getIndexStats?(tableId: string): Promise<IndexStats[]>;
  getTableStats?(tableId: string): Promise<TableStats>;
  getDatabaseSizes?(schema?: string): Promise<DatabaseSize[]>;
  getActiveConnections?(): Promise<ConnectionInfo[]>;
}

export type IndexStats = {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  method?: string;
  sizeBytes: number;
  scans: number;
  reads: number;
  usagePercent: number;
};

export type TableStats = {
  tableId: string;
  name: string;
  schema: string;
  rowEstimate: number;
  totalBytes: number;
  indexesBytes: number;
  toastBytes: number;
  bloatBytes: number;
  bloatPercent: number;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
  lastAnalyze: string | null;
  lastAutoanalyze: string | null;
  vacuumCount: number;
  autovacuumCount: number;
  nLiveTup: number;
  nDeadTup: number;
};

export type DatabaseSize = {
  schema: string;
  table: string;
  sizeBytes: number;
  indexBytes: number;
  totalBytes: number;
  rowEstimate: number;
};

export type ConnectionInfo = {
  pid: number;
  usename: string;
  applicationName: string;
  clientAddr: string | null;
  backendStart: string;
  state: string;
  query: string | null;
  queryStart: string | null;
  waitEventType: string | null;
  waitEvent: string | null;
  durationSeconds: number;
};

// Redis types
export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream';

export type KeyEntry = {
  key: string;
  type: RedisKeyType;
  ttl: number;
  sizeBytes?: number;
};

export type KeyPage = {
  keys: KeyEntry[];
  cursor: number;
  done: boolean;
};

export type RedisValue = {
  key: string;
  type: RedisKeyType;
  ttl: number;
  value: unknown;
};

export type ScanKeysInput = {
  requestId?: string;
  pattern?: string;
  count?: number;
  cursor?: number;
};

export type GetKeyInput = {
  key: string;
};

export type GetTtlInput = {
  key: string;
};

export type RedisStats = {
  version: string;
  connectedClients: number;
  blockedClients: number;
  totalConnections: number;
  totalCommands: number;
  usedMemory: number;
  usedMemoryPeak: number;
  maxMemory?: number;
  totalKeys: number;
  expiringKeys: number;
  avgTtl: number;
  uptimeSeconds: number;
  hitRate?: number;
};

export interface RedisAdapter {
  testConnection(): Promise<TestConnectionResult>;
  scanKeys(input: ScanKeysInput): Promise<KeyPage>;
  getKey(input: GetKeyInput): Promise<RedisValue>;
  getTtl(input: GetTtlInput): Promise<number>;
  getStats(): Promise<RedisStats>;
  runCommand(command: string): Promise<RedisCommandResult>;
  close(): Promise<void>;
}

export type RedisCommandResult = {
  result: unknown;
  command: string;
  durationMs: number;
};

// MongoDB types
export type CollectionInfo = {
  name: string;
  type: 'collection' | 'view' | 'timeseries';
  documentCount?: number;
};

export type DocumentResult = {
  documents: Record<string, unknown>[];
  totalCount?: number;
  countMode?: string;
  hasMore: boolean;
  payloadBytes?: number;
  limitReason?: string;
  durationMs: number;
};

export type FindDocumentsInput = {
  requestId?: string;
  collection: string;
  database?: string;
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
  search?: string;
};

export type AggregateInput = {
  requestId?: string;
  collection: string;
  database?: string;
  pipeline: Record<string, unknown>[];
  limit?: number;
  skip?: number;
};

export type MongoCommandRequest = {
  database?: string;
  command: Record<string, unknown>;
  requestId?: string;
};

export type RedisCommandRequest = {
  command: string;
  requestId?: string;
};

export type RedisKeyRequest = GetKeyInput & { requestId?: string };

export interface MongoAdapter {
  testConnection(): Promise<TestConnectionResult>;
  listDatabases(): Promise<DatabaseInfo[]>;
  listCollections(database?: string): Promise<CollectionInfo[]>;
  findDocuments(input: FindDocumentsInput): Promise<DocumentResult>;
  aggregate(input: AggregateInput): Promise<DocumentResult>;
  runCommand(database: string, command: Record<string, unknown>): Promise<unknown>;
  deleteDocument(
    database: string,
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<{ deletedCount: number }>;
  updateDocument(
    database: string,
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount: number; modifiedCount: number }>;
  getCollectionStats(
    database: string,
    collection: string,
  ): Promise<{ documentCount: number; indexes: { name: string; key: Record<string, unknown>; unique: boolean }[] }>;
  close(): Promise<void>;
}

// AI types
export type AIProvider = 'ollama-local' | 'ollama-cloud' | 'openai' | '9router' | 'deepseek' | 'gemini';

export type AIProviderConfig = {
  enabled: boolean;
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

export type AISettings = {
  activeProvider: AIProvider;
  /** Null/absent keeps provider-based chat; otherwise one fixed ACP preset. */
  activeChatAgent?: AcpAgentId | null;
  providers: Record<AIProvider, AIProviderConfig>;
};

export type AIChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AIChatRequest = {
  connectionId?: string;
  mongoDatabase?: string;
  messages: AIChatMessage[];
  latestMessage?: AIChatMessage;
  provider?: AIProvider;
  model?: string;
};

/** Identifiers for the three schema-tree right-click AI actions. */
export type AiSchemaAction = 'explain-schema' | 'generate-test-data' | 'suggest-index';

// Health check
export type HealthStatus = {
  status: 'ok';
  uptime: number;
  version: string;
};

// Error response
export type ApiError = {
  error: string;
  message: string;
  statusCode: number;
};

// Query history
export type QueryHistoryEntry = {
  id: string;
  connectionId: string;
  query: string;
  executedAt: string;
  durationMs?: number;
  rowCount?: number;
  favorite: boolean;
  name?: string;
};

// SQL safety check constants and helper
export const DESTRUCTIVE_KEYWORDS = [
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'INSERT',
  'INTO',
  'UPDATE',
  'DELETE',
  'MERGE',
  'GRANT',
  'REVOKE',
];

export const SAFE_KEYWORDS = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN'];

// ORDER BY identifiers cannot be parameterized, so accept only names returned
// by schema metadata before any adapter interpolates them into a SQL statement.
export function isAllowedSortColumn(value: string | undefined, columns: readonly Pick<ColumnInfo, 'name'>[]): boolean {
  return value === undefined || columns.some((column) => column.name === value);
}

/**
 * Remove SQL noise (string literals, comments, dollar-quoted text) so that
 * keyword checks only inspect actual SQL tokens. Replaces noise with spaces
 * to preserve word boundaries. This is a heuristic, not a parser.
 */
function stripSqlNoise(sql: string): string {
  return (
    sql
      // Dollar-quoted strings: $$...$$ or $tag$...$tag$ — backreference ensures matching delimiters
      .replace(/(\$\w*\$)[\s\S]*?\1/g, ' ')
      // Block comments: /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // Line comments: -- ... to end of line
      .replace(/--[^\n]*/g, ' ')
      // Single-quoted strings: '...' (with '' as escaped quote)
      .replace(/'(?:[^']|'')*'/g, ' ')
      // Double-quoted identifiers: "..." (with "" as escaped quote)
      .replace(/"(?:[^"]|"")*"/g, ' ')
  );
}

export function isQuerySafe(sql: string): { safe: boolean; reason?: string } {
  const stripped = stripSqlNoise(sql);
  const normalized = stripped.trim().toUpperCase();

  if (!normalized) return { safe: true };

  // Reject statement chains because checking only the first command would let
  // a read-only query hide a second mutating command behind a semicolon.
  const statement = normalized.endsWith(';') ? normalized.slice(0, -1) : normalized;
  if (statement.includes(';')) {
    return { safe: false, reason: 'Only one read-only statement can run automatically' };
  }

  for (const kw of DESTRUCTIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`);
    if (regex.test(normalized)) {
      return { safe: false, reason: `${kw} statements are not allowed in read-only mode` };
    }
  }

  for (const kw of SAFE_KEYWORDS) {
    const regex = new RegExp(`^\\b${kw}\\b`);
    if (regex.test(statement)) {
      return { safe: true };
    }
  }

  return { safe: false, reason: 'Only read-only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN statements are allowed' };
}
