import { EventsOn } from '../../wailsjs/runtime/runtime';
import {
  CheckAllHealth,
  CheckConnectionHealth,
  CreateConnection,
  DeleteConnection,
  GetConnection,
  ListConnections,
  SetConnectionMCPEnabled,
  TestConnection,
  UpdateConnection,
  BackupFileDatabase,
  RestoreFileDatabase,
} from '../../wailsjs/go/api/ConnectionsService';
import {
  CancelQuery,
  GetActiveConnections,
  GetCompletions,
  GetDatabaseSizes,
  GetIndexStats,
  GetTableColumns,
  GetTableIndexes,
  GetTableStats,
  ListSchemas,
  ListTables,
  PreviewRows,
  RunQuery,
  SearchSchema,
} from '../../wailsjs/go/api/SqlService';
import {
  CaptureSchemaSnapshot,
  GetSchemaSnapshots,
  GetSchemaChangelog,
  GetSchemaDiff,
  GenerateMigration,
  StartSchemaWatcher,
  StopSchemaWatcher,
  GetSchemaWatcherStatus,
  StartSchemaNotifyWatcher,
  StopSchemaNotifyWatcher,
} from '../../wailsjs/go/api/SchemaService';
import type { engines, store } from '../../wailsjs/go/models';
import {
  AttachMongoShell,
  DeleteMongoDocument,
  AggregateMongoDocuments,
  FindMongoDocuments,
  GetMongoCollectionStats,
  GetMongoCompletions,
  ListMongoCollections,
  ListMongoDatabases,
  PingMongoShell,
  ResizeMongoShell,
  RunMongoCommand,
  StartMongoShell,
  StopMongoShell,
  UpdateMongoDocument,
  WriteMongoShell,
} from '../../wailsjs/go/api/MongoService';
import {
  GetRedisKey,
  GetRedisStats,
  GetRedisTTL,
  RunRedisCommand,
  ScanRedisKeys,
} from '../../wailsjs/go/api/RedisService';
import {
  CancelChat,
  ClearChatHistory,
  ClearSchemaCache,
  GetAISettings,
  GetChatHistory,
  ListModels,
  SaveAISettings,
  StartChat,
} from '../../wailsjs/go/api/AiService';
import {
  DeleteQueryHistory,
  GetQueryHistory,
  SaveQueryHistory,
  UpdateQueryHistory,
} from '../../wailsjs/go/api/QueryHistoryService';
import {
  GetMCPAccounts,
  GetMCPSettings,
  PrepareMCPAccount,
  ProvisionMCPAccount,
  RetryMCPListener,
  RevokeMCPAccount,
  RotateMCPToken,
  UpdateMCPPort,
} from '../../wailsjs/go/api/McpService';

type ConnectionProfile = import('@kamehadb/shared').ConnectionProfile;
type HealthResults = Record<string, { success: boolean; latencyMs?: number; message?: string }>;

