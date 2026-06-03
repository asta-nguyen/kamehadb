import { z } from 'zod';

export { expandTerms, renderExpansionsForPrompt } from './term-expansion.js';
export type { TermExpansion } from './term-expansion.js';

// Database kind
export type DbKind = 'postgres' | 'sqlite' | 'mysql' | 'redis' | 'mongodb';

// Connection profile (without secret)
export const ConnectionProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.enum(['postgres', 'sqlite', 'mysql', 'redis', 'mongodb']),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  ssl: z.boolean().optional(),
  filePath: z.string().optional(),
  readonly: z.boolean().optional().default(true),
  color: z.string().optional(),
  connectionString: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConnectionProfile = z.infer<typeof ConnectionProfileSchema>;

// Connection profile input (for create/update, without id/timestamps)
const BaseCreateSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['postgres', 'sqlite', 'mysql', 'redis', 'mongodb']),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  filePath: z.string().optional(),
  readonly: z.boolean().optional().default(true),
  color: z.string().optional(),
  connectionString: z.string().optional(),
});

export const CreateConnectionProfileSchema = BaseCreateSchema.refine(
  (data) => {
    if (data.kind === 'postgres' && !data.password) {
      return false;
    }
    if (data.kind === 'mongodb' && !data.connectionString) {
      return false;
    }
    return true;
  },
  (data) => {
    if (data.kind === 'mongodb' && !data.connectionString) {
      return {
        message: 'Connection string is required for MongoDB connections',
        path: ['connectionString'],
      };
    }
    return {
      message: 'Password is required for PostgreSQL connections',
      path: ['password'],
    };
  },
);
export type CreateConnectionProfileInput = z.infer<typeof CreateConnectionProfileSchema>;

export const UpdateConnectionProfileSchema = BaseCreateSchema.partial();
export type UpdateConnectionProfileInput = z.infer<typeof UpdateConnectionProfileSchema>;

// Credential reference
export type CredentialRef = {
  connectionId: string;
  secretKey: string;
};

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
    table: string;
    column: string;
  };
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
  // Extended stats (PostgreSQL specific)
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

// Redis adapter contract
export interface RedisAdapter {
  testConnection(): Promise<TestConnectionResult>;
  scanKeys(input: ScanKeysInput): Promise<KeyPage>;
  getKey(input: GetKeyInput): Promise<RedisValue>;
  getTtl(input: GetTtlInput): Promise<number>;
  getStats(): Promise<RedisStats>;
  runCommand(command: string): Promise<RedisCommandResult>;
  close(): Promise<void>;
}

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

export type RedisCommandResult = {
  result: unknown;
  command: string;
  durationMs: number;
};

// MongoDB adapter contract
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
export type AIProvider = 'ollama-local' | 'ollama-cloud' | 'openai' | '9router';

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

export type AIChatResponse = {
  message: AIChatMessage;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

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

// TanStack Store state
export type WorkspaceTab =
  | {
      id: string;
      type: 'table' | 'query' | 'redis-query' | 'redis' | 'graph' | 'stats' | 'database-stats';
      title: string;
      connectionId: string;
      sql?: string;
      command?: string;
      autoRun?: boolean;
    }
  | {
      id: string;
      type: 'mongo';
      title: string;
      connectionId: string;
      database: string;
      collection: string;
    }
  | {
      id: string;
      type: 'mongo-query';
      title: string;
      connectionId: string;
      database: string;
      collection: string;
      pipeline?: string;
    }
  | { id: string; type: 'table-stats'; title: string; connectionId: string; tableId: string };

export type AppView = 'workspace' | 'api-settings';

export type AppStoreState = {
  activeConnectionId: string | null;
  activeDatabaseId: string | null;
  activeSchemaId: string | null;
  activeTableId: string | null;
  activeMongoDatabase: string | null;
  aiPanelConnectionId: string | null;
  openedTabs: WorkspaceTab[];
  activeTabId: string | null;
  sidebarCollapsed: boolean;
  density: 'compact' | 'comfortable';
  view: AppView;
  theme: 'light' | 'dark' | 'system';
  expandedConnections: string[];
  connectionStatus: Record<string, 'connected' | 'disconnected'>;
};

// SQL safety check constants and helper
export const DESTRUCTIVE_KEYWORDS = [
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'GRANT',
  'REVOKE',
];

export const SAFE_KEYWORDS = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN'];

export function isQuerySafe(sql: string): { safe: boolean; reason?: string } {
  const normalized = sql.trim().toUpperCase();

  // Skip empty/whitespace
  if (!normalized) return { safe: true };

  // Check for destructive keywords
  for (const kw of DESTRUCTIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`);
    if (regex.test(normalized)) {
      return { safe: false, reason: `${kw} statements are not allowed in read-only mode` };
    }
  }

  // Check for safe keywords
  for (const kw of SAFE_KEYWORDS) {
    const regex = new RegExp(`^\\b${kw}\\b`);
    if (regex.test(normalized)) {
      return { safe: true };
    }
  }

  // If it doesn't start with a recognized keyword, allow it through
  // (might be a valid expression or comment)
  return { safe: true };
}
