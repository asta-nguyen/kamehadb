import { z } from "zod";

// Database kind
export type DbKind = "postgres" | "sqlite" | "mysql" | "redis";

// Connection profile (without secret)
export const ConnectionProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.enum(["postgres", "sqlite", "mysql", "redis"]),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  ssl: z.boolean().optional(),
  filePath: z.string().optional(),
  readonly: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConnectionProfile = z.infer<typeof ConnectionProfileSchema>;

// Connection profile input (for create/update, without id/timestamps)
export const CreateConnectionProfileSchema = ConnectionProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().optional(),
});
export type CreateConnectionProfileInput = z.infer<typeof CreateConnectionProfileSchema>;

export const UpdateConnectionProfileSchema = CreateConnectionProfileSchema.partial();
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

export type IndexInfo = {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
};

// API input types
export type PreviewRowsInput = {
  tableId: string;
  schema?: string;
  offset?: number;
  limit?: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
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
  previewRows(input: PreviewRowsInput): Promise<QueryResult>;
  runQuery(input: RunQueryInput): Promise<QueryResult>;
  close(): Promise<void>;
}

// Redis types
export type RedisKeyType = "string" | "hash" | "list" | "set" | "zset" | "stream";

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

// Redis adapter contract
export interface RedisAdapter {
  testConnection(): Promise<TestConnectionResult>;
  scanKeys(input: ScanKeysInput): Promise<KeyPage>;
  getKey(input: GetKeyInput): Promise<RedisValue>;
  getTtl(input: GetTtlInput): Promise<number>;
  close(): Promise<void>;
}

// Health check
export type HealthStatus = {
  status: "ok";
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
export type WorkspaceTab = {
  id: string;
  type: "table" | "query" | "redis";
  title: string;
  connectionId: string;
};

export type AppStoreState = {
  activeConnectionId: string | null;
  activeDatabaseId: string | null;
  activeSchemaId: string | null;
  activeTableId: string | null;
  openedTabs: WorkspaceTab[];
  activeTabId: string | null;
  sidebarCollapsed: boolean;
  density: "compact" | "comfortable";
};
