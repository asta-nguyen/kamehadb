export namespace ai {
  export class ChatMessage {
    role: string;
    content: string;

    static createFrom(source: any = {}) {
      return new ChatMessage(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.role = source['role'];
      this.content = source['content'];
    }
  }
}

export namespace api {
  export class ChatInput {
    connectionId?: string;
    mongoDatabase?: string;
    tableId?: string;
    messages: ai.ChatMessage[];
    provider?: string;
    model?: string;

    static createFrom(source: any = {}) {
      return new ChatInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.connectionId = source['connectionId'];
      this.mongoDatabase = source['mongoDatabase'];
      this.tableId = source['tableId'];
      this.messages = this.convertValues(source['messages'], ai.ChatMessage);
      this.provider = source['provider'];
      this.model = source['model'];
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class CompletionsResult {
    tables: engines.TableCompletions[];

    static createFrom(source: any = {}) {
      return new CompletionsResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.tables = this.convertValues(source['tables'], engines.TableCompletions);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class MCPEnableResult {
    id: string;
    mcpEnabled: boolean;

    static createFrom(source: any = {}) {
      return new MCPEnableResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.mcpEnabled = source['mcpEnabled'];
    }
  }
  export class MongoDeleteInput {
    collection: string;
    database?: string;
    filter: Record<string, any>;

    static createFrom(source: any = {}) {
      return new MongoDeleteInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.collection = source['collection'];
      this.database = source['database'];
      this.filter = source['filter'];
    }
  }
  export class MongoUpdateInput {
    collection: string;
    database?: string;
    filter: Record<string, any>;
    update: Record<string, any>;

    static createFrom(source: any = {}) {
      return new MongoUpdateInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.collection = source['collection'];
      this.database = source['database'];
      this.filter = source['filter'];
      this.update = source['update'];
    }
  }
  export class SaveQueryHistoryInput {
    query: string;
    durationMs?: number;
    rowCount?: number;

    static createFrom(source: any = {}) {
      return new SaveQueryHistoryInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.query = source['query'];
      this.durationMs = source['durationMs'];
      this.rowCount = source['rowCount'];
    }
  }
  export class TerminalSize {
    cols: number;
    rows: number;

    static createFrom(source: any = {}) {
      return new TerminalSize(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.cols = source['cols'];
      this.rows = source['rows'];
    }
  }
  export class UpdateQueryHistoryInput {
    favorite?: boolean;
    name?: string;

    static createFrom(source: any = {}) {
      return new UpdateQueryHistoryInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.favorite = source['favorite'];
      this.name = source['name'];
    }
  }
  export class captureResult {
    id: string;
    capturedAt: string;
    tableCount: number;

    static createFrom(source: any = {}) {
      return new captureResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.capturedAt = source['capturedAt'];
      this.tableCount = source['tableCount'];
    }
  }
}

export namespace engines {
  export class ColumnForeignKey {
    schema?: string;
    table: string;
    column: string;

    static createFrom(source: any = {}) {
      return new ColumnForeignKey(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.schema = source['schema'];
      this.table = source['table'];
      this.column = source['column'];
    }
  }
  export class ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    primaryKey: boolean;
    foreignKey?: ColumnForeignKey;
    isVector?: boolean;
    vectorDimensions?: number;

    static createFrom(source: any = {}) {
      return new ColumnInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.type = source['type'];
      this.nullable = source['nullable'];
      this.default = source['default'];
      this.primaryKey = source['primaryKey'];
      this.foreignKey = this.convertValues(source['foreignKey'], ColumnForeignKey);
      this.isVector = source['isVector'];
      this.vectorDimensions = source['vectorDimensions'];
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class ConnectionInfo {
    pid: number;
    usename: string;
    applicationName: string;
    clientAddr?: string;
    backendStart: string;
    state: string;
    query?: string;
    queryStart?: string;
    waitEventType?: string;
    waitEvent?: string;
    durationSeconds: number;

    static createFrom(source: any = {}) {
      return new ConnectionInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.pid = source['pid'];
      this.usename = source['usename'];
      this.applicationName = source['applicationName'];
      this.clientAddr = source['clientAddr'];
      this.backendStart = source['backendStart'];
      this.state = source['state'];
      this.query = source['query'];
      this.queryStart = source['queryStart'];
      this.waitEventType = source['waitEventType'];
      this.waitEvent = source['waitEvent'];
      this.durationSeconds = source['durationSeconds'];
    }
  }
  export class DatabaseInfo {
    name: string;

    static createFrom(source: any = {}) {
      return new DatabaseInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
    }
  }
  export class DatabaseSize {
    schema: string;
    table: string;
    sizeBytes: number;
    indexBytes: number;
    totalBytes: number;
    rowEstimate: number;

    static createFrom(source: any = {}) {
      return new DatabaseSize(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.schema = source['schema'];
      this.table = source['table'];
      this.sizeBytes = source['sizeBytes'];
      this.indexBytes = source['indexBytes'];
      this.totalBytes = source['totalBytes'];
      this.rowEstimate = source['rowEstimate'];
    }
  }
  export class IndexInfo {
    name: string;
    columns: string[];
    unique: boolean;
    primary: boolean;
    method?: string;

    static createFrom(source: any = {}) {
      return new IndexInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.columns = source['columns'];
      this.unique = source['unique'];
      this.primary = source['primary'];
      this.method = source['method'];
    }
  }
  export class IndexStats {
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

    static createFrom(source: any = {}) {
      return new IndexStats(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.table = source['table'];
      this.columns = source['columns'];
      this.unique = source['unique'];
      this.primary = source['primary'];
      this.method = source['method'];
      this.sizeBytes = source['sizeBytes'];
      this.scans = source['scans'];
      this.reads = source['reads'];
      this.usagePercent = source['usagePercent'];
    }
  }
  export class PreviewFilter {
    column: string;
    operator: string;
    value: string;

    static createFrom(source: any = {}) {
      return new PreviewFilter(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.column = source['column'];
      this.operator = source['operator'];
      this.value = source['value'];
    }
  }
  export class PreviewRowsInput {
    tableId: string;
    schema?: string;
    offset?: number;
    limit?: number;
    sortColumn?: string;
    sortDirection?: string;
    search?: string;
    filters?: PreviewFilter[];

    static createFrom(source: any = {}) {
      return new PreviewRowsInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.tableId = source['tableId'];
      this.schema = source['schema'];
      this.offset = source['offset'];
      this.limit = source['limit'];
      this.sortColumn = source['sortColumn'];
      this.sortDirection = source['sortDirection'];
      this.search = source['search'];
      this.filters = this.convertValues(source['filters'], PreviewFilter);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class QueryColumn {
    name: string;
    type: string;
    nullable?: boolean;

    static createFrom(source: any = {}) {
      return new QueryColumn(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.type = source['type'];
      this.nullable = source['nullable'];
    }
  }
  export class QueryResult {
    columns: QueryColumn[];
    rows: any[];
    rowCount: number;
    durationMs: number;
    truncated: boolean;

    static createFrom(source: any = {}) {
      return new QueryResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.columns = this.convertValues(source['columns'], QueryColumn);
      this.rows = source['rows'];
      this.rowCount = source['rowCount'];
      this.durationMs = source['durationMs'];
      this.truncated = source['truncated'];
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class RunQueryInput {
    query: string;
    params?: any[];

    static createFrom(source: any = {}) {
      return new RunQueryInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.query = source['query'];
      this.params = source['params'];
    }
  }
  export class SchemaInfo {
    name: string;

    static createFrom(source: any = {}) {
      return new SchemaInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
    }
  }
  export class SchemaSearchMatch {
    schema: string;
    table: string;
    column?: string;
    columnType?: string;
    matchType: string;

    static createFrom(source: any = {}) {
      return new SchemaSearchMatch(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.schema = source['schema'];
      this.table = source['table'];
      this.column = source['column'];
      this.columnType = source['columnType'];
      this.matchType = source['matchType'];
    }
  }
  export class TableCompletions {
    name: string;
    schema?: string;
    columns: ColumnInfo[];

    static createFrom(source: any = {}) {
      return new TableCompletions(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.schema = source['schema'];
      this.columns = this.convertValues(source['columns'], ColumnInfo);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class TableInfo {
    id: string;
    name: string;
    schema?: string;
    type?: string;
    rowEstimate?: number;

    static createFrom(source: any = {}) {
      return new TableInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.name = source['name'];
      this.schema = source['schema'];
      this.type = source['type'];
      this.rowEstimate = source['rowEstimate'];
    }
  }
  export class TableStats {
    tableId: string;
    name: string;
    schema: string;
    rowEstimate: number;
    totalBytes: number;
    indexesBytes: number;
    toastBytes: number;
    bloatBytes: number;
    bloatPercent: number;
    lastVacuum?: string;
    lastAutovacuum?: string;
    lastAnalyze?: string;
    lastAutoanalyze?: string;
    vacuumCount: number;
    autovacuumCount: number;
    nLiveTup: number;
    nDeadTup: number;

    static createFrom(source: any = {}) {
      return new TableStats(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.tableId = source['tableId'];
      this.name = source['name'];
      this.schema = source['schema'];
      this.rowEstimate = source['rowEstimate'];
      this.totalBytes = source['totalBytes'];
      this.indexesBytes = source['indexesBytes'];
      this.toastBytes = source['toastBytes'];
      this.bloatBytes = source['bloatBytes'];
      this.bloatPercent = source['bloatPercent'];
      this.lastVacuum = source['lastVacuum'];
      this.lastAutovacuum = source['lastAutovacuum'];
      this.lastAnalyze = source['lastAnalyze'];
      this.lastAutoanalyze = source['lastAutoanalyze'];
      this.vacuumCount = source['vacuumCount'];
      this.autovacuumCount = source['autovacuumCount'];
      this.nLiveTup = source['nLiveTup'];
      this.nDeadTup = source['nDeadTup'];
    }
  }
  export class TestConnectionResult {
    success: boolean;
    message?: string;
    serverVersion?: string;
    latencyMs?: number;

    static createFrom(source: any = {}) {
      return new TestConnectionResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.success = source['success'];
      this.message = source['message'];
      this.serverVersion = source['serverVersion'];
      this.latencyMs = source['latencyMs'];
    }
  }
}

export namespace logs {
  export class Entry {
    timestampMs: number;
    level: string;
    source: string;
    message: string;
    scope?: string;
    details?: string;
    stack?: string;
    url?: string;

    static createFrom(source: any = {}) {
      return new Entry(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.timestampMs = source['timestampMs'];
      this.level = source['level'];
      this.source = source['source'];
      this.message = source['message'];
      this.scope = source['scope'];
      this.details = source['details'];
      this.stack = source['stack'];
      this.url = source['url'];
    }
  }
  export class FrontendInput {
    timestampMs?: number;
    level: string;
    message: string;
    scope?: string;
    details?: string;
    stack?: string;
    url?: string;

    static createFrom(source: any = {}) {
      return new FrontendInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.timestampMs = source['timestampMs'];
      this.level = source['level'];
      this.message = source['message'];
      this.scope = source['scope'];
      this.details = source['details'];
      this.stack = source['stack'];
      this.url = source['url'];
    }
  }
  export class Snapshot {
    entries: Entry[];
    logDir: string;

    static createFrom(source: any = {}) {
      return new Snapshot(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.entries = this.convertValues(source['entries'], Entry);
      this.logDir = source['logDir'];
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
}

export namespace main {
  export class FileFilter {
    displayName: string;
    pattern: string;

    static createFrom(source: any = {}) {
      return new FileFilter(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.displayName = source['displayName'];
      this.pattern = source['pattern'];
    }
  }
}

export namespace maintenance {
  export class BackupScope {
    kind: string;
    schema?: string;
    table?: string;

    static createFrom(source: any = {}) {
      return new BackupScope(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.kind = source['kind'];
      this.schema = source['schema'];
      this.table = source['table'];
    }
  }
  export class MaintenanceResult {
    path: string;
    relatedPaths: string[];

    static createFrom(source: any = {}) {
      return new MaintenanceResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.path = source['path'];
      this.relatedPaths = source['relatedPaths'];
    }
  }
  export class StartBackupRequest {
    connectionId: string;
    outputPath: string;
    format: string;
    scope: BackupScope;

    static createFrom(source: any = {}) {
      return new StartBackupRequest(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.connectionId = source['connectionId'];
      this.outputPath = source['outputPath'];
      this.format = source['format'];
      this.scope = this.convertValues(source['scope'], BackupScope);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class StartRestoreRequest {
    connectionId: string;
    inputPath: string;
    targetDatabase: string;
    clean: boolean;

    static createFrom(source: any = {}) {
      return new StartRestoreRequest(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.connectionId = source['connectionId'];
      this.inputPath = source['inputPath'];
      this.targetDatabase = source['targetDatabase'];
      this.clean = source['clean'];
    }
  }
}

export namespace mcp {
  export class SettingsResponse {
    status: string;
    port: number;
    endpoint: string;
    token: string;
    historyEnabled: boolean;
    enabledProfiles: any[];
    message?: string;

    static createFrom(source: any = {}) {
      return new SettingsResponse(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.status = source['status'];
      this.port = source['port'];
      this.endpoint = source['endpoint'];
      this.token = source['token'];
      this.historyEnabled = source['historyEnabled'];
      this.enabledProfiles = source['enabledProfiles'];
      this.message = source['message'];
    }
  }
}

export namespace mongo {
  export class AggregateInput {
    collection: string;
    database?: string;
    pipeline: any[];
    limit?: number;
    skip?: number;

    static createFrom(source: any = {}) {
      return new AggregateInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.collection = source['collection'];
      this.database = source['database'];
      this.pipeline = source['pipeline'];
      this.limit = source['limit'];
      this.skip = source['skip'];
    }
  }
  export class CollectionInfo {
    name: string;
    type: string;
    documentCount?: number;

    static createFrom(source: any = {}) {
      return new CollectionInfo(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.type = source['type'];
      this.documentCount = source['documentCount'];
    }
  }
  export class IndexSpec {
    name: string;
    key: Record<string, any>;
    unique: boolean;

    static createFrom(source: any = {}) {
      return new IndexSpec(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.key = source['key'];
      this.unique = source['unique'];
    }
  }
  export class CollectionStats {
    documentCount: number;
    indexes: IndexSpec[];

    static createFrom(source: any = {}) {
      return new CollectionStats(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.documentCount = source['documentCount'];
      this.indexes = this.convertValues(source['indexes'], IndexSpec);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class DocumentResult {
    documents: any[];
    totalCount: number;
    hasMore: boolean;
    durationMs: number;

    static createFrom(source: any = {}) {
      return new DocumentResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.documents = source['documents'];
      this.totalCount = source['totalCount'];
      this.hasMore = source['hasMore'];
      this.durationMs = source['durationMs'];
    }
  }
  export class FindDocumentsInput {
    collection: string;
    database?: string;
    filter?: Record<string, any>;
    projection?: Record<string, any>;
    sort?: Record<string, number>;
    skip?: number;
    limit?: number;
    search?: string;

    static createFrom(source: any = {}) {
      return new FindDocumentsInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.collection = source['collection'];
      this.database = source['database'];
      this.filter = source['filter'];
      this.projection = source['projection'];
      this.sort = source['sort'];
      this.skip = source['skip'];
      this.limit = source['limit'];
      this.search = source['search'];
    }
  }
}

export namespace redis {
  export class CommandResult {
    result: any;
    command: string;
    durationMs: number;

    static createFrom(source: any = {}) {
      return new CommandResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.result = source['result'];
      this.command = source['command'];
      this.durationMs = source['durationMs'];
    }
  }
  export class KeyEntry {
    key: string;
    type: string;
    ttl: number;

    static createFrom(source: any = {}) {
      return new KeyEntry(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.key = source['key'];
      this.type = source['type'];
      this.ttl = source['ttl'];
    }
  }
  export class KeyPage {
    keys: KeyEntry[];
    cursor: number;
    done: boolean;

    static createFrom(source: any = {}) {
      return new KeyPage(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.keys = this.convertValues(source['keys'], KeyEntry);
      this.cursor = source['cursor'];
      this.done = source['done'];
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class RedisStats {
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

    static createFrom(source: any = {}) {
      return new RedisStats(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.version = source['version'];
      this.connectedClients = source['connectedClients'];
      this.blockedClients = source['blockedClients'];
      this.totalConnections = source['totalConnections'];
      this.totalCommands = source['totalCommands'];
      this.usedMemory = source['usedMemory'];
      this.usedMemoryPeak = source['usedMemoryPeak'];
      this.maxMemory = source['maxMemory'];
      this.totalKeys = source['totalKeys'];
      this.expiringKeys = source['expiringKeys'];
      this.avgTtl = source['avgTtl'];
      this.uptimeSeconds = source['uptimeSeconds'];
      this.hitRate = source['hitRate'];
    }
  }
  export class RedisValue {
    key: string;
    type: string;
    ttl: number;
    value: any;

    static createFrom(source: any = {}) {
      return new RedisValue(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.key = source['key'];
      this.type = source['type'];
      this.ttl = source['ttl'];
      this.value = source['value'];
    }
  }
  export class ScanKeysInput {
    pattern?: string;
    count?: number;
    cursor?: number;

    static createFrom(source: any = {}) {
      return new ScanKeysInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.pattern = source['pattern'];
      this.count = source['count'];
      this.cursor = source['cursor'];
    }
  }
}

export namespace schema {
  export class ChangeDescriptor {
    type: string;
    table: string;
    column?: string;
    dataType?: string;
    from?: string;
    to?: string;
    index?: string;
    columns?: string[];

    static createFrom(source: any = {}) {
      return new ChangeDescriptor(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.type = source['type'];
      this.table = source['table'];
      this.column = source['column'];
      this.dataType = source['dataType'];
      this.from = source['from'];
      this.to = source['to'];
      this.index = source['index'];
      this.columns = source['columns'];
    }
  }
  export class ChangelogEntry {
    snapshotId: string;
    capturedAt: string;
    changes: ChangeDescriptor[];

    static createFrom(source: any = {}) {
      return new ChangelogEntry(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.snapshotId = source['snapshotId'];
      this.capturedAt = source['capturedAt'];
      this.changes = this.convertValues(source['changes'], ChangeDescriptor);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class Changelog {
    entries: ChangelogEntry[];

    static createFrom(source: any = {}) {
      return new Changelog(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.entries = this.convertValues(source['entries'], ChangelogEntry);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }

  export class ValueChange {
    field: string;
    from: any;
    to: any;

    static createFrom(source: any = {}) {
      return new ValueChange(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.field = source['field'];
      this.from = source['from'];
      this.to = source['to'];
    }
  }
  export class ColumnSnapshot {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    primaryKey: boolean;

    static createFrom(source: any = {}) {
      return new ColumnSnapshot(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.type = source['type'];
      this.nullable = source['nullable'];
      this.default = source['default'];
      this.primaryKey = source['primaryKey'];
    }
  }
  export class ColumnDiff {
    type: string;
    column?: ColumnSnapshot;
    columnName?: string;
    before?: ColumnSnapshot;
    after?: ColumnSnapshot;
    changes?: ValueChange[];

    static createFrom(source: any = {}) {
      return new ColumnDiff(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.type = source['type'];
      this.column = this.convertValues(source['column'], ColumnSnapshot);
      this.columnName = source['columnName'];
      this.before = this.convertValues(source['before'], ColumnSnapshot);
      this.after = this.convertValues(source['after'], ColumnSnapshot);
      this.changes = this.convertValues(source['changes'], ValueChange);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }

  export class DiffInput {
    fromSnapshotId: string;
    toSnapshotId: string;

    static createFrom(source: any = {}) {
      return new DiffInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.fromSnapshotId = source['fromSnapshotId'];
      this.toSnapshotId = source['toSnapshotId'];
    }
  }
  export class DiffStats {
    tableAdds: number;
    tableRemovals: number;
    tableChanges: number;
    columnAdds: number;
    columnRemovals: number;
    columnChanges: number;
    indexAdds: number;
    indexRemovals: number;
    indexChanges: number;
    totalChanges: number;

    static createFrom(source: any = {}) {
      return new DiffStats(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.tableAdds = source['tableAdds'];
      this.tableRemovals = source['tableRemovals'];
      this.tableChanges = source['tableChanges'];
      this.columnAdds = source['columnAdds'];
      this.columnRemovals = source['columnRemovals'];
      this.columnChanges = source['columnChanges'];
      this.indexAdds = source['indexAdds'];
      this.indexRemovals = source['indexRemovals'];
      this.indexChanges = source['indexChanges'];
      this.totalChanges = source['totalChanges'];
    }
  }
  export class IndexDiff {
    type: string;
    index?: IndexSnapshot;
    indexName?: string;
    before?: IndexSnapshot;
    after?: IndexSnapshot;
    changes?: ValueChange[];

    static createFrom(source: any = {}) {
      return new IndexDiff(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.type = source['type'];
      this.index = this.convertValues(source['index'], IndexSnapshot);
      this.indexName = source['indexName'];
      this.before = this.convertValues(source['before'], IndexSnapshot);
      this.after = this.convertValues(source['after'], IndexSnapshot);
      this.changes = this.convertValues(source['changes'], ValueChange);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class IndexSnapshot {
    name: string;
    columns: string[];
    unique: boolean;
    primary: boolean;

    static createFrom(source: any = {}) {
      return new IndexSnapshot(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.columns = source['columns'];
      this.unique = source['unique'];
      this.primary = source['primary'];
    }
  }
  export class TableSnapshot {
    id: string;
    name: string;
    schema?: string;
    columns: ColumnSnapshot[];
    indexes: IndexSnapshot[];

    static createFrom(source: any = {}) {
      return new TableSnapshot(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.name = source['name'];
      this.schema = source['schema'];
      this.columns = this.convertValues(source['columns'], ColumnSnapshot);
      this.indexes = this.convertValues(source['indexes'], IndexSnapshot);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class TableDiff {
    type: string;
    tableId: string;
    table?: TableSnapshot;
    tableName?: string;
    schema?: string;
    columnDiffs?: ColumnDiff[];
    indexDiffs?: IndexDiff[];
    changeCount?: number;

    static createFrom(source: any = {}) {
      return new TableDiff(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.type = source['type'];
      this.tableId = source['tableId'];
      this.table = this.convertValues(source['table'], TableSnapshot);
      this.tableName = source['tableName'];
      this.schema = source['schema'];
      this.columnDiffs = this.convertValues(source['columnDiffs'], ColumnDiff);
      this.indexDiffs = this.convertValues(source['indexDiffs'], IndexDiff);
      this.changeCount = source['changeCount'];
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class SnapshotSummary {
    id: string;
    connectionId: string;
    capturedAt: string;
    tableCount: number;
    source?: string;

    static createFrom(source: any = {}) {
      return new SnapshotSummary(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.connectionId = source['connectionId'];
      this.capturedAt = source['capturedAt'];
      this.tableCount = source['tableCount'];
      this.source = source['source'];
    }
  }
  export class DiffResult {
    fromSnapshot: SnapshotSummary;
    toSnapshot: SnapshotSummary;
    tableDiffs: TableDiff[];
    stats: DiffStats;

    static createFrom(source: any = {}) {
      return new DiffResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.fromSnapshot = this.convertValues(source['fromSnapshot'], SnapshotSummary);
      this.toSnapshot = this.convertValues(source['toSnapshot'], SnapshotSummary);
      this.tableDiffs = this.convertValues(source['tableDiffs'], TableDiff);
      this.stats = this.convertValues(source['stats'], DiffStats);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }

  export class MigrationResult {
    statements: string[];
    dialect: string;
    fromSnapshot: string;
    toSnapshot: string;

    static createFrom(source: any = {}) {
      return new MigrationResult(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.statements = source['statements'];
      this.dialect = source['dialect'];
      this.fromSnapshot = source['fromSnapshot'];
      this.toSnapshot = source['toSnapshot'];
    }
  }

  export class WatcherStatus {
    cadenceRunning: boolean;
    notifyRunning: boolean;
    intervalMs: number;
    lastCaptureAt: string;

    static createFrom(source: any = {}) {
      return new WatcherStatus(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.cadenceRunning = source['cadenceRunning'];
      this.notifyRunning = source['notifyRunning'];
      this.intervalMs = source['intervalMs'];
      this.lastCaptureAt = source['lastCaptureAt'];
    }
  }
}

export namespace store {
  export class AIProviderConfig {
    enabled: boolean;
    model: string;
    baseUrl: string;
    apiKey: string;

    static createFrom(source: any = {}) {
      return new AIProviderConfig(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.enabled = source['enabled'];
      this.model = source['model'];
      this.baseUrl = source['baseUrl'];
      this.apiKey = source['apiKey'];
    }
  }
  export class AISettings {
    activeProvider: string;
    providers: Record<string, AIProviderConfig>;

    static createFrom(source: any = {}) {
      return new AISettings(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.activeProvider = source['activeProvider'];
      this.providers = this.convertValues(source['providers'], AIProviderConfig, true);
    }

    convertValues(a: any, classs: any, asMap: boolean = false): any {
      if (!a) {
        return a;
      }
      if (a.slice && a.map) {
        return (a as any[]).map((elem) => this.convertValues(elem, classs));
      } else if ('object' === typeof a) {
        if (asMap) {
          for (const key of Object.keys(a)) {
            a[key] = new classs(a[key]);
          }
          return a;
        }
        return new classs(a);
      }
      return a;
    }
  }
  export class Profile {
    id: string;
    name: string;
    kind: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    ssl: boolean;
    filePath?: string;
    color?: string;
    connectionString?: string;
    mcpEnabled: boolean;
    createdAt: string;
    updatedAt: string;

    static createFrom(source: any = {}) {
      return new Profile(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.name = source['name'];
      this.kind = source['kind'];
      this.host = source['host'];
      this.port = source['port'];
      this.database = source['database'];
      this.username = source['username'];
      this.ssl = source['ssl'];
      this.filePath = source['filePath'];
      this.color = source['color'];
      this.connectionString = source['connectionString'];
      this.mcpEnabled = source['mcpEnabled'];
      this.createdAt = source['createdAt'];
      this.updatedAt = source['updatedAt'];
    }
  }
  export class ProfileInput {
    name?: string;
    kind?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    filePath?: string;
    color?: string;
    connectionString?: string;

    static createFrom(source: any = {}) {
      return new ProfileInput(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.name = source['name'];
      this.kind = source['kind'];
      this.host = source['host'];
      this.port = source['port'];
      this.database = source['database'];
      this.username = source['username'];
      this.password = source['password'];
      this.ssl = source['ssl'];
      this.filePath = source['filePath'];
      this.color = source['color'];
      this.connectionString = source['connectionString'];
    }
  }
  export class QueryHistoryEntry {
    id: string;
    connectionId: string;
    query: string;
    executedAt: string;
    durationMs?: number;
    rowCount?: number;
    favorite: boolean;
    name?: string;

    static createFrom(source: any = {}) {
      return new QueryHistoryEntry(source);
    }

    constructor(source: any = {}) {
      if ('string' === typeof source) source = JSON.parse(source);
      this.id = source['id'];
      this.connectionId = source['connectionId'];
      this.query = source['query'];
      this.executedAt = source['executedAt'];
      this.durationMs = source['durationMs'];
      this.rowCount = source['rowCount'];
      this.favorite = source['favorite'];
      this.name = source['name'];
    }
  }
}
