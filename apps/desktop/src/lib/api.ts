import { runGUIRequest } from './gui-request';
import { EventsOn, BrowserOpenURL } from '../../wailsjs/runtime/runtime';
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
  CancelRequest,
  CancelExport,
  ExportQueryCSV,
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
import type { engines, mongo, redis, store, api as bindingModels } from '../../wailsjs/go/models';
import { PickSaveFile, SaveTextFile } from '../../wailsjs/go/main/App';
import {
  AttachMongoShell,
  CountMongoDocuments,
  DeleteMongoDocument,
  AggregateMongoDocuments,
  FindMongoDocuments,
  GetMongoCollectionStats,
  GetMongoCompletions,
  ListMongoCollections,
  ListMongoDatabases,
  PingMongoShell,
  ResizeMongoShell,
  RunMongoCommandWithRequest,
  StartMongoShell,
  StopMongoShell,
  UpdateMongoDocument,
  WriteMongoShell,
} from '../../wailsjs/go/api/MongoService';
import {
  GetRedisKeyPage,
  GetRedisKeyWithRequest,
  GetRedisStats,
  GetRedisTTL,
  ReleaseRedisCursor,
  RunRedisCommandWithRequest,
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
  ClearMCPCallHistory,
  GetMCPAccounts,
  GetMCPCallHistory,
  GetMCPSettings,
  PrepareMCPAccount,
  ProvisionMCPAccount,
  RetryMCPListener,
  RevokeMCPAccount,
  RotateMCPToken,
  SetMCPHistoryEnabled,
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

  // Keep sub-millisecond query timings in the UI, but send integer milliseconds
  // to the existing Go int64 history binding and SQLite storage field.
  saveQueryHistory: (
    connectionId: string,
    input: import('@kamehadb/shared').SaveQueryHistoryInput,
  ): Promise<import('@kamehadb/shared').QueryHistoryEntry> =>
    SaveQueryHistory(connectionId, {
      ...input,
      durationMs: input.durationMs === undefined ? undefined : Math.round(input.durationMs),
    } as never) as Promise<import('@kamehadb/shared').QueryHistoryEntry>,

  updateQueryHistory: (id: string, input: import('@kamehadb/shared').UpdateQueryHistoryInput) =>
    UpdateQueryHistory(id, input as never),

  deleteQueryHistory: (id: string) => DeleteQueryHistory(id),

  // Choose a native destination before any SQL. The optional readiness guard
  // lets an unmounted view stop after the dialog without launching a job.
  exportQueryCSV: async (
    connectionId: string,
    input: import('@kamehadb/shared').RunQueryInput,
    id: string,
    onReady?: () => boolean,
  ): Promise<import('@kamehadb/shared').QueryExportResult | null> => {
    const path = await PickSaveFile('query.csv', 'Export full query as CSV', [
      { displayName: 'CSV files', pattern: '*.csv' },
    ]);
    if (!path || onReady?.() === false) return null;
    return ExportQueryCSV(connectionId, { ...input, id, path } as bindingModels.QueryExportInput);
  },

  cancelExport: (id: string): Promise<boolean> => CancelExport(id),

  // Frontend-built exports (displayed rows, Mongo documents) have no blob
  // download on WebKitGTK: the backend picks the destination and writes the text.
  saveTextFile: (
    defaultFilename: string,
    title: string,
    content: string,
    filter: { displayName: string; pattern: string },
  ): Promise<string> => SaveTextFile(defaultFilename, title, content, [filter]),

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

  previewRows: (
    connectionId: string,
    input: import('@kamehadb/shared').PreviewRowsInput,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').QueryResult> =>
    runGUIRequest(
      (requestId) =>
        PreviewRows(connectionId, { ...input, requestId } as engines.PreviewRowsInput) as Promise<
          import('@kamehadb/shared').QueryResult
        >,
      signal,
      input.requestId,
    ),

  runQuery: (
    connectionId: string,
    query: string,
    params?: unknown[],
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').QueryResult> =>
    runGUIRequest(
      (requestId) =>
        RunQuery(connectionId, { query, params, requestId } as engines.RunQueryInput) as Promise<
          import('@kamehadb/shared').QueryResult
        >,
      signal,
    ),

  cancelQuery: (connectionId: string) => CancelQuery(connectionId),
  cancelRequest: (requestId: string): Promise<boolean> => CancelRequest(requestId),

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

  // Mongo sorts, pipelines and commands are sent as JSON text, not objects: the Go
  // side would decode objects into maps and lose the key order that a compound
  // sort, a compound index key, or a command name depends on. JSON.stringify keeps
  // insertion order, except that JavaScript lists integer-like keys ("2") first.
  findMongoDocuments: (
    connectionId: string,
    input: import('@kamehadb/shared').FindDocumentsInput,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').DocumentResult> => {
    const { sort, ...rest } = input;
    const body = { ...rest, ...(sort && Object.keys(sort).length > 0 ? { sortJson: JSON.stringify(sort) } : {}) };
    return runGUIRequest(
      (requestId) => FindMongoDocuments(connectionId, { ...body, requestId } as mongo.FindDocumentsInput),
      signal,
      input.requestId,
    );
  },

  aggregateMongoDocuments: (
    connectionId: string,
    input: import('@kamehadb/shared').AggregateInput,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').DocumentResult> => {
    const { pipeline, ...rest } = input;
    return runGUIRequest(
      (requestId) =>
        AggregateMongoDocuments(connectionId, {
          ...rest,
          pipelineJson: JSON.stringify(pipeline),
          requestId,
        } as mongo.AggregateInput),
      signal,
      input.requestId,
    );
  },

  countMongoDocuments: (
    connectionId: string,
    input: import('@kamehadb/shared').CountDocumentsInput,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').CountResult> =>
    runGUIRequest(
      (requestId) => CountMongoDocuments(connectionId, { ...input, requestId } as mongo.CountDocumentsInput),
      signal,
      input.requestId,
    ),

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

  scanRedisKeys: (
    connectionId: string,
    input: import('@kamehadb/shared').ScanKeysInput,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').KeyPage> =>
    runGUIRequest(
      (requestId) =>
        ScanRedisKeys(connectionId, { ...input, requestId } as redis.ScanKeysInput) as Promise<
          import('@kamehadb/shared').KeyPage
        >,
      signal,
      input.requestId,
    ),

  getRedisKey: (
    connectionId: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').RedisValue> =>
    runGUIRequest(
      (requestId) =>
        GetRedisKeyWithRequest(connectionId, { key, requestId }) as Promise<import('@kamehadb/shared').RedisValue>,
      signal,
    ),

  getRedisKeyPage: (
    connectionId: string,
    input: import('@kamehadb/shared').RedisValuePageInput,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').RedisValuePage> =>
    runGUIRequest(
      (requestId) =>
        GetRedisKeyPage(connectionId, { ...input, requestId } as redis.RedisValuePageInput) as Promise<
          import('@kamehadb/shared').RedisValuePage
        >,
      signal,
      input.requestId,
    ),

  releaseRedisCursor: (connectionId: string, cursor: string) =>
    ReleaseRedisCursor(connectionId, cursor) as Promise<{ released: boolean }>,

  getRedisTTL: (connectionId: string, key: string) => GetRedisTTL(connectionId, key) as Promise<{ ttl: number }>,

  runRedisCommand: (
    connectionId: string,
    command: string,
    signal?: AbortSignal,
  ): Promise<import('@kamehadb/shared').RedisCommandResult> =>
    runGUIRequest((requestId) => RunRedisCommandWithRequest(connectionId, { command, requestId }), signal),

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
  runMongoCommand: (
    connectionId: string,
    database: string,
    command: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> =>
    runGUIRequest(
      (requestId) =>
        RunMongoCommandWithRequest(connectionId, { database, commandJson: JSON.stringify(command), requestId }),
      signal,
    ),

  // Read-only MCP settings
  getMcpSettings: () => GetMCPSettings() as Promise<import('@kamehadb/shared').McpSettingsResponse>,

  getMcpCallHistory: () => GetMCPCallHistory() as Promise<import('@kamehadb/shared').McpCallHistoryResponse>,

  setMcpHistoryEnabled: (enabled: boolean) =>
    SetMCPHistoryEnabled(enabled) as Promise<import('@kamehadb/shared').McpSettingsResponse>,

  clearMcpCallHistory: () => ClearMCPCallHistory() as Promise<void>,

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

  // Open an external URL in the system's default browser with fallback. (How / Why / What)
  openBrowser: (url: string) => {
    try {
      BrowserOpenURL(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },
};
