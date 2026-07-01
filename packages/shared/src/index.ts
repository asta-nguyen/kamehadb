// Zod schemas, DbKind, and related types
export * from './schemas.js';
// Shared types (used by both BE and FE)
export * from './types.js';
// Schema diff/term expansion tools
export * from './schema-tools.js';
export * from './constants.js';
export * from './utils.js';

// FE-only input types (not used by the sidecar)
export type PostgresVectorSearchInput = {
  table: string;
  schema?: string;
  column: string;
  vector: number[];
  filter?: string;
  metric?: 'l2' | 'cosine' | 'inner_product';
  limit?: number;
};

export type PostgresVectorSampleInput = {
  table: string;
  schema?: string;
  column: string;
  limit?: number;
};

export type SqliteVecSearchInput = {
  table: string;
  column: string;
  vector: number[];
  filter?: string;
  metric?: 'cosine' | 'l2' | 'inner_product';
  limit?: number;
};

export type SqlServerVecSearchInput = {
  schema: string;
  table: string;
  column: string;
  vector: number[];
  filter?: string;
  metric?: 'cosine' | 'euclidean' | 'dot';
  limit?: number;
};
