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
  tableId: string;
  schema?: string;
  offset?: number;
  limit?: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  filters?: { column: string; operator: string; value: string }[];
};

export type RunQueryInput = {
  query: string;
  params?: unknown[];
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
  totalCount: number;
  hasMore: boolean;
  durationMs: number;
};

export type FindDocumentsInput = {
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
  collection: string;
  database?: string;
  pipeline: Record<string, unknown>[];
  limit?: number;
  skip?: number;
};

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

// Qdrant types
export type QdrantCollection = {
  name: string;
  vectorSize?: number;
  distance?: string;
  pointsCount: number;
  status?: string;
};

export type QdrantPoint = {
  id: string | number;
  payload?: Record<string, unknown>;
  vector?: number[] | Record<string, number[]>;
};

export type QdrantPointPage = {
  points: QdrantPoint[];
  nextOffset: string | number | null;
};

export type ScrollPointsInput = {
  collection: string;
  limit?: number;
  offset?: string | number | null;
  filter?: Record<string, unknown>;
  withPayload?: boolean;
  withVector?: boolean;
};

export type RecommendInput = {
  collection: string;
  pointId: string | number;
  limit?: number;
  filter?: Record<string, unknown>;
  withPayload?: boolean;
  withVector?: boolean;
  using?: string;
};

export type QdrantSearchInput = {
  collection: string;
  vector: number[] | Record<string, number[]>;
  limit?: number;
  filter?: Record<string, unknown>;
  withPayload?: boolean;
  withVector?: boolean;
  using?: string;
};

export type QdrantSearchHit = {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: number[] | Record<string, number[]>;
};

export type QdrantSearchResult = {
  hits: QdrantSearchHit[];
  durationMs: number;
};

export type QdrantStats = {
  name: string;
  status: string;
  pointsCount: number;
  vectorsCount?: number;
  indexedVectorsCount?: number;
  segmentsCount?: number;
  vectorSize?: number;
  distance?: string;
};

export interface QdrantAdapter {
  testConnection(): Promise<TestConnectionResult>;
  listCollections(): Promise<QdrantCollection[]>;
  scrollPoints(input: ScrollPointsInput): Promise<QdrantPointPage>;
  search(input: QdrantSearchInput): Promise<QdrantSearchResult>;
  recommend(input: RecommendInput): Promise<QdrantSearchResult>;
  getStats(collection: string): Promise<QdrantStats>;
  close(): Promise<void>;
}

// PostgreSQL pgvector types
export type PostgresVectorColumn = {
  tableSchema: string;
  tableName: string;
  columnName: string;
  dimensions: number;
};

export type PostgresVectorIndex = {
  name: string;
  tableSchema: string;
  tableName: string;
  columnName: string;
  method: 'ivfflat' | 'hnsw';
  operator: 'l2' | 'cosine' | 'inner_product';
};

export type PostgresVectorCapability = {
  available: boolean;
  version: string | null;
  columns: PostgresVectorColumn[];
  indexes: PostgresVectorIndex[];
};

export type PostgresVectorSearchHit = {
  id: string | number;
  score: number;
  row: Record<string, unknown>;
};

export type PostgresVectorSearchResult = {
  hits: PostgresVectorSearchHit[];
  durationMs: number;
};

export type PostgresVectorSamplePoint = {
  id: string | number;
  vector: number[];
  payload: Record<string, unknown>;
};

export type PostgresVectorSampleResult = {
  points: PostgresVectorSamplePoint[];
  dimensions: number;
};

// sqlite-vec types (shared between BE and FE)
export type SqliteVecColumn = {
  tableName: string;
  columnName: string;
  dimensions: number;
};

export type SqliteVecCapability = {
  available: boolean;
  version: string | null;
  columns: SqliteVecColumn[];
  metadataColumns: Record<string, string[]>;
};

export type SqliteVecSearchHit = {
  id: string | number;
  score: number;
  row: Record<string, unknown>;
};

export type SqliteVecSearchResult = {
  hits: SqliteVecSearchHit[];
  durationMs: number;
};

// TigerBeetle types
export type TigerBeetleAccount = {
  id: string;
  debitsPending: string;
  debitsPosted: string;
  creditsPending: string;
  creditsPosted: string;
  userData128: string;
  userData64: string;
  userData32: number;
  reserved: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: string;
};

export type TigerBeetleTransfer = {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  pendingId: string;
  userData128: string;
  userData64: string;
  userData32: number;
  timeout: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: string;
};

export type TigerBeetleAccountBalance = {
  debitsPending: string;
  debitsPosted: string;
  creditsPending: string;
  creditsPosted: string;
  timestamp: string;
};

export type CreateTigerBeetleAccountInput = {
  id: string;
  ledger: number;
  code: number;
  flags?: number;
  userData128?: string;
  userData64?: string;
  userData32?: number;
  reserved?: number;
};

export type CreateTigerBeetleTransferInput = {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  ledger: number;
  code: number;
  flags?: number;
  pendingId?: string;
  userData128?: string;
  userData64?: string;
  userData32?: number;
  timeout?: number;
};

export type TigerBeetleCreateResult = {
  index: number;
  status: string;
  timestamp?: string;
};

export type TigerBeetleExplorerData = {
  accounts: TigerBeetleAccount[];
};

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
export const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SIDECAR_AUTH_HEADER = 'X-KamehaDB-Token';
export const SIDECAR_AUTH_TOKEN_QUERY_PARAM = 'token';

// ORDER BY identifiers cannot be parameterized, so validate raw API input
// before any adapter interpolates it into a SQL statement.
export function isSafeSqlIdentifier(value: string): boolean {
  return SQL_IDENTIFIER_PATTERN.test(value);
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
