import type {
  SqlAdapter,
  QueryColumn,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  CollectionInfo,
} from '@kamehadb/shared';
import type { McpManagedCredentialBundle } from '@kamehadb/shared';

/** Bounded SQL read contract. `maxRows` is the caller's row cap, excluding the truncation probe row. */
export type BoundedQueryInput = {
  query: string;
  maxRows: number;
};

export type BoundedQueryResult = {
  columns: QueryColumn[];
  rows: unknown[][];
  durationMs: number;
  truncated: boolean;
};

/** SQL adapter extension used only by MCP. The UI keeps using the plain SqlAdapter contract. */
export interface BoundedSqlRead {
  runQueryBounded(input: BoundedQueryInput): Promise<BoundedQueryResult>;
}

/** Engine adapters satisfy this when the MCP factory creates them. */
export type BoundedSqlAdapter = SqlAdapter & BoundedSqlRead;

/** Narrow read-only SQL surface exposed to MCP tools. Deliberately excludes previewRows and runQuery. */
export interface McpSqlAdapter {
  listDatabases(): Promise<DatabaseInfo[]>;
  listSchemas(database?: string): Promise<SchemaInfo[]>;
  listTables(database?: string, schema?: string): Promise<TableInfo[]>;
  getTableColumns(table: string, database?: string, schema?: string): Promise<ColumnInfo[]>;
  runQueryBounded(input: BoundedQueryInput): Promise<BoundedQueryResult>;
  close(): Promise<void>;
}

export type BoundedMongoFindInput = {
  database?: string;
  collection: string;
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  skip?: number;
  limit: number;
};

export type BoundedMongoAggregateInput = {
  database?: string;
  collection: string;
  pipeline: Record<string, unknown>[];
  maxRows: number;
};

export type BoundedMongoResult = {
  documents: Record<string, unknown>[];
  durationMs: number;
  truncated: boolean;
};

/** Secret material is encrypted at rest and loaded into the sidecar process for MCP calls. */
export type McpManagedCredential = McpManagedCredentialBundle;

/** Mongo adapter surface exposed to MCP tools. Deliberately excludes every writing method. */
export interface McpMongoAdapter {
  listDatabases(): Promise<DatabaseInfo[]>;
  listCollections(database?: string): Promise<CollectionInfo[]>;
  findBounded(input: BoundedMongoFindInput): Promise<BoundedMongoResult>;
  aggregateBounded(input: BoundedMongoAggregateInput): Promise<BoundedMongoResult>;
  close(): Promise<void>;
}

/** Session- and request-level timeout passed by the MCP factories into the engine adapters. */
export type McpAdapterTimeoutOptions = {
  timeoutMs: number;
  /** MySQL vs MariaDB share one adapter factory but use different session timeout variables. */
  kind?: 'mysql' | 'mariadb';
};

/** Raised when an engine cannot apply a native timeout, so MCP fails closed instead of running unbounded. */
export class McpTimeoutUnavailableError extends Error {
  constructor(message = 'Native query timeout is not supported for this database') {
    super(message);
    this.name = 'McpTimeoutUnavailableError';
  }
}

/** Raised when a bounded read exceeds the MCP time budget and the reader cancelled it. */
export class QueryTimeoutError extends Error {
  constructor(message = 'Query exceeded the MCP execution budget') {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}