export const api = {
  listConnections: () => ListConnections() as Promise<ConnectionProfile[]>,

  getConnection: (id: string) => GetConnection(id) as Promise<ConnectionProfile>,

  backupFileDatabase: (connectionId: string, input: import('@kamehadb/shared').FileDatabaseBackupRequest) =>
    BackupFileDatabase(connectionId, input.outputPath) as Promise<
      import('@kamehadb/shared').FileDatabaseMaintenanceResult
    >,

  restoreFileDatabase: (connectionId: string, input: import('@kamehadb/shared').FileDatabaseRestoreRequest) =>
    RestoreFileDatabase(connectionId, input.inputPath) as Promise<
      import('@kamehadb/shared').FileDatabaseMaintenanceResult
    >,

  createConnection: (input: import('@kamehadb/shared').CreateConnectionProfileInput) =>
    CreateConnection(input as store.ProfileInput) as Promise<ConnectionProfile>,

  updateConnection: (id: string, input: import('@kamehadb/shared').UpdateConnectionProfileInput) =>
    UpdateConnection(id, input as store.ProfileInput) as Promise<ConnectionProfile>,

  deleteConnection: (id: string) => DeleteConnection(id),

  testConnection: (input: import('@kamehadb/shared').CreateConnectionProfileInput) =>
    TestConnection(input as store.ProfileInput) as Promise<import('@kamehadb/shared').TestConnectionResult>,

  checkConnectionHealth: (id: string) =>
    CheckConnectionHealth(id) as Promise<import('@kamehadb/shared').TestConnectionResult>,

  checkAllConnectionHealth: () => CheckAllHealth() as Promise<HealthResults>,

  // Single health stream for all connections — the SSE /connections/health
  // stream, now a Wails event. Returns an unsubscribe function.
  onConnectionHealth: (handler: (results: HealthResults) => void) =>
    EventsOn('connections:health', handler as (data: unknown) => void),

  getAISettings: () => GetAISettings() as Promise<import('@kamehadb/shared').AISettings>,

  // Bound calls have no AbortSignal — the third arg is accepted for
  // call-site compatibility and ignored.
  fetchAvailableModels: (baseUrl: string, apiKey?: string, _signal?: AbortSignal) =>
    ListModels(baseUrl, apiKey ?? '').then((models) => ({ models })),

  saveAISettings: (input: import('@kamehadb/shared').AISettings) => SaveAISettings(input as never),

  getChatHistory: (connectionId: string, limit = 50, mongoDatabase?: string) =>
    GetChatHistory(connectionId, limit, mongoDatabase ?? '') as Promise<{
      messages: {
        id: string;
        connectionId: string;
        mongoDatabase?: string;
        role: 'user' | 'assistant';
        content: string;
        createdAt: string;
      }[];
    }>,

  clearChatHistory: (connectionId: string, mongoDatabase?: string) =>
    ClearChatHistory(connectionId, mongoDatabase ?? ''),

  clearSchemaCache: (connectionId: string, mongoDatabase?: string) =>
    ClearSchemaCache(connectionId, mongoDatabase ?? ''),

  // AI chat — StartChat returns a request id; tokens arrive on the
  // `chat:<id>` event ({type:'content'|'done'|'error'}).
  startChat: (input: {
    connectionId?: string;
    mongoDatabase?: string;
    tableId?: string;
    messages: { role: string; content: string }[];
    provider?: string;
    model?: string;
  }) => StartChat(input as never) as Promise<string>,

  cancelChat: (requestId: string) => CancelChat(requestId),

  onChatEvent: (requestId: string, handler: (ev: { type: string; delta?: string; message?: string }) => void) =>
    EventsOn(`chat:${requestId}`, handler as (data: unknown) => void),

  // Query history (bound QueryHistoryService — replaces /query-history/*)
  getQueryHistory: (connectionId: string, limit: number, favoritesOnly: boolean) =>
    GetQueryHistory(connectionId, limit, favoritesOnly) as Promise<import('@kamehadb/shared').QueryHistoryEntry[]>,

  saveQueryHistory: (connectionId: string, input: import('@kamehadb/shared').SaveQueryHistoryInput) =>
    SaveQueryHistory(connectionId, input as never) as Promise<import('@kamehadb/shared').QueryHistoryEntry>,

  updateQueryHistory: (id: string, input: import('@kamehadb/shared').UpdateQueryHistoryInput) =>
    UpdateQueryHistory(id, input as never),

  deleteQueryHistory: (id: string) => DeleteQueryHistory(id),

  // SQL browse + query (bound SqlService — replaces /sql/* routes)
  listSqlSchemas: (connectionId: string) =>
    ListSchemas(connectionId) as Promise<import('@kamehadb/shared').SchemaInfo[]>,

  listTables: (connectionId: string, schema?: string) =>
    ListTables(connectionId, schema ?? '') as Promise<import('@kamehadb/shared').TableInfo[]>,

  getTableColumns: (connectionId: string, tableId: string) =>
    GetTableColumns(connectionId, tableId) as Promise<import('@kamehadb/shared').ColumnInfo[]>,

  getTableIndexes: (connectionId: string, tableId: string) =>
    GetTableIndexes(connectionId, tableId) as Promise<import('@kamehadb/shared').IndexInfo[]>,

  getCompletions: (connectionId: string, schema?: string) =>
    GetCompletions(connectionId, schema ?? '') as Promise<{
      tables: import('@kamehadb/shared').TableCompletions[];
    }>,

  previewRows: (connectionId: string, input: import('@kamehadb/shared').PreviewRowsInput) =>
    PreviewRows(connectionId, input as engines.PreviewRowsInput) as Promise<import('@kamehadb/shared').QueryResult>,

  runQuery: (connectionId: string, query: string, params?: unknown[]) =>
    RunQuery(connectionId, { query, params } as engines.RunQueryInput) as Promise<
      import('@kamehadb/shared').QueryResult
    >,

  cancelQuery: (connectionId: string) => CancelQuery(connectionId),

  searchSchema: (connectionId: string, query: string, schema?: string, limit?: number) =>
    SearchSchema(connectionId, query, schema ?? '', limit ?? -1) as Promise<
      import('@kamehadb/shared').SchemaSearchMatch[]
    >,

  // PostgreSQL stats
  getTableStats: (connectionId: string, tableId: string) =>
    GetTableStats(connectionId, tableId) as Promise<import('@kamehadb/shared').TableStats>,

  getIndexStats: (connectionId: string, tableId: string) =>
    GetIndexStats(connectionId, tableId) as Promise<import('@kamehadb/shared').IndexStats[]>,

  getDatabaseSizes: (connectionId: string, schema?: string) =>
    GetDatabaseSizes(connectionId, schema ?? '') as Promise<import('@kamehadb/shared').DatabaseSize[]>,

  getActiveConnections: (connectionId: string) =>
    GetActiveConnections(connectionId) as Promise<import('@kamehadb/shared').ConnectionInfo[]>,

  captureSchemaSnapshot: (connectionId: string) =>
    CaptureSchemaSnapshot(connectionId) as Promise<{ id: string; capturedAt: string; tableCount: number }>,

  getSchemaSnapshots: (connectionId: string) =>
    GetSchemaSnapshots(connectionId) as Promise<{
      snapshots: readonly import('@kamehadb/shared').SchemaSnapshotSummary[];
    }>,

  getSchemaChangelog: (connectionId: string) =>
    GetSchemaChangelog(connectionId) as Promise<import('@kamehadb/shared').SchemaChangelog>,

  getSchemaDiff: (connectionId: string, input: import('@kamehadb/shared').SchemaDiffInput) =>
    GetSchemaDiff(connectionId, input as never) as Promise<import('@kamehadb/shared').SchemaDiffResult>,

  generateMigration: (connectionId: string, input: import('@kamehadb/shared').MigrationInput) =>
    GenerateMigration(connectionId, input as never) as Promise<import('@kamehadb/shared').MigrationResult>,

  startSchemaWatcher: (connectionId: string, intervalMs?: number) =>
    StartSchemaWatcher(connectionId, intervalMs ?? 0) as Promise<{ ok: boolean }>,

  stopSchemaWatcher: (connectionId: string) => StopSchemaWatcher(connectionId) as Promise<{ ok: boolean }>,

  getSchemaWatcherStatus: (connectionId: string) =>
    GetSchemaWatcherStatus(connectionId) as Promise<import('@kamehadb/shared').SchemaWatcherStatus>,

  startSchemaNotifyWatcher: (connectionId: string) =>
    StartSchemaNotifyWatcher(connectionId) as Promise<{ ok: boolean }>,

  stopSchemaNotifyWatcher: (connectionId: string) => StopSchemaNotifyWatcher(connectionId) as Promise<{ ok: boolean }>,

  // MongoDB API
  listMongoDatabases: (connectionId: string) =>
    ListMongoDatabases(connectionId) as Promise<import('@kamehadb/shared').DatabaseInfo[]>,

  listMongoCollections: (connectionId: string, database?: string) =>
    ListMongoCollections(connectionId, database ?? '') as Promise<import('@kamehadb/shared').CollectionInfo[]>,

  findMongoDocuments: (connectionId: string, input: import('@kamehadb/shared').FindDocumentsInput) =>
    FindMongoDocuments(connectionId, input as never) as Promise<import('@kamehadb/shared').DocumentResult>,

  aggregateMongoDocuments: (
    connectionId: string,
    input: {
      collection: string;
      database?: string;
      pipeline: Record<string, unknown>[];
      skip?: number;
      limit?: number;
    },
  ) => AggregateMongoDocuments(connectionId, input as never) as Promise<import('@kamehadb/shared').DocumentResult>,

  deleteMongoDocument: (
    connectionId: string,
    input: { collection: string; database?: string; filter: Record<string, unknown> },
  ) => DeleteMongoDocument(connectionId, input as never) as Promise<{ deletedCount: number }>,

  updateMongoDocument: (
    connectionId: string,
    input: { collection: string; database?: string; filter: Record<string, unknown>; update: Record<string, unknown> },
  ) =>
    UpdateMongoDocument(connectionId, input as never) as Promise<{
      matchedCount: number;
      modifiedCount: number;
    }>,

  getMongoCollectionStats: (connectionId: string, database: string, collection: string) =>
    GetMongoCollectionStats(connectionId, database, collection) as Promise<{
      documentCount: number;
      indexes: { name: string; key: Record<string, unknown>; unique: boolean }[];
    }>,

  // Redis API
  getRedisStats: (connectionId: string) =>
    GetRedisStats(connectionId) as Promise<import('@kamehadb/shared').RedisStats>,

  scanRedisKeys: (connectionId: string, input: { pattern?: string; count?: number; cursor?: number }) =>
    ScanRedisKeys(connectionId, input as never) as Promise<import('@kamehadb/shared').KeyPage>,

  getRedisKey: (connectionId: string, key: string) =>
    GetRedisKey(connectionId, key) as Promise<import('@kamehadb/shared').RedisValue>,

  getRedisTTL: (connectionId: string, key: string) => GetRedisTTL(connectionId, key) as Promise<{ ttl: number }>,

  runRedisCommand: (connectionId: string, command: string) =>
    RunRedisCommand(connectionId, command) as Promise<import('@kamehadb/shared').RedisCommandResult>,

  // MongoDB shell — PTY sessions on the Go side; output streams over the
  // `terminal:<sessionId>` Wails event instead of SSE.
  startMongoShell: (connectionId: string, cols = 80, rows = 24) =>
    StartMongoShell(connectionId, cols, rows) as Promise<{ sessionId: string }>,

  /** Returns buffered output captured before the stream attached. */
  attachMongoShell: (sessionId: string) => AttachMongoShell(sessionId) as Promise<string>,

  writeMongoShell: (sessionId: string, data: string) => WriteMongoShell(sessionId, data) as Promise<void>,

  /** Whether the PTY session still exists and runs (replaces the 204/404 probe). */
  pingMongoShell: (sessionId: string) => PingMongoShell(sessionId) as Promise<boolean>,

  stopMongoShell: (sessionId: string) => StopMongoShell(sessionId) as Promise<void>,

  resizeMongoShell: (sessionId: string, cols: number, rows: number) =>
    ResizeMongoShell(sessionId, cols, rows) as Promise<void>,

  /** Subscribe to a shell's live output/exit events. Returns an unsubscribe. */
  onTerminalOutput: (sessionId: string, cb: (payload: { type: string; data?: string; code?: number }) => void) =>
    EventsOn(`terminal:${sessionId}`, cb),

  getMongoCompletions: (connectionId: string, database?: string) =>
    GetMongoCompletions(connectionId, database ?? '') as Promise<{
      collections: { name: string; fields: string[] }[];
    }>,

  // MongoDB command
  runMongoCommand: (connectionId: string, database: string, command: Record<string, unknown>) =>
    RunMongoCommand(connectionId, database, command) as Promise<unknown>,

  // Read-only MCP settings
  getMcpSettings: () => GetMCPSettings() as Promise<import('@kamehadb/shared').McpSettingsResponse>,

  updateMcpPort: (port: number) => UpdateMCPPort(port) as Promise<import('@kamehadb/shared').McpSettingsResponse>,

  retryMcpListener: () => RetryMCPListener() as Promise<import('@kamehadb/shared').McpSettingsResponse>,

  rotateMcpToken: () => RotateMCPToken() as Promise<import('@kamehadb/shared').McpSettingsResponse>,

  getMcpAccounts: () => GetMCPAccounts() as Promise<import('@kamehadb/shared').McpManagedAccountsResponse>,

  prepareMcpAccount: (profileId: string) =>
    PrepareMCPAccount(profileId) as Promise<{
      profileId: string;
      state: import('@kamehadb/shared').McpManagedAccountState;
    }>,

  provisionMcpAccount: (profileId: string) =>
    ProvisionMCPAccount(profileId) as Promise<{
      profileId: string;
      state: import('@kamehadb/shared').McpManagedAccountState;
    }>,

  revokeMcpAccount: (profileId: string) =>
    RevokeMCPAccount(profileId) as Promise<{ profileId: string; revoked: boolean }>,

  setConnectionMcpEnabled: (connectionId: string, enabled: boolean) =>
    SetConnectionMCPEnabled(connectionId, enabled) as Promise<Pick<ConnectionProfile, 'id' | 'mcpEnabled'>>,
};
